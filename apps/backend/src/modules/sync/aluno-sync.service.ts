import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { ColigadaConfig } from './interfaces/coligada-config.interface'
import {
  ColigadaSyncJobData,
  AlunoJobData,
  CancelamentoColigadaJobData,
  CancelamentoAlunoJobData,
} from './aluno-sync.processor'
import { AlunoTotvsDto } from '../integrations/totvs/dto/aluno-totvs.dto'
import {
  getColigadaConfigById,
  listColigadasConfig,
} from './utils/coligadas-config'

@Injectable()
export class AlunoSyncService {
  private readonly logger = new Logger(AlunoSyncService.name)

  constructor(
    @InjectQueue('aluno-sync') private readonly alunoSyncQueue: Queue,
  ) {}

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

    this.logger.log(
      `Adicionando jobs de sync — período ${periodoLetivo}, ${coligadas.length} coligada(s)`,
    )

    // Adiciona um job na fila para cada coligada
    const jobPromises = coligadas.map((coligada) =>
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
      `${jobs.length} job(s) de sync adicionados à fila para ${coligadas.length} coligada(s)`,
    )
  }

  /**
   * Adiciona job na fila para sincronizar uma coligada específica
   */
  async syncColigada(
    periodoLetivo: string,
    coligada: ColigadaConfig,
  ): Promise<void> {
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

  async syncCancelamentoAluno(data: {
    CD_Registro_Academico: string
    CD_Coligada: number
    CD_Periodo_Letivo: string
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO'
  }): Promise<void> {
    const coligada = getColigadaConfigById(data.CD_Coligada)

    this.logger.log(
      `Adicionando job de cancelamento para aluno ${data.CD_Registro_Academico}`,
    )

    const job = await this.alunoSyncQueue.add(
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
      },
    )

    this.logger.log(
      `Job de cancelamento do aluno ${data.CD_Registro_Academico} adicionado à fila (ID: ${job.id})`,
    )
  }
}
