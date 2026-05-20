import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Job, JobOptions, Queue } from 'bull'
import { ColigadaConfig } from './interfaces/coligada-config.interface'
import {
  ColigadaSyncJobData,
  AlunoJobData,
  CancelamentoColigadaJobData,
  CancelamentoAlunoJobData,
  WebhookAlunoJobData,
} from './aluno-sync.processor'
import { AlunoTotvsDto } from '../integrations/totvs/dto/aluno-totvs.dto'
import {
  getColigadaConfigById,
  listColigadasConfig,
} from './utils/coligadas-config'

@Injectable()
export class AlunoSyncService {
  private readonly logger = new Logger(AlunoSyncService.name)
  private static readonly COLIGADAS_BLOQUEADAS_PROCEDURE = new Set([6])
  private static readonly REMOVE_ON_COMPLETE = 1000

  constructor(
    @InjectQueue('aluno-sync') private readonly alunoSyncQueue: Queue,
  ) {}

  private async addAlunoSyncJob<T>(
    name: string,
    data: T,
    options: JobOptions,
  ): Promise<Job<T>> {
    if (!options.jobId) {
      return this.alunoSyncQueue.add(name, data, options)
    }

    const existingJob = await this.alunoSyncQueue.getJob(options.jobId)
    if (existingJob) {
      const state = await existingJob.getState()

      if (state === 'completed' || state === 'failed') {
        await existingJob.remove()
        this.logger.debug(
          `Removendo job terminal ${options.jobId} (${state}) antes de reenfileirar`,
        )
      } else {
        this.logger.warn(
          `Job ${options.jobId} já existe em estado ${state}; mantendo deduplicação`,
        )
        return existingJob as Job<T>
      }
    }

    return this.alunoSyncQueue.add(name, data, options)
  }

  private buildAlunoWebhookJobId(data: {
    CD_Periodo_Letivo: string
    CD_Coligada: number
    CD_Registro_Academico: string
  }): string {
    return [
      'webhook-aluno',
      data.CD_Periodo_Letivo,
      data.CD_Coligada,
      data.CD_Registro_Academico,
    ].join(':')
  }

  private buildAlunoCancelamentoJobId(data: {
    CD_Periodo_Letivo: string
    CD_Coligada: number
    CD_Registro_Academico: string
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'
  }): string {
    return [
      'cancelamento-aluno',
      data.TP_Origem_Disparo,
      data.CD_Periodo_Letivo,
      data.CD_Coligada,
      data.CD_Registro_Academico,
    ].join(':')
  }

  /**
   * Adiciona jobs na fila para sincronizar alunos de todas as coligadas (um job por coligada)
   */
  async syncAlunosPorColigada(): Promise<void> {
    const periodoLetivo = process.env.PERIODO_LETIVO
    if (!periodoLetivo) {
      this.logger.error('Variável de ambiente PERIODO_LETIVO não definida.')
      return
    }

    const coligadas = listColigadasConfig()
    if (coligadas.length === 0) {
      this.logger.error('Nenhuma coligada configurada na variável COLIGADAS.')
      return
    }

    const coligadasElegiveis = coligadas.filter(
      (coligada) => !this.isProcedureBlockedColigada(coligada.id),
    )
    if (coligadasElegiveis.length === 0) {
      this.logger.error('Nenhuma coligada elegível para execução de procedure.')
      return
    }

    this.logger.log(
      `Adicionando jobs de sync — período ${periodoLetivo}, ${coligadasElegiveis.length} coligada(s) elegível(is)`,
    )

    // Adiciona um job na fila para cada coligada
    const jobPromises = coligadasElegiveis.map((coligada) =>
      this.alunoSyncQueue.add(
        'sync-coligada',
        {
          periodoLetivo,
          coligada,
        } as ColigadaSyncJobData,
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      ),
    )

    const jobs = await Promise.all(jobPromises)

    this.logger.log(
      `${jobs.length} job(s) de sync adicionados à fila para ${coligadasElegiveis.length} coligada(s)`,
    )
  }

  /**
   * Adiciona job na fila para sincronizar uma coligada específica
   */
  async syncColigada(
    periodoLetivo: string,
    coligada: ColigadaConfig,
  ): Promise<void> {
    this.assertProcedureColigadaPermitida(coligada.id)

    this.logger.log(
      `Adicionando job para coligada ${coligada.id} — período ${periodoLetivo}`,
    )

    const job = await this.alunoSyncQueue.add(
      'sync-coligada',
      {
        periodoLetivo,
        coligada,
      } as ColigadaSyncJobData,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    )

    this.logger.log(
      `Job para coligada ${coligada.id} adicionado à fila (ID: ${job.id})`,
    )
  }

  /**
   * Adiciona job na fila para sincronizar um aluno específico
   */
  async syncAluno(aluno: any, coligada: ColigadaConfig): Promise<void> {
    const payload = aluno as AlunoTotvsDto

    this.logger.log(`Adicionando job para aluno ${aluno.CD_Registro_Academico}`)

    const job = await this.alunoSyncQueue.add(
      'sync-aluno',
      {
        aluno: payload,
        coligada,
      } as AlunoJobData,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    )

    this.logger.log(
      `Job para aluno ${aluno.CD_Registro_Academico} adicionado à fila (ID: ${job.id})`,
    )
  }

  async syncCancelamentosColigada(
    CD_Periodo_Letivo: string,
    CD_Coligada: number,
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' = 'BATCH',
  ): Promise<void> {
    this.assertProcedureColigadaPermitida(CD_Coligada)

    const coligada = getColigadaConfigById(CD_Coligada)

    this.logger.log(
      `Adicionando job de cancelamento para coligada ${CD_Coligada} — período ${CD_Periodo_Letivo}`,
    )

    const job = await this.alunoSyncQueue.add(
      'cancelamentos-coligada',
      {
        CD_Periodo_Letivo,
        coligada,
        TP_Origem_Disparo,
      } as CancelamentoColigadaJobData,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    )

    this.logger.log(
      `Job de cancelamento da coligada ${CD_Coligada} adicionado à fila (ID: ${job.id})`,
    )
  }

  async syncCancelamentosPorColigada(): Promise<void> {
    const CD_Periodo_Letivo = process.env.PERIODO_LETIVO
    if (!CD_Periodo_Letivo) {
      this.logger.error('Variável de ambiente PERIODO_LETIVO não definida.')
      return
    }

    const coligadas = listColigadasConfig()
    if (coligadas.length === 0) {
      this.logger.error('Nenhuma coligada configurada na variável COLIGADAS.')
      return
    }

    const coligadasElegiveis = coligadas.filter(
      (coligada) => !this.isProcedureBlockedColigada(coligada.id),
    )
    if (coligadasElegiveis.length === 0) {
      this.logger.error('Nenhuma coligada elegível para execução de procedure.')
      return
    }

    this.logger.log(
      `Adicionando jobs de cancelamento — período ${CD_Periodo_Letivo}, ${coligadasElegiveis.length} coligada(s) elegível(is)`,
    )

    const jobPromises = coligadasElegiveis.map((coligada) =>
      this.alunoSyncQueue.add(
        'cancelamentos-coligada',
        {
          CD_Periodo_Letivo,
          coligada,
          TP_Origem_Disparo: 'BATCH',
        } as CancelamentoColigadaJobData,
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        },
      ),
    )

    const jobs = await Promise.all(jobPromises)

    this.logger.log(
      `${jobs.length} job(s) de cancelamento adicionados à fila para ${coligadasElegiveis.length} coligada(s)`,
    )
  }

  async syncCancelamentoAluno(data: {
    CD_Registro_Academico: string
    CD_Coligada: number
    CD_Periodo_Letivo: string
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'
  }): Promise<void> {
    this.assertProcedureColigadaPermitida(data.CD_Coligada)

    const coligada = getColigadaConfigById(data.CD_Coligada)

    this.logger.log(
      `Adicionando job de cancelamento para aluno ${data.CD_Registro_Academico}`,
    )

    const job = await this.addAlunoSyncJob(
      'cancelamento-aluno',
      {
        CD_Periodo_Letivo: data.CD_Periodo_Letivo,
        CD_Registro_Academico: data.CD_Registro_Academico,
        coligada,
        TP_Origem_Disparo: data.TP_Origem_Disparo,
      } as CancelamentoAlunoJobData,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        jobId: this.buildAlunoCancelamentoJobId({
          CD_Periodo_Letivo: data.CD_Periodo_Letivo,
          CD_Coligada: data.CD_Coligada,
          CD_Registro_Academico: data.CD_Registro_Academico,
          TP_Origem_Disparo: data.TP_Origem_Disparo,
        }),
        removeOnComplete: AlunoSyncService.REMOVE_ON_COMPLETE,
      },
    )

    this.logger.log(
      `Job de cancelamento do aluno ${data.CD_Registro_Academico} adicionado à fila (ID: ${job.id})`,
    )
  }

  async syncWebhookAluno(data: {
    CD_Registro_Academico: string
    CD_Coligada?: number
    CD_Periodo_Letivo?: string
  }): Promise<void> {
    const CD_Periodo_Letivo = data.CD_Periodo_Letivo ?? process.env.PERIODO_LETIVO
    if (!CD_Periodo_Letivo) {
      throw new BadRequestException(
        'CD_Periodo_Letivo não informado e PERIODO_LETIVO não definido.',
      )
    }

    const coligada = data.CD_Coligada
      ? getColigadaConfigById(data.CD_Coligada)
      : this.resolveColigadaFromConfig()
    this.assertProcedureColigadaPermitida(coligada.id)

    this.logger.log(
      `Adicionando job de webhook para aluno ${data.CD_Registro_Academico} (coligada ${coligada.id}, período ${CD_Periodo_Letivo})`,
    )

    const job = await this.addAlunoSyncJob(
      'webhook-aluno',
      {
        CD_Periodo_Letivo,
        CD_Registro_Academico: data.CD_Registro_Academico,
        coligada,
      } as WebhookAlunoJobData,
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        jobId: this.buildAlunoWebhookJobId({
          CD_Periodo_Letivo,
          CD_Coligada: coligada.id,
          CD_Registro_Academico: data.CD_Registro_Academico,
        }),
        removeOnComplete: AlunoSyncService.REMOVE_ON_COMPLETE,
      },
    )

    this.logger.log(
      `Job de webhook do aluno ${data.CD_Registro_Academico} adicionado à fila (ID: ${job.id})`,
    )
  }

  private resolveColigadaFromConfig(): ColigadaConfig {
    const coligadas = listColigadasConfig()
    if (coligadas.length === 0) {
      throw new BadRequestException(
        'Nenhuma coligada configurada para sincronização.',
      )
    }

    if (coligadas.length > 1) {
      throw new BadRequestException(
        'Webhook de aluno exige CD_Coligada quando há múltiplas coligadas configuradas.',
      )
    }

    return coligadas[0]
  }

  private isProcedureBlockedColigada(CD_Coligada: number): boolean {
    return AlunoSyncService.COLIGADAS_BLOQUEADAS_PROCEDURE.has(CD_Coligada)
  }

  private assertProcedureColigadaPermitida(CD_Coligada: number): void {
    if (this.isProcedureBlockedColigada(CD_Coligada)) {
      throw new BadRequestException(
        `CD_Coligada ${CD_Coligada} não é elegível para execução de procedure.`,
      )
    }
  }
}
