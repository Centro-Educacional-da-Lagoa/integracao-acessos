import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import {
  CancelamentoResponsavelLoteJobData,
  CancelamentoResponsavelUnitarioJobData,
} from './responsavel-sync.processor'

@Injectable()
export class ResponsavelSyncService {
  private readonly logger = new Logger(ResponsavelSyncService.name)

  constructor(
    @InjectQueue('responsavel-sync')
    private readonly responsavelSyncQueue: Queue,
  ) {}

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
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'
  }): Promise<void> {
    if (data.CD_Pessoa === undefined && data.CD_CPF === undefined) {
      throw new BadRequestException('Informe CD_Pessoa ou CD_CPF.')
    }

    const job = await this.responsavelSyncQueue.add(
      'cancelamento-responsavel-unitario',
      {
        CD_Periodo_Letivo: data.CD_Periodo_Letivo,
        CD_Pessoa: data.CD_Pessoa ?? null,
        CD_CPF: data.CD_CPF ?? null,
        TP_Origem_Disparo: data.TP_Origem_Disparo,
      } as CancelamentoResponsavelUnitarioJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    )

    this.logger.log(
      `Job unitário global de responsável adicionado (ID: ${job.id})`,
    )
  }
}
