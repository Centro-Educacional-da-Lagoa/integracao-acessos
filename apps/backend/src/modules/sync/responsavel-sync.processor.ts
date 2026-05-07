import { InjectQueue, Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job, Queue } from 'bull'
import { TotvsService } from '../integrations/totvs/totvs.service'
import { AccessProvisioningService } from './access-provisioning/access-provisioning.service'
import { PessoaAcessoContext } from './access-provisioning/interfaces/pessoa-acesso-context.interface'
import { ResponsavelCancelamentoTotvsDto } from '../integrations/totvs/dto/responsavel-cancelamento-totvs.dto'

export interface CancelamentoResponsavelLoteJobData {
  CD_Periodo_Letivo: string
  TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO'
}

export interface CancelamentoResponsavelUnitarioJobData {
  CD_Periodo_Letivo: string
  CD_Pessoa: number | null
  CD_CPF: string | null
  TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'
  responsaveis?: ResponsavelCancelamentoTotvsDto[]
}

@Processor('responsavel-sync')
export class ResponsavelSyncProcessor {
  private readonly logger = new Logger(ResponsavelSyncProcessor.name)

  constructor(
    @InjectQueue('responsavel-sync')
    private readonly responsavelSyncQueue: Queue,
    private readonly totvsService: TotvsService,
    private readonly accessProvisioningService: AccessProvisioningService,
  ) {}

  @Process('cancelamentos-responsavel')
  async handleCancelamentosResponsavel(
    job: Job<CancelamentoResponsavelLoteJobData>,
  ): Promise<void> {
    const { CD_Periodo_Letivo, TP_Origem_Disparo } = job.data

    this.logger.log(
      `[Job ${job.id}] Iniciando cancelamento global de responsáveis (${TP_Origem_Disparo})`,
    )

    await this.syncCancelamentosResponsavel(
      CD_Periodo_Letivo,
      TP_Origem_Disparo,
    )

    this.logger.log(
      `[Job ${job.id}] Cancelamento global de responsáveis concluído`,
    )
  }

  @Process('cancelamento-responsavel-unitario')
  async handleCancelamentoResponsavelUnitario(
    job: Job<CancelamentoResponsavelUnitarioJobData>,
  ): Promise<void> {
    const { CD_Pessoa, CD_CPF, TP_Origem_Disparo } = job.data

    this.logger.debug(
      `[Job ${job.id}] Cancelamento unitário global de responsável (pessoa ${CD_Pessoa ?? 'NULL'}, cpf ${CD_CPF ?? 'NULL'}, origem ${TP_Origem_Disparo})`,
    )

    await this.syncCancelamentoResponsavelUnitario(job.data)
  }

  private async syncCancelamentosResponsavel(
    CD_Periodo_Letivo: string,
    TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO',
  ): Promise<void> {
    const responsaveis = await this.totvsService.fetchResponsaveisCancelamento(
      CD_Periodo_Letivo,
      null,
      null,
    )

    this.logger.log(
      `${responsaveis.length} linha(s) de responsável encontradas para cancelamento global`,
    )

    const grupos = this.agruparResponsaveis(responsaveis)

    const jobs = await Promise.all(
      [...grupos.values()].map((grupo) => {
        const representativo = grupo[0]

        return this.responsavelSyncQueue.add(
          'cancelamento-responsavel-unitario',
          {
            CD_Periodo_Letivo,
            CD_Pessoa: this.parsePessoa(representativo.CD_Pessoa),
            CD_CPF: representativo.CD_CPF ?? null,
            TP_Origem_Disparo,
            responsaveis: grupo,
          } as CancelamentoResponsavelUnitarioJobData,
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
          },
        )
      }),
    )

    this.logger.log(
      `${jobs.length} job(s) consolidado(s) de responsável adicionados`,
    )
  }

  private async syncCancelamentoResponsavelUnitario(
    data: CancelamentoResponsavelUnitarioJobData,
  ): Promise<void> {
    const responsaveis =
      data.responsaveis &&
      Array.isArray(data.responsaveis) &&
      data.responsaveis.length > 0
        ? data.responsaveis
        : await this.totvsService.fetchResponsaveisCancelamento(
            data.CD_Periodo_Letivo,
            data.CD_Pessoa,
            data.CD_CPF,
          )

    if (responsaveis.length === 0) {
      this.logger.warn(
        `[CancelamentoResponsavel] Responsável não encontrado globalmente (pessoa ${data.CD_Pessoa ?? 'NULL'}, cpf ${data.CD_CPF ?? 'NULL'})`,
      )
      return
    }

    const grupos = this.agruparResponsaveis(responsaveis)
    const consolidado = this.selecionarGrupoUnitario(grupos, data)

    if (!consolidado) {
      this.logger.warn(
        `[CancelamentoResponsavel] Não foi possível consolidar grupo de responsável (pessoa ${data.CD_Pessoa ?? 'NULL'}, cpf ${data.CD_CPF ?? 'NULL'})`,
      )
      return
    }

    if (!consolidado.CD_Pessoa) {
      this.logger.warn(
        `[CancelamentoResponsavel] Consolidado sem CD_Pessoa (coligada ${consolidado.CD_Coligada}, cpf ${consolidado.CD_CPF ?? 'NULL'}) — seguindo com fallback por CD_Usuario/CD_CPF`,
      )
    }

    const ctx = this.mapToPessoaAcessoContext(consolidado)
    await this.accessProvisioningService.revogarAcesso(ctx)
  }

  private mapToPessoaAcessoContext(
    responsavel: ResponsavelCancelamentoTotvsDto & {
      CD_Filiais?: number[]
      CD_Filiais_Aluno?: number[]
      CD_Alocacoes?: Array<{ CD_Coligada: number; CD_Filial: number }>
    },
  ): PessoaAcessoContext {
    const inResponsavel = responsavel.IN_Filiacao
      ? 1
      : responsavel.IN_Responsavel_Academico || responsavel.IN_Responsavel_Financeiro
        ? 1
        : 0

    return {
      TP_Origem_Revogacao: 'RESPONSAVEL',
      CD_Pessoa: responsavel.CD_Pessoa ?? '',
      CD_Usuario: responsavel.CD_Usuario,
      CD_CPF: responsavel.CD_CPF,
      CD_Identificador: responsavel.CD_CPF ?? responsavel.CD_Pessoa ?? 'N/A',
      NM_Pessoa: responsavel.NM_Responsavel,
      DT_Nascimento: responsavel.DT_Nascimento,
      TX_Email_Pessoa: responsavel.TX_Email_Pessoa,
      TX_Email_Usuario: responsavel.TX_Email_Usuario,
      IN_Usuario_Ativo: responsavel.IN_Usuario_Ativo,
      IN_Aluno: responsavel.IN_Aluno,
      IN_Funcionario: responsavel.IN_Funcionario,
      IN_Responsavel: inResponsavel,
      IN_Existe_Matricula_Regular: responsavel.IN_Existe_Matricula_Regular,
      IN_Inativo_Regular: responsavel.IN_Inativo_Regular,
      IN_Existe_Matricula_Extra: responsavel.IN_Existe_Matricula_Extra,
      IN_Inativo_Extra: responsavel.IN_Inativo_Extra,
      CD_Coligada: responsavel.CD_Coligada,
      CD_Filial: responsavel.CD_Filial ?? null,
      CD_Filiais: responsavel.CD_Filiais,
      CD_Alocacoes: responsavel.CD_Alocacoes,
      CD_Coligada_Aluno: responsavel.CD_Coligada_Aluno ?? null,
      CD_Filiais_Aluno: responsavel.CD_Filiais_Aluno,
      NM_Dominio_Email_Institucional: 'n/a',
      TX_Email_Institucional: 'n/a',
    }
  }

  private agruparResponsaveis(
    responsaveis: ResponsavelCancelamentoTotvsDto[],
  ): Map<string, ResponsavelCancelamentoTotvsDto[]> {
    const grupos = new Map<string, ResponsavelCancelamentoTotvsDto[]>()

    for (const responsavel of responsaveis) {
      const chave = this.getResponsavelKey(responsavel)
      if (!chave) {
        this.logger.warn(
          `[CancelamentoResponsavel] Registro ignorado sem CD_Pessoa e CD_CPF (coligada ${responsavel.CD_Coligada})`,
        )
        continue
      }

      const grupo = grupos.get(chave) ?? []
      grupo.push(responsavel)
      grupos.set(chave, grupo)
    }

    return grupos
  }

  private selecionarGrupoUnitario(
    grupos: Map<string, ResponsavelCancelamentoTotvsDto[]>,
    data: CancelamentoResponsavelUnitarioJobData,
  ): (ResponsavelCancelamentoTotvsDto & {
    CD_Filiais?: number[]
    CD_Filiais_Aluno?: number[]
    CD_Alocacoes?: Array<{ CD_Coligada: number; CD_Filial: number }>
  }) | null {
    const chavePessoa =
      data.CD_Pessoa !== null && data.CD_Pessoa !== undefined
        ? `P:${data.CD_Pessoa}`
        : null
    const chaveCpf = data.CD_CPF ? `C:${data.CD_CPF}` : null

    const grupo =
      (chavePessoa ? grupos.get(chavePessoa) : null) ??
      (chaveCpf ? grupos.get(chaveCpf) : null) ??
      [...grupos.values()][0]

    if (!grupo || grupo.length === 0) {
      return null
    }

    return this.consolidarGrupo(grupo)
  }

  private consolidarGrupo(
    grupo: ResponsavelCancelamentoTotvsDto[],
  ): ResponsavelCancelamentoTotvsDto & {
    CD_Filiais: number[]
    CD_Filiais_Aluno: number[]
    CD_Alocacoes: Array<{ CD_Coligada: number; CD_Filial: number }>
  } {
    const base = grupo[0]
    const alocacaoMap = new Map<
      string,
      { CD_Coligada: number; CD_Filial: number }
    >()
    const alocacaoAlunoMap = new Map<
      string,
      { CD_Coligada: number; CD_Filial: number }
    >()

    for (const item of grupo) {
      this.addAlocacao(alocacaoMap, item.CD_Coligada, item.CD_Filial)
      this.addAlocacao(
        alocacaoAlunoMap,
        item.CD_Coligada_Aluno ?? item.CD_Coligada,
        item.CD_Filial_Aluno,
      )
    }

    const alocacoes = [...alocacaoMap.values()]
    const alocacoesAluno = [...alocacaoAlunoMap.values()]
    const primeiroComPessoa = grupo.find((item) => !!item.CD_Pessoa)
    const primeiroComUsuario = grupo.find((item) => !!item.CD_Usuario)
    const primeiroComCpf = grupo.find((item) => !!item.CD_CPF)
    const primeiroComColigadaAluno = grupo.find(
      (item) =>
        item.CD_Coligada_Aluno !== null &&
        item.CD_Coligada_Aluno !== undefined,
    )

    return {
      ...base,
      CD_Pessoa: primeiroComPessoa?.CD_Pessoa ?? base.CD_Pessoa,
      CD_Usuario: primeiroComUsuario?.CD_Usuario ?? base.CD_Usuario,
      CD_CPF: primeiroComCpf?.CD_CPF ?? base.CD_CPF,
      IN_Usuario_Ativo: this.consolidarFlagUsuarioAtivo(grupo),
      IN_Aluno: this.consolidarFlag(grupo, 'IN_Aluno'),
      IN_Funcionario: this.consolidarFlag(grupo, 'IN_Funcionario'),
      IN_Filiacao: this.consolidarFlag(grupo, 'IN_Filiacao'),
      IN_Responsavel_Academico: this.consolidarFlag(
        grupo,
        'IN_Responsavel_Academico',
      ),
      IN_Responsavel_Financeiro: this.consolidarFlag(
        grupo,
        'IN_Responsavel_Financeiro',
      ),
      IN_Existe_Matricula_Regular: this.consolidarFlag(
        grupo,
        'IN_Existe_Matricula_Regular',
      ),
      IN_Inativo_Regular: this.consolidarFlag(grupo, 'IN_Inativo_Regular'),
      IN_Existe_Matricula_Extra: this.consolidarFlag(
        grupo,
        'IN_Existe_Matricula_Extra',
      ),
      IN_Inativo_Extra: this.consolidarFlag(grupo, 'IN_Inativo_Extra'),
      CD_Filial: alocacoes.length > 0 ? alocacoes[0].CD_Filial : null,
      CD_Filiais: [...new Set(alocacoes.map((item) => item.CD_Filial))],
      CD_Alocacoes: alocacoesAluno,
      CD_Coligada_Aluno:
        primeiroComColigadaAluno?.CD_Coligada_Aluno ??
        base.CD_Coligada_Aluno ??
        null,
      CD_Filiais_Aluno: [
        ...new Set(alocacoesAluno.map((item) => item.CD_Filial)),
      ],
    }
  }

  private addAlocacao(
    map: Map<string, { CD_Coligada: number; CD_Filial: number }>,
    CD_Coligada: number | null | undefined,
    CD_Filial: number | null | undefined,
  ): void {
    if (CD_Coligada === null || CD_Coligada === undefined) {
      return
    }

    if (CD_Filial === null || CD_Filial === undefined) {
      return
    }

    const key = `${CD_Coligada}:${CD_Filial}`
    if (!map.has(key)) {
      map.set(key, { CD_Coligada, CD_Filial })
    }
  }

  private consolidarFlag(
    grupo: ResponsavelCancelamentoTotvsDto[],
    campo:
      | 'IN_Aluno'
      | 'IN_Funcionario'
      | 'IN_Filiacao'
      | 'IN_Responsavel_Academico'
      | 'IN_Responsavel_Financeiro'
      | 'IN_Existe_Matricula_Regular'
      | 'IN_Inativo_Regular'
      | 'IN_Existe_Matricula_Extra'
      | 'IN_Inativo_Extra',
  ): number {
    return grupo.some((item) => item[campo] === 1) ? 1 : 0
  }

  private consolidarFlagUsuarioAtivo(
    grupo: ResponsavelCancelamentoTotvsDto[],
  ): number | null {
    if (grupo.some((item) => item.IN_Usuario_Ativo === 1)) {
      return 1
    }

    if (grupo.every((item) => item.IN_Usuario_Ativo === 0)) {
      return 0
    }

    return null
  }

  private getResponsavelKey(
    responsavel: ResponsavelCancelamentoTotvsDto,
  ): string | null {
    if (responsavel.CD_Pessoa) {
      return `P:${responsavel.CD_Pessoa}`
    }

    if (responsavel.CD_CPF) {
      return `C:${responsavel.CD_CPF}`
    }

    return null
  }

  private parsePessoa(value: string | null): number | null {
    if (!value) return null

    const parsed = Number(value)
    return Number.isNaN(parsed) ? null : parsed
  }

}
