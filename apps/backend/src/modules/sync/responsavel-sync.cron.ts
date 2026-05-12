import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'

@Injectable()
export class ResponsavelSyncCron {
  private readonly logger = new Logger(ResponsavelSyncCron.name)

  constructor(
    @InjectQueue('responsavel-sync')
    private readonly responsavelSyncQueue: Queue,
  ) {}

  // @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleConcessaoCron(): Promise<void> {
    const traceId = crypto.randomUUID()

    this.logger.log(
      `[traceId=${traceId}] Cron de concessão de acessos de responsáveis iniciado`,
    )

    try {
      const CD_Periodo_Letivo = process.env.PERIODO_LETIVO
      if (!CD_Periodo_Letivo) {
        this.logger.error('Variável de ambiente PERIODO_LETIVO não definida.')
        return
      }

      const job = await this.responsavelSyncQueue.add(
        'sync-responsaveis',
        {
          CD_Periodo_Letivo,
          TP_Origem_Disparo: 'BATCH',
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      )

      this.logger.log(
        `[traceId=${traceId}] Job de concessão de responsáveis adicionado à fila (ID: ${job.id})`,
      )
    } catch (error) {
      this.logger.error(
        `[traceId=${traceId}] Falha ao adicionar job de concessão de responsáveis na fila`,
        error,
      )
    }
  }
}
