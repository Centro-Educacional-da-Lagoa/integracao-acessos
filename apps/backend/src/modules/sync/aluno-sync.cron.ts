import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { listColigadasConfig } from './utils/coligadas-config'

@Injectable()
export class AlunoSyncCron {
  private readonly logger = new Logger(AlunoSyncCron.name)

  constructor(
    @InjectQueue('aluno-sync') private readonly alunoSyncQueue: Queue,
  ) {}

  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron(): Promise<void> {
    const traceId = crypto.randomUUID()

    this.logger.log(`[traceId=${traceId}] Cron de sync de alunos iniciado`)

    try {
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

      // Adiciona um job na fila para cada coligada
      const jobPromises = coligadas.map((coligada) =>
        this.alunoSyncQueue.add(
          'sync-coligada',
          {
            periodoLetivo,
            coligada,
          },
          {
            attempts: 3, // Tenta até 3 vezes em caso de falha
            backoff: {
              type: 'exponential',
              delay: 5000, // delay exponencial começando em 5 segundos
            },
          },
        ),
      )

      const jobs = await Promise.all(jobPromises)

      this.logger.log(
        `[traceId=${traceId}] ${jobs.length} job(s) de sync adicionados à fila para ${coligadas.length} coligada(s)`,
      )
    } catch (error) {
      this.logger.error(
        `[traceId=${traceId}] Falha ao adicionar job na fila`,
        error,
      )
    }
  }

  // @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleCancelamentoCron(): Promise<void> {
    const traceId = crypto.randomUUID()

    this.logger.log(
      `[traceId=${traceId}] Cron de cancelamento de acessos de alunos iniciado`,
    )

    try {
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

      const jobPromises = coligadas.map((coligada) =>
        this.alunoSyncQueue.add(
          'cancelamentos-coligada',
          {
            CD_Periodo_Letivo,
            coligada,
            TP_Origem_Disparo: 'BATCH',
          },
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
        `[traceId=${traceId}] ${jobs.length} job(s) de cancelamento adicionados à fila para ${coligadas.length} coligada(s)`,
      )
    } catch (error) {
      this.logger.error(
        `[traceId=${traceId}] Falha ao adicionar job de cancelamento na fila`,
        error,
      )
    }
  }
}
