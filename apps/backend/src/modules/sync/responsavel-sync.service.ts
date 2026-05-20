import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Job, JobOptions, Queue } from 'bull'
import {
  AtivacaoResponsavelLoteJobData,
  AtivacaoResponsavelUnitarioJobData,
  CancelamentoResponsavelLoteJobData,
  CancelamentoResponsavelUnitarioJobData,
} from './responsavel-sync.processor'

@Injectable()
export class ResponsavelSyncService {
  private readonly logger = new Logger(ResponsavelSyncService.name)
  private static readonly REMOVE_ON_COMPLETE = 1000

  constructor(
    @InjectQueue('responsavel-sync')
    private readonly responsavelSyncQueue: Queue,
  ) {}

  private async addResponsavelSyncJob<T>(
    name: string,
    data: T,
    options: JobOptions,
  ): Promise<Job<T>> {
    if (!options.jobId) {
      return this.responsavelSyncQueue.add(name, data, options)
    }

    const existingJob = await this.responsavelSyncQueue.getJob(options.jobId)
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

    return this.responsavelSyncQueue.add(name, data, options)
  }

  private buildResponsavelAtivacaoUnitarioJobId(data: {
    CD_Periodo_Letivo: string
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'
    CD_Pessoa?: number | null
    CD_CPF?: string | null
    CD_Registro_Academico?: string | null
  }): string {
    return [
      'sync-responsavel-unitario',
      data.TP_Origem_Disparo,
      data.CD_Periodo_Letivo,
      data.CD_CPF ?? `P${data.CD_Pessoa ?? 'NULL'}`,
      data.CD_Registro_Academico ?? 'ALL',
    ].join(':')
  }

  private buildResponsavelCancelamentoUnitarioJobId(data: {
    CD_Periodo_Letivo: string
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'
    CD_Pessoa?: number | null
    CD_CPF?: string | null
    CD_Registro_Academico?: string | null
  }): string {
    return [
      'cancelamento-responsavel-unitario',
      data.TP_Origem_Disparo,
      data.CD_Periodo_Letivo,
      data.CD_CPF ?? `P${data.CD_Pessoa ?? 'NULL'}`,
      data.CD_Registro_Academico ?? 'ALL',
    ].join(':')
  }

  async syncResponsaveis(): Promise<void> {
    const CD_Periodo_Letivo = process.env.PERIODO_LETIVO
    if (!CD_Periodo_Letivo) {
      this.logger.error('Variável de ambiente PERIODO_LETIVO não definida.')
      return
    }

    this.logger.log(
      `Adicionando job global de concessão de responsáveis — período ${CD_Periodo_Letivo}`,
    )

    const job = await this.responsavelSyncQueue.add(
      'sync-responsaveis',
      {
        CD_Periodo_Letivo,
        TP_Origem_Disparo: 'BATCH',
      } as AtivacaoResponsavelLoteJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    )

    this.logger.log(
      `Job global de concessão de responsáveis adicionado à fila (ID: ${job.id})`,
    )
  }

  async syncResponsaveisLote(
    CD_Periodo_Letivo: string,
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' = 'BATCH',
  ): Promise<void> {
    const job = await this.responsavelSyncQueue.add(
      'sync-responsaveis',
      {
        CD_Periodo_Letivo,
        TP_Origem_Disparo,
      } as AtivacaoResponsavelLoteJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    )

    this.logger.log(
      `Job global de concessão de responsáveis adicionado (ID: ${job.id})`,
    )
  }

  async syncResponsavel(data: {
    CD_Periodo_Letivo: string
    CD_Pessoa?: number
    CD_CPF?: string
    CD_Registro_Academico?: string
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'
  }): Promise<void> {
    if (
      data.CD_Pessoa === undefined &&
      data.CD_CPF === undefined &&
      data.CD_Registro_Academico === undefined
    ) {
      throw new BadRequestException(
        'Informe CD_Pessoa, CD_CPF ou CD_Registro_Academico.',
      )
    }

    const job = await this.addResponsavelSyncJob(
      'sync-responsavel-unitario',
      {
        CD_Periodo_Letivo: data.CD_Periodo_Letivo,
        CD_Pessoa: data.CD_Pessoa ?? null,
        CD_CPF: data.CD_CPF ?? null,
        CD_Registro_Academico: data.CD_Registro_Academico ?? null,
        TP_Origem_Disparo: data.TP_Origem_Disparo,
      } as AtivacaoResponsavelUnitarioJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        jobId: this.buildResponsavelAtivacaoUnitarioJobId({
          CD_Periodo_Letivo: data.CD_Periodo_Letivo,
          TP_Origem_Disparo: data.TP_Origem_Disparo,
          CD_Pessoa: data.CD_Pessoa ?? null,
          CD_CPF: data.CD_CPF ?? null,
          CD_Registro_Academico: data.CD_Registro_Academico ?? null,
        }),
        removeOnComplete: ResponsavelSyncService.REMOVE_ON_COMPLETE,
      },
    )

    this.logger.log(
      `Job unitário de concessão de responsável adicionado (ID: ${job.id})`,
    )
  }

  async syncCancelamentos(): Promise<void> {
    const CD_Periodo_Letivo = process.env.PERIODO_LETIVO
    if (!CD_Periodo_Letivo) {
      this.logger.error('Variável de ambiente PERIODO_LETIVO não definida.')
      return
    }

    this.logger.log(
      `Adicionando job global de cancelamento de responsáveis — período ${CD_Periodo_Letivo}`,
    )

    const job = await this.responsavelSyncQueue.add(
      'cancelamentos-responsavel',
      {
        CD_Periodo_Letivo,
        TP_Origem_Disparo: 'BATCH',
      } as CancelamentoResponsavelLoteJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    )

    this.logger.log(
      `Job global de cancelamento de responsáveis adicionado à fila (ID: ${job.id})`,
    )
  }

  async syncCancelamentosLote(
    CD_Periodo_Letivo: string,
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' = 'BATCH',
  ): Promise<void> {
    const job = await this.responsavelSyncQueue.add(
      'cancelamentos-responsavel',
      {
        CD_Periodo_Letivo,
        TP_Origem_Disparo,
      } as CancelamentoResponsavelLoteJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    )

    this.logger.log(
      `Job global de cancelamento de responsáveis adicionado (ID: ${job.id})`,
    )
  }

  async syncCancelamentoResponsavel(data: {
    CD_Periodo_Letivo: string
    CD_Pessoa?: number
    CD_CPF?: string
    CD_Registro_Academico?: string
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'
  }): Promise<void> {
    if (
      data.CD_Pessoa === undefined &&
      data.CD_CPF === undefined &&
      data.CD_Registro_Academico === undefined
    ) {
      throw new BadRequestException(
        'Informe CD_Pessoa, CD_CPF ou CD_Registro_Academico.',
      )
    }

    const job = await this.addResponsavelSyncJob(
      'cancelamento-responsavel-unitario',
      {
        CD_Periodo_Letivo: data.CD_Periodo_Letivo,
        CD_Pessoa: data.CD_Pessoa ?? null,
        CD_CPF: data.CD_CPF ?? null,
        CD_Registro_Academico: data.CD_Registro_Academico ?? null,
        TP_Origem_Disparo: data.TP_Origem_Disparo,
      } as CancelamentoResponsavelUnitarioJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        jobId: this.buildResponsavelCancelamentoUnitarioJobId({
          CD_Periodo_Letivo: data.CD_Periodo_Letivo,
          TP_Origem_Disparo: data.TP_Origem_Disparo,
          CD_Pessoa: data.CD_Pessoa ?? null,
          CD_CPF: data.CD_CPF ?? null,
          CD_Registro_Academico: data.CD_Registro_Academico ?? null,
        }),
        removeOnComplete: ResponsavelSyncService.REMOVE_ON_COMPLETE,
      },
    )

    this.logger.log(
      `Job unitário global de responsável adicionado (ID: ${job.id})`,
    )
  }
}
