import { Processor, Process, InjectQueue } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job, Queue } from 'bull'
import { TotvsService } from '../integrations/totvs/totvs.service'
import { GoogleService } from '../integrations/google/google.service'
import { ColigadaConfig } from './interfaces/coligada-config.interface'
import { AccessProvisioningService } from './access-provisioning/access-provisioning.service'
import { PessoaAcessoContext } from './access-provisioning/interfaces/pessoa-acesso-context.interface'
import { AlunoTotvsDto } from '../integrations/totvs/dto/aluno-totvs.dto'
import { AlunoCancelamentoTotvsDto } from '../integrations/totvs/dto/aluno-cancelamento-totvs.dto'
import { ResponsavelSyncService } from './responsavel-sync.service'

export interface ColigadaSyncJobData {
  periodoLetivo: string
  coligada: ColigadaConfig
}

export interface AlunoJobData {
  aluno: AlunoTotvsDto
  coligada: ColigadaConfig
}

export interface CancelamentoColigadaJobData {
  CD_Periodo_Letivo: string
  coligada: ColigadaConfig
  TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO'
}

export interface CancelamentoAlunoJobData {
  CD_Periodo_Letivo: string
  CD_Registro_Academico: string
  coligada: ColigadaConfig
  TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'
  aluno?: AlunoCancelamentoTotvsDto
}

export interface WebhookAlunoJobData {
  CD_Periodo_Letivo: string
  CD_Registro_Academico: string
  coligada: ColigadaConfig
}

@Processor('aluno-sync')
export class AlunoSyncProcessor {
  private readonly logger = new Logger(AlunoSyncProcessor.name)
  private static readonly COLIGADAS_BLOQUEADAS_PROCEDURE = new Set([6])

  constructor(
    @InjectQueue('aluno-sync') private readonly alunoSyncQueue: Queue,
    private readonly totvsService: TotvsService,
    private readonly googleService: GoogleService,
    private readonly accessProvisioningService: AccessProvisioningService,
    private readonly responsavelSyncService: ResponsavelSyncService,
  ) {}

  /**
   * Job por coligada: busca alunos ativos e adiciona cada um como job na fila
   */
  @Process('sync-coligada')
  async handleSyncColigada(job: Job<ColigadaSyncJobData>): Promise<void> {
    const { periodoLetivo, coligada } = job.data

    this.logger.log(`[Job ${job.id}] [Coligada ${coligada.id}] Iniciando sync`)

    await this.syncColigada(periodoLetivo, coligada)

    this.logger.log(`[Job ${job.id}] [Coligada ${coligada.id}] Sync concluído`)
  }

  /**
   * Job por aluno: sincroniza um único aluno
   */
  @Process('sync-aluno')
  async handleSyncAluno(job: Job<AlunoJobData>): Promise<void> {
    const { aluno, coligada } = job.data

    this.logger.debug(
      `[Job ${job.id}] Processando aluno ${aluno.CD_Registro_Academico}`,
    )

    await this.syncAluno(aluno, coligada)

    this.logger.debug(
      `[Job ${job.id}] Aluno ${aluno.CD_Registro_Academico} processado`,
    )
  }

  @Process('cancelamentos-coligada')
  async handleCancelamentosColigada(
    job: Job<CancelamentoColigadaJobData>,
  ): Promise<void> {
    const { CD_Periodo_Letivo, coligada, TP_Origem_Disparo } = job.data

    this.logger.log(
      `[Job ${job.id}] [Coligada ${coligada.id}] Iniciando cancelamentos (${TP_Origem_Disparo})`,
    )

    await this.syncCancelamentosColigada(
      CD_Periodo_Letivo,
      coligada,
      TP_Origem_Disparo,
    )

    this.logger.log(
      `[Job ${job.id}] [Coligada ${coligada.id}] Cancelamentos concluídos`,
    )
  }

  @Process('cancelamento-aluno')
  async handleCancelamentoAluno(
    job: Job<CancelamentoAlunoJobData>,
  ): Promise<void> {
    const {
      aluno,
      coligada,
      CD_Periodo_Letivo,
      CD_Registro_Academico,
      TP_Origem_Disparo,
    } = job.data

    this.logger.debug(
      `[Job ${job.id}] Cancelando acesso do aluno ${CD_Registro_Academico} (${TP_Origem_Disparo})`,
    )

    await this.syncCancelamentoAluno({
      aluno,
      coligada,
      CD_Periodo_Letivo,
      CD_Registro_Academico,
      TP_Origem_Disparo,
    })

    this.logger.debug(
      `[Job ${job.id}] Cancelamento do aluno ${CD_Registro_Academico} processado`,
    )
  }

  @Process('webhook-aluno')
  async handleWebhookAluno(job: Job<WebhookAlunoJobData>): Promise<void> {
    const { CD_Periodo_Letivo, CD_Registro_Academico, coligada } = job.data

    if (this.isProcedureBlockedColigada(coligada.id)) {
      this.logger.warn(
        `[Job ${job.id}] [Webhook] Coligada ${coligada.id} bloqueada para execução de procedure`,
      )
      return
    }

    this.logger.log(
      `[Job ${job.id}] [Webhook] Iniciando processamento do aluno ${CD_Registro_Academico} (coligada ${coligada.id}, período ${CD_Periodo_Letivo})`,
    )

    await this.syncCancelamentoAluno({
      coligada,
      CD_Periodo_Letivo,
      CD_Registro_Academico,
      TP_Origem_Disparo: 'WEBHOOK',
    })

    const alunoAtivo = await this.totvsService.fetchAlunoAtivo(
      CD_Periodo_Letivo,
      coligada.id,
      CD_Registro_Academico,
    )

    if (!alunoAtivo) {
      this.logger.warn(
        `[Webhook] Aluno ${CD_Registro_Academico} não encontrado na procedure de ativação para a coligada ${coligada.id}`,
      )
      return
    }

    await this.syncAluno(alunoAtivo, coligada)

    this.logger.log(
      `[Job ${job.id}] [Webhook] Enfileirando responsáveis após reconciliação do aluno ${CD_Registro_Academico}`,
    )

    await this.responsavelSyncService.syncCancelamentoResponsavel({
      CD_Periodo_Letivo,
      CD_Registro_Academico,
      TP_Origem_Disparo: 'WEBHOOK',
    })

    await this.responsavelSyncService.syncResponsavel({
      CD_Periodo_Letivo,
      CD_Registro_Academico,
      TP_Origem_Disparo: 'WEBHOOK',
    })

    this.logger.log(
      `[Job ${job.id}] [Webhook] Processamento concluído para aluno ${CD_Registro_Academico}`,
    )
  }

  // ─── Métodos privados de sincronização ────────────────────────────────────────

  private async syncColigada(
    periodoLetivo: string,
    coligada: ColigadaConfig,
  ): Promise<void> {
    if (this.isProcedureBlockedColigada(coligada.id)) {
      this.logger.warn(
        `[Coligada ${coligada.id}] Execução de procedure bloqueada por regra de negócio`,
      )
      return
    }

    this.logger.log(`[Coligada ${coligada.id}] Buscando alunos ativos...`)

    const alunos = await this.totvsService.fetchAlunosAtivos(
      periodoLetivo,
      coligada.id,
      null,
    )

    this.logger.log(
      `[Coligada ${coligada.id}] ${alunos.length} aluno(s) encontrado(s)`,
    )

    const jobPromises = alunos.map((aluno) =>
      this.alunoSyncQueue.add(
        'sync-aluno',
        { aluno, coligada } as AlunoJobData,
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      ),
    )

    const jobs = await Promise.all(jobPromises)

    this.logger.log(
      `[Coligada ${coligada.id}] ${jobs.length} job(s) de aluno adicionados à fila`,
    )
  }

  private async syncAluno(
    aluno: AlunoTotvsDto,
    coligada: ColigadaConfig,
  ): Promise<void> {
    const ra = aluno.CD_Registro_Academico
    const email = `${ra}@${coligada.domain}`

    this.logger.debug(`[Coligada ${coligada.id}] Processando aluno ${ra}`)

    // 1. Gmail — apenas para alunos sem vínculo de funcionário/responsável com matrícula regular ativa
    if (
      !aluno.IN_Funcionario &&
      !aluno.IN_Responsavel &&
      aluno.IN_Existe_Matricula_Regular &&
      !aluno.IN_Inativo_Regular
    ) {
      const googleResult = await this.googleService.checkAndProvisionEmail(
        email,
        aluno,
        coligada,
      )
      this.logger.log(`[Google] ${email} → ${googleResult}`)
    }

    // 2. Montar contexto genérico e delegar ao serviço de provisionamento
    // IN_Aluno = 1 pois esta integração processa registros de alunos
    const ctx: PessoaAcessoContext = {
      CD_Pessoa: aluno.CD_Pessoa,
      CD_Usuario: aluno.CD_Usuario,
      CD_CPF: aluno.CD_CPF,
      CD_Identificador: ra,
      NM_Pessoa: aluno.NM_Aluno,
      DT_Nascimento: aluno.DT_Nascimento,
      TX_Email_Pessoa: aluno.TX_Email_Pessoa,
      TX_Email_Usuario: aluno.TX_Email_Usuario,
      IN_Usuario_Ativo: aluno.IN_Usuario_Ativo,
      IN_Aluno: 1,
      IN_Funcionario: aluno.IN_Funcionario,
      IN_Responsavel: aluno.IN_Responsavel,
      IN_Existe_Matricula_Regular: aluno.IN_Existe_Matricula_Regular,
      IN_Inativo_Regular: aluno.IN_Inativo_Regular,
      IN_Inativo_Extra: 0,
      CD_Coligada: coligada.id,
      CD_Filial: aluno.CD_Filial ?? null,
      NM_Dominio_Email_Institucional: coligada.domain,
      TX_Email_Institucional: email,
    }

    await this.accessProvisioningService.provisionarAcesso(ctx)
  }

  private async syncCancelamentosColigada(
    CD_Periodo_Letivo: string,
    coligada: ColigadaConfig,
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO',
  ): Promise<void> {
    if (this.isProcedureBlockedColigada(coligada.id)) {
      this.logger.warn(
        `[Coligada ${coligada.id}] Execução de procedure de cancelamento bloqueada por regra de negócio`,
      )
      return
    }

    this.logger.log(
      `[Coligada ${coligada.id}] Buscando alunos para cancelamento...`,
    )

    const alunos = await this.totvsService.fetchAlunosCancelamento(
      CD_Periodo_Letivo,
      coligada.id,
      null,
    )

    this.logger.log(
      `[Coligada ${coligada.id}] ${alunos.length} aluno(s) encontrado(s) para cancelamento`,
    )

    const jobPromises = alunos.map((aluno) =>
      this.alunoSyncQueue.add(
        'cancelamento-aluno',
        {
          aluno,
          coligada,
          CD_Periodo_Letivo,
          CD_Registro_Academico: aluno.CD_Registro_Academico,
          TP_Origem_Disparo,
        } as CancelamentoAlunoJobData,
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      ),
    )

    const jobs = await Promise.all(jobPromises)

    this.logger.log(
      `[Coligada ${coligada.id}] ${jobs.length} job(s) de cancelamento adicionados à fila`,
    )
  }

  private async syncCancelamentoAluno({
    aluno,
    coligada,
    CD_Periodo_Letivo,
    CD_Registro_Academico,
    TP_Origem_Disparo,
  }: CancelamentoAlunoJobData): Promise<void> {
    if (this.isProcedureBlockedColigada(coligada.id)) {
      this.logger.warn(
        `[Cancelamento] Coligada ${coligada.id} bloqueada para execução de procedure`,
      )
      return
    }

    const alunoCancelamento =
      aluno ??
      (await this.totvsService.fetchAlunoCancelamento(
        CD_Periodo_Letivo,
        coligada.id,
        CD_Registro_Academico,
      ))

    if (!alunoCancelamento) {
      this.logger.warn(
        `[Cancelamento] Aluno ${CD_Registro_Academico} não encontrado para revogação na coligada ${coligada.id}`,
      )
      return
    }

    const email = `${alunoCancelamento.CD_Registro_Academico}@${coligada.domain}`

    this.logger.debug(
      `[Cancelamento] Processando ${alunoCancelamento.CD_Registro_Academico} (${TP_Origem_Disparo})`,
    )

    const ctx: PessoaAcessoContext = {
      TP_Origem_Revogacao: 'ALUNO',
      CD_Pessoa: alunoCancelamento.CD_Pessoa,
      CD_Usuario: alunoCancelamento.CD_Usuario,
      CD_CPF: alunoCancelamento.CD_CPF,
      CD_Identificador: alunoCancelamento.CD_Registro_Academico,
      NM_Pessoa: alunoCancelamento.NM_Aluno,
      DT_Nascimento: alunoCancelamento.DT_Nascimento,
      TX_Email_Pessoa: alunoCancelamento.TX_Email_Pessoa,
      TX_Email_Usuario: alunoCancelamento.TX_Email_Usuario,
      IN_Usuario_Ativo: alunoCancelamento.IN_Usuario_Ativo,
      IN_Aluno: 1,
      IN_Funcionario: alunoCancelamento.IN_Funcionario,
      IN_Responsavel: alunoCancelamento.IN_Responsavel,
      IN_Existe_Matricula_Regular:
        alunoCancelamento.IN_Existe_Matricula_Regular,
      IN_Inativo_Regular: alunoCancelamento.IN_Inativo_Regular,
      IN_Existe_Matricula_Extra: alunoCancelamento.IN_Existe_Matricula_Extra,
      IN_Inativo_Extra: alunoCancelamento.IN_Inativo_Extra,
      CD_Coligada: coligada.id,
      CD_Filial: alunoCancelamento.CD_Filial ?? null,
      NM_Dominio_Email_Institucional: coligada.domain,
      TX_Email_Institucional: email,
    }

    await this.accessProvisioningService.revogarAcesso(ctx)
  }

  private isProcedureBlockedColigada(CD_Coligada: number): boolean {
    return AlunoSyncProcessor.COLIGADAS_BLOQUEADAS_PROCEDURE.has(CD_Coligada)
  }
}
