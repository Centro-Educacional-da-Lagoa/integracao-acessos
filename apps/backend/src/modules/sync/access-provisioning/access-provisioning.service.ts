import { Injectable, Logger } from '@nestjs/common'
import { TotvsService } from '../../integrations/totvs/totvs.service'
import { GoogleService } from '../../integrations/google/google.service'
import { PessoaAcessoContext } from './interfaces/pessoa-acesso-context.interface'
import { TipoEntidade } from './enums/tipo-entidade.enum'
import {
  PERFIS_ACESSO,
  PerfilAcessoEntry,
} from './constants/perfis-acesso.constants'

// ─── Tipos internos ────────────────────────────────────────────────────────────

interface GusrPerfilItem {
  CODCOLIGADA: number
  CODUSUARIO: string
  CODSISTEMA: string
  CODPERFIL: string
  INDICE: number
}

interface SistemaPerfilData {
  dadosUsuario: any
  gpermis: any[]
  gusrperfil: GusrPerfilItem[]
}

type PerfisColetados = Record<string, SistemaPerfilData>

// ─── Serviço ──────────────────────────────────────────────────────────────────

@Injectable()
export class AccessProvisioningService {
  private readonly logger = new Logger(AccessProvisioningService.name)
  private readonly sistemasConhecidos = ['A', 'S', 'L']

  constructor(
    private readonly totvsService: TotvsService,
    private readonly googleService: GoogleService,
  ) {}

  // ─── Orquestrador principal ────────────────────────────────────────────────

  async provisionarAcesso(ctx: PessoaAcessoContext): Promise<void> {
    const papeis = this._getPapeisAtivos(ctx).join(', ') || 'sem papel'
    this.logger.log(
      `[Provisioning] Iniciando para ${ctx.CD_Identificador} (${papeis}, coligada ${ctx.CD_Coligada})`,
    )

    await this._garantirEmailPessoa(ctx)

    const { cdUsuarioFinal, dadosUsuario, perfisTransferiveis } =
      await this._garantirUsuario(ctx)

    await this._garantirUsuarioFilial(ctx, cdUsuarioFinal)

    if (!dadosUsuario) {
      this.logger.warn(
        `[Provisioning] Dados do usuário ${cdUsuarioFinal} indisponíveis após garantia — pulando perfis`,
      )
      return
    }

    await this._garantirPerfis(cdUsuarioFinal, ctx, perfisTransferiveis)

    this.logger.log(`[Provisioning] Concluído para ${ctx.CD_Identificador}`)
  }

  async revogarAcesso(ctx: PessoaAcessoContext): Promise<void> {
    const papeis = this._getPapeisAtivos(ctx).join(', ') || 'sem papel'
    this.logger.log(
      `[Revogação] Iniciando para ${ctx.CD_Identificador} (${papeis}, coligada ${ctx.CD_Coligada})`,
    )

    if (ctx.TP_Origem_Revogacao === 'RESPONSAVEL') {
      await this._revogarAcessoResponsavel(ctx)
      return
    }

    if (!this._isElegivelRevogacaoAluno(ctx)) {
      this.logger.log(
        `[Revogação] ${ctx.CD_Identificador} não está elegível para cancelamento de acesso — skip`,
      )
      return
    }

    await this._cancelarEmailInstitucional(ctx)

    if (!ctx.CD_Usuario) {
      this.logger.log(
        `[Revogação] ${ctx.CD_Identificador} sem CD_Usuario vinculado — removendo apenas ações de e-mail`,
      )
      return
    }

    await this._revogarUsuarioFilial(ctx, ctx.CD_Usuario)

    if (this._deveInativarUsuarioNoCancelamento(ctx)) {
      const result = await this.totvsService.inativarUsuario(ctx.CD_Usuario)
      if (result.status === 'Error') {
        this.logger.warn(
          `[Revogação] Falha ao inativar usuário ${ctx.CD_Usuario} no TOTVS`,
        )
        return
      }

      this.logger.log(
        `[Revogação] Usuário ${ctx.CD_Usuario} inativado com sucesso no TOTVS`,
      )
      return
    }

    if (!this._deveRemoverPerfilAlunoNoCancelamento(ctx)) {
      this.logger.log(
        `[Revogação] Usuário ${ctx.CD_Usuario} preservado por regra de negócio`,
      )
      return
    }

    await this._removerPerfisPorEntidade(ctx.CD_Usuario, ctx, [
      TipoEntidade.ALUNO,
    ])
  }

  private async _revogarAcessoResponsavel(
    ctx: PessoaAcessoContext,
  ): Promise<void> {
    const usuarioRevogacao = await this._resolverUsuarioRevogacao(ctx)

    if (!usuarioRevogacao.cdUsuario) {
      this.logger.log(
        `[Revogação][Responsável] ${ctx.CD_Identificador} sem usuário resolvido (CD_Usuario/CD_CPF) — skip`,
      )
      return
    }

    if (!ctx.IN_Aluno && !ctx.IN_Funcionario) {
      await this._revogarTodosUsuarioFilialAtivosResponsavel(
        usuarioRevogacao.cdUsuario,
      )
      await this._removerPerfisPorEntidade(usuarioRevogacao.cdUsuario, ctx, [
        TipoEntidade.RESPONSAVEL,
      ])

      if (usuarioRevogacao.inUsuarioAtivo === 0) {
        this.logger.log(
          `[Revogação][Responsável] Usuário ${usuarioRevogacao.cdUsuario} já inativo — limpeza de perfis e usuário-filial concluída`,
        )
        return
      }

      const result = await this.totvsService.inativarUsuario(
        usuarioRevogacao.cdUsuario,
      )
      if (result.status === 'Error') {
        this.logger.warn(
          `[Revogação][Responsável] Falha ao inativar usuário ${usuarioRevogacao.cdUsuario}`,
        )
        return
      }

      this.logger.log(
        `[Revogação][Responsável] Usuário ${usuarioRevogacao.cdUsuario} inativado com sucesso no TOTVS`,
      )
      return
    }

    if (ctx.IN_Aluno && !ctx.IN_Funcionario) {
      await this._sincronizarUsuarioFilialResponsavelAluno(
        ctx,
        usuarioRevogacao.cdUsuario,
      )
    }

    await this._removerPerfisPorEntidade(usuarioRevogacao.cdUsuario, ctx, [
      TipoEntidade.RESPONSAVEL,
    ])
  }

  // ─── E-mail da Pessoa ──────────────────────────────────────────────────────

  private _isElegivelEmailPessoa(ctx: PessoaAcessoContext): boolean {
    return (
      !ctx.IN_Funcionario &&
      !ctx.IN_Responsavel &&
      !!ctx.IN_Existe_Matricula_Regular &&
      !ctx.IN_Existe_Matricula_Extra
    )
  }

  private _deveGerenciarEmailUsuarioAluno(ctx: PessoaAcessoContext): boolean {
    return (
      !!ctx.IN_Aluno &&
      !ctx.IN_Funcionario &&
      !ctx.IN_Responsavel &&
      !!ctx.IN_Existe_Matricula_Regular &&
      !!ctx.IN_Existe_Matricula_Extra
    )
  }

  private _resolverEmailAlvoUsuario(ctx: PessoaAcessoContext): string | null {
    if (!this._deveGerenciarEmailUsuarioAluno(ctx)) {
      return ctx.TX_Email_Usuario ?? null
    }

    return ctx.TX_Email_Institucional
  }

  private _isElegivelRevogacaoAluno(ctx: PessoaAcessoContext): boolean {
    return (
      !!ctx.IN_Aluno && (!!ctx.IN_Inativo_Regular || !!ctx.IN_Inativo_Extra)
    )
  }

  private _deveCancelarEmailInstitucional(ctx: PessoaAcessoContext): boolean {
    return (
      !!ctx.IN_Aluno &&
      !!ctx.IN_Existe_Matricula_Regular &&
      !!ctx.IN_Inativo_Regular &&
      this._isEmailInstitucionalAluno(ctx.TX_Email_Institucional, ctx)
    )
  }

  private _deveInativarUsuarioNoCancelamento(
    ctx: PessoaAcessoContext,
  ): boolean {
    return (
      !!ctx.CD_Usuario &&
      ctx.IN_Usuario_Ativo === 1 &&
      !ctx.IN_Funcionario &&
      !ctx.IN_Responsavel &&
      (!ctx.IN_Existe_Matricula_Regular ||
        (!!ctx.IN_Inativo_Regular && !!ctx.IN_Existe_Matricula_Regular)) &&
      (!ctx.IN_Existe_Matricula_Extra ||
        (!!ctx.IN_Inativo_Extra && !!ctx.IN_Existe_Matricula_Extra))
    )
  }

  private _deveRemoverPerfilAlunoNoCancelamento(
    ctx: PessoaAcessoContext,
  ): boolean {
    return (
      !!ctx.CD_Usuario &&
      !this._deveInativarUsuarioNoCancelamento(ctx) &&
      (!ctx.IN_Existe_Matricula_Regular ||
        (!!ctx.IN_Inativo_Regular && !!ctx.IN_Existe_Matricula_Regular)) &&
      (!ctx.IN_Existe_Matricula_Extra ||
        (!!ctx.IN_Inativo_Extra && !!ctx.IN_Existe_Matricula_Extra))
    )
  }

  private _isEmailInstitucionalAluno(
    TX_Email: string,
    ctx: PessoaAcessoContext,
  ): boolean {
    const domain = ctx.NM_Dominio_Email_Institucional.toLowerCase()
    return TX_Email.toLowerCase().endsWith(`@${domain}`)
  }

  private async _garantirEmailPessoa(ctx: PessoaAcessoContext): Promise<void> {
    if (!this._isElegivelEmailPessoa(ctx)) return
    if (ctx.TX_Email_Pessoa === ctx.TX_Email_Institucional) return

    this.logger.log(
      `[EmailPessoa] Atualizando email da pessoa ${ctx.CD_Pessoa} para ${ctx.TX_Email_Institucional}`,
    )

    const result = await this.totvsService.atualizarEmailAluno(
      ctx.CD_Coligada,
      ctx.CD_Pessoa,
      ctx.TX_Email_Institucional,
    )

    if (result.status === 'Error') {
      this.logger.warn(
        `[EmailPessoa] Falha ao atualizar email da pessoa ${ctx.CD_Pessoa}`,
      )
    }
  }

  private async _cancelarEmailInstitucional(
    ctx: PessoaAcessoContext,
  ): Promise<void> {
    if (!this._deveCancelarEmailInstitucional(ctx)) {
      return
    }

    const status = await this.googleService.cancelarEmailInstitucional(
      ctx.TX_Email_Institucional,
      ctx.CD_Coligada,
    )

    this.logger.log(
      `[Revogação] Gmail ${ctx.TX_Email_Institucional} -> ${status}`,
    )
  }

  // ─── Usuário ───────────────────────────────────────────────────────────────

  /**
   * Funcionário e responsável têm prioridade: seu login correto é o CPF.
   * Caso a pessoa seja apenas aluno, usa o CD_Identificador (RA).
   */
  private _resolverCdUsuarioCorreto(ctx: PessoaAcessoContext): string {
    if (ctx.IN_Funcionario || ctx.IN_Responsavel) {
      if (!ctx.CD_CPF) {
        throw new Error(
          `CD_CPF ausente para funcionário/responsável — pessoa ${ctx.CD_Pessoa}`,
        )
      }
      return ctx.CD_CPF
    }
    return ctx.CD_Identificador
  }

  private async _garantirUsuario(ctx: PessoaAcessoContext): Promise<{
    cdUsuarioFinal: string
    dadosUsuario: any
    perfisTransferiveis: GusrPerfilItem[]
  }> {
    const cdUsuarioCorreto = this._resolverCdUsuarioCorreto(ctx)
    let perfisTransferiveis: GusrPerfilItem[] = []

    // Cenário C — usuário errado atrelado
    if (ctx.CD_Usuario !== null && ctx.CD_Usuario !== cdUsuarioCorreto) {
      this.logger.log(
        `[Usuário] CD_Usuario atual (${ctx.CD_Usuario}) ≠ correto (${cdUsuarioCorreto}) — substituindo`,
      )

      const coletados = await this._coletarPerfisUsuario(ctx.CD_Usuario)
      perfisTransferiveis = this._filtrarPerfisTransferiveis(coletados, ctx)

      const dadosUsuario = await this._criarOuAtivarEVincular(
        ctx,
        cdUsuarioCorreto,
      )

      const resultInativar = await this.totvsService.inativarUsuario(
        ctx.CD_Usuario,
      )
      if (resultInativar.status === 'Error') {
        this.logger.warn(
          `[Usuário] Falha ao inativar usuário antigo ${ctx.CD_Usuario}`,
        )
      }

      return {
        cdUsuarioFinal: cdUsuarioCorreto,
        dadosUsuario,
        perfisTransferiveis,
      }
    }

    // Cenário A — sem usuário atrelado
    if (ctx.CD_Usuario === null) {
      const dadosUsuario = await this._criarOuAtivarEVincular(
        ctx,
        cdUsuarioCorreto,
      )
      return {
        cdUsuarioFinal: cdUsuarioCorreto,
        dadosUsuario,
        perfisTransferiveis,
      }
    }

    // Cenário B — usuário correto já atrelado
    const dadosUsuario = await this._garantirUsuarioAtivoEEmailCorreto(
      ctx,
      cdUsuarioCorreto,
    )
    return {
      cdUsuarioFinal: cdUsuarioCorreto,
      dadosUsuario,
      perfisTransferiveis,
    }
  }

  /**
   * Cenário A: verifica existência do usuário, cria ou ativa conforme necessário
   * e então o vincula à pessoa.
   */
  private async _criarOuAtivarEVincular(
    ctx: PessoaAcessoContext,
    cdUsuarioCorreto: string,
  ): Promise<any> {
    const usuarioExistente =
      await this.totvsService.verificarUsuario(cdUsuarioCorreto)

    if (!usuarioExistente) {
      const emailAlvoUsuario = this._resolverEmailAlvoUsuario(ctx)
      const result = await this.totvsService.criarUsuario(
        {
          cdUsuario: cdUsuarioCorreto,
          nome: ctx.NM_Pessoa,
          dtNascimento: ctx.DT_Nascimento,
        },
        emailAlvoUsuario,
      )
      if (result.status === 'Error') {
        throw new Error(
          `[Usuário] Falha ao criar usuário ${cdUsuarioCorreto} — pessoa ${ctx.CD_Pessoa}`,
        )
      }
    } else if (usuarioExistente.STATUS !== 1) {
      const emailAlvoUsuario = this._resolverEmailAlvoUsuario(ctx)
      const result = await this.totvsService.ativarUsuario(
        cdUsuarioCorreto,
        usuarioExistente.EMAIL ?? null,
        emailAlvoUsuario,
      )
      if (result.status === 'Error') {
        throw new Error(
          `[Usuário] Falha ao reativar usuário ${cdUsuarioCorreto} — pessoa ${ctx.CD_Pessoa}`,
        )
      }
    }

    const resultVincular = await this.totvsService.vincularUsuarioPessoa(
      ctx.CD_Coligada,
      ctx.CD_Pessoa,
      cdUsuarioCorreto,
    )
    if (resultVincular.status === 'Error') {
      throw new Error(
        `[Usuário] Falha ao vincular usuário ${cdUsuarioCorreto} à pessoa ${ctx.CD_Pessoa}`,
      )
    }

    return await this.totvsService.verificarUsuario(cdUsuarioCorreto)
  }

  /**
   * Cenário B: usuário correto já atrelado — garante que está ativo e,
   * quando elegível (aluno com matrícula regular ativa), com e-mail correto.
   */
  private async _garantirUsuarioAtivoEEmailCorreto(
    ctx: PessoaAcessoContext,
    cdUsuario: string,
  ): Promise<any> {
    if (ctx.IN_Usuario_Ativo !== 1) {
      const emailAlvoUsuario = this._resolverEmailAlvoUsuario(ctx)
      const result = await this.totvsService.ativarUsuario(
        cdUsuario,
        ctx.TX_Email_Usuario,
        emailAlvoUsuario,
      )
      if (result.status === 'Error') {
        this.logger.warn(`[Usuário] Falha ao reativar usuário ${cdUsuario}`)
      }
    } else {
      // Atualiza email do usuário apenas para alunos com matrícula regular ativa
      const deveAtualizarEmail =
        this._deveGerenciarEmailUsuarioAluno(ctx) &&
        (!ctx.TX_Email_Usuario ||
          ctx.TX_Email_Usuario !== ctx.TX_Email_Institucional)

      if (deveAtualizarEmail) {
        const result = await this.totvsService.atualizarEmailUsuario(
          cdUsuario,
          ctx.TX_Email_Institucional,
        )
        if (result.status === 'Error') {
          this.logger.warn(
            `[Usuário] Falha ao atualizar email do usuário ${cdUsuario}`,
          )
        }
      }
    }

    return await this.totvsService.verificarUsuario(cdUsuario)
  }

  private async _garantirUsuarioFilial(
    ctx: PessoaAcessoContext,
    cdUsuario: string,
  ): Promise<void> {
    if (ctx.IN_Responsavel && !ctx.IN_Funcionario) {
      await this._sincronizarUsuarioFilialResponsavelConcessao(ctx, cdUsuario)
      return
    }

    if (ctx.IN_Responsavel && ctx.CD_Alocacoes && ctx.CD_Alocacoes.length > 0) {
      await this._garantirUsuarioFiliaisPorAlocacao(ctx, cdUsuario)
      return
    }

    if (!ctx.IN_Funcionario && !ctx.IN_Responsavel) {
      await this._sincronizarUsuarioFilialAluno(ctx, cdUsuario)
      return
    }

    if (ctx.CD_Filial === null || ctx.CD_Filial === undefined) {
      this.logger.warn(
        `[UsuarioFilial] CD_Filial ausente para usuário ${cdUsuario} na coligada ${ctx.CD_Coligada} — etapa ignorada`,
      )
      return
    }

    const result = await this.totvsService.garantirUsuarioFilial({
      cdColigada: ctx.CD_Coligada,
      cdFilial: ctx.CD_Filial,
      cdUsuario,
      inFuncionario: ctx.IN_Funcionario,
    })

    if (result.status === 'Error') {
      this.logger.warn(
        `[UsuarioFilial] Falha ao garantir acesso usuário-filial para ${cdUsuario} (coligada ${ctx.CD_Coligada}, filial ${ctx.CD_Filial})`,
      )
    }
  }

  private async _sincronizarUsuarioFilialAluno(
    ctx: PessoaAcessoContext,
    cdUsuario: string,
  ): Promise<void> {
    if (ctx.CD_Filial === null || ctx.CD_Filial === undefined) {
      this.logger.warn(
        `[UsuarioFilial][Aluno] CD_Filial ausente para usuário ${cdUsuario} na coligada ${ctx.CD_Coligada} — etapa ignorada`,
      )
      return
    }

    const alocacoes = [
      {
        CD_Coligada: ctx.CD_Coligada,
        CD_Filial: ctx.CD_Filial,
      },
    ]

    await this._revogarUsuarioFilialForaDasAlocacoes(cdUsuario, alocacoes)

    const result = await this.totvsService.garantirUsuarioFilial({
      cdColigada: ctx.CD_Coligada,
      cdFilial: ctx.CD_Filial,
      cdUsuario,
      inFuncionario: 0,
    })

    if (result.status === 'Error') {
      this.logger.warn(
        `[UsuarioFilial][Aluno] Falha ao garantir acesso usuário-filial para ${cdUsuario} (coligada ${ctx.CD_Coligada}, filial ${ctx.CD_Filial})`,
      )
    }
  }

  private async _sincronizarUsuarioFilialResponsavelConcessao(
    ctx: PessoaAcessoContext,
    cdUsuario: string,
  ): Promise<void> {
    const alocacoes = this._resolverAlocacoesConcessaoResponsavel(ctx)

    if (alocacoes.length === 0) {
      this.logger.warn(
        `[UsuarioFilial][Responsável] Nenhuma alocação permitida para concessão do usuário ${cdUsuario} — etapa ignorada para evitar revogação indevida`,
      )
      return
    }

    await this._revogarUsuarioFilialForaDasAlocacoes(cdUsuario, alocacoes)

    for (const alocacao of alocacoes) {
      const result = await this.totvsService.garantirUsuarioFilial({
        cdColigada: alocacao.CD_Coligada,
        cdFilial: alocacao.CD_Filial,
        cdUsuario,
        inFuncionario: 0,
      })

      if (result.status === 'Error') {
        this.logger.warn(
          `[UsuarioFilial][Responsável] Falha ao garantir acesso usuário-filial para ${cdUsuario} (coligada ${alocacao.CD_Coligada}, filial ${alocacao.CD_Filial})`,
        )
      }
    }
  }

  private async _garantirUsuarioFiliaisPorAlocacao(
    ctx: PessoaAcessoContext,
    cdUsuario: string,
  ): Promise<void> {
    const alocacoes = this._deduplicarAlocacoes(ctx.CD_Alocacoes ?? [])

    for (const alocacao of alocacoes) {
      const result = await this.totvsService.garantirUsuarioFilial({
        cdColigada: alocacao.CD_Coligada,
        cdFilial: alocacao.CD_Filial,
        cdUsuario,
        inFuncionario: ctx.IN_Funcionario,
      })

      if (result.status === 'Error') {
        this.logger.warn(
          `[UsuarioFilial][Responsável] Falha ao garantir acesso usuário-filial para ${cdUsuario} (coligada ${alocacao.CD_Coligada}, filial ${alocacao.CD_Filial})`,
        )
      }
    }
  }

  private async _sincronizarUsuarioFilialResponsavelAluno(
    ctx: PessoaAcessoContext,
    cdUsuario: string,
  ): Promise<void> {
    const alocacoes = this._resolverAlocacoesAlunoResponsavel(ctx)
    if (alocacoes.length === 0) {
      this.logger.warn(
        `[UsuarioFilial][Responsável] Alocação de aluno ausente para usuário ${cdUsuario} — revogando todos os acessos usuário-filial ativos`,
      )
      await this._revogarTodosUsuarioFilialAtivosResponsavel(cdUsuario)
      return
    }

    await this._revogarUsuarioFilialForaDasAlocacoes(cdUsuario, alocacoes)

    for (const alocacao of alocacoes) {
      const result = await this.totvsService.garantirUsuarioFilial({
        cdColigada: alocacao.CD_Coligada,
        cdFilial: alocacao.CD_Filial,
        cdUsuario,
        inFuncionario: ctx.IN_Funcionario ? 1 : 0,
      })

      if (result.status === 'Error') {
        this.logger.warn(
          `[UsuarioFilial][Responsável] Falha ao garantir acesso usuário-filial para ${cdUsuario} (coligada ${alocacao.CD_Coligada}, filial ${alocacao.CD_Filial})`,
        )
      }
    }
  }

  private async _revogarTodosUsuarioFilialAtivosResponsavel(
    cdUsuario: string,
  ): Promise<void> {
    const alocacoesAtivas =
      await this.totvsService.fetchUsuarioFiliaisAtivos(cdUsuario)

    for (const alocacao of alocacoesAtivas) {
      const result = await this.totvsService.revogarUsuarioFilial({
        cdColigada: alocacao.CODCOLIGADA,
        cdFilial: alocacao.CODFILIAL,
        cdUsuario,
      })

      if (result.status === 'Error') {
        this.logger.warn(
          `[UsuarioFilial][Responsável] Falha ao revogar acesso ativo para ${cdUsuario} (coligada ${alocacao.CODCOLIGADA}, filial ${alocacao.CODFILIAL})`,
        )
      }
    }
  }

  private async _revogarUsuarioFilialForaDasAlocacoes(
    cdUsuario: string,
    alocacoesPermitidas: Array<{ CD_Coligada: number; CD_Filial: number }>,
  ): Promise<void> {
    const alocacoesAtivas =
      await this.totvsService.fetchUsuarioFiliaisAtivos(cdUsuario)

    const chavesPermitidas = new Set(
      alocacoesPermitidas.map(
        (alocacao) => `${alocacao.CD_Coligada}:${alocacao.CD_Filial}`,
      ),
    )

    const alocacoesRevogacao = alocacoesAtivas.filter(
      (alocacao) =>
        !chavesPermitidas.has(`${alocacao.CODCOLIGADA}:${alocacao.CODFILIAL}`),
    )

    for (const alocacao of alocacoesRevogacao) {
      const result = await this.totvsService.revogarUsuarioFilial({
        cdColigada: alocacao.CODCOLIGADA,
        cdFilial: alocacao.CODFILIAL,
        cdUsuario,
      })

      if (result.status === 'Error') {
        this.logger.warn(
          `[UsuarioFilial][Responsável] Falha ao revogar filial fora da alocação permitida para ${cdUsuario} (coligada ${alocacao.CODCOLIGADA}, filial ${alocacao.CODFILIAL})`,
        )
      }
    }
  }

  private _resolverAlocacoesConcessaoResponsavel(
    ctx: PessoaAcessoContext,
  ): Array<{ CD_Coligada: number; CD_Filial: number }> {
    return this._deduplicarAlocacoes([
      ...(ctx.CD_Alocacoes_Responsavel ?? []),
      ...this._resolverAlocacoesAlunoResponsavel(ctx),
      ...this._resolverAlocacoesExtraResponsavel(ctx),
    ])
  }

  private _resolverAlocacoesExtraResponsavel(
    ctx: PessoaAcessoContext,
  ): Array<{ CD_Coligada: number; CD_Filial: number }> {
    if (ctx.IN_Matricula_Extra_Ativa_Coligada5 !== 1) {
      return []
    }

    return [{ CD_Coligada: 6, CD_Filial: 1 }]
  }

  private _resolverAlocacoesAlunoResponsavel(
    ctx: PessoaAcessoContext,
  ): Array<{ CD_Coligada: number; CD_Filial: number }> {
    if (ctx.CD_Alocacoes && ctx.CD_Alocacoes.length > 0) {
      return this._deduplicarAlocacoes(ctx.CD_Alocacoes)
    }

    const cdColigadaAluno = ctx.CD_Coligada_Aluno ?? ctx.CD_Coligada
    const filiaisAluno = ctx.CD_Filiais_Aluno ?? []

    return this._deduplicarAlocacoes(
      filiaisAluno.map((CD_Filial) => ({
        CD_Coligada: cdColigadaAluno,
        CD_Filial,
      })),
    )
  }

  private _deduplicarAlocacoes(
    alocacoes: Array<{ CD_Coligada: number; CD_Filial: number }>,
  ): Array<{ CD_Coligada: number; CD_Filial: number }> {
    const map = new Map<string, { CD_Coligada: number; CD_Filial: number }>()

    for (const alocacao of alocacoes) {
      const key = `${alocacao.CD_Coligada}:${alocacao.CD_Filial}`
      if (!map.has(key)) {
        map.set(key, alocacao)
      }
    }

    return [...map.values()]
  }

  private _resolverFiliaisResponsavel(ctx: PessoaAcessoContext): number[] {
    if (ctx.CD_Filiais && ctx.CD_Filiais.length > 0) {
      return [...new Set(ctx.CD_Filiais)]
    }

    if (ctx.CD_Filial !== null && ctx.CD_Filial !== undefined) {
      return [ctx.CD_Filial]
    }

    return []
  }

  private async _resolverUsuarioRevogacao(ctx: PessoaAcessoContext): Promise<{
    cdUsuario: string | null
    inUsuarioAtivo: number | null
  }> {
    if (ctx.CD_Usuario) {
      return {
        cdUsuario: ctx.CD_Usuario,
        inUsuarioAtivo: ctx.IN_Usuario_Ativo,
      }
    }

    if (ctx.CD_CPF) {
      const usuarioCpf = await this.totvsService.verificarUsuario(ctx.CD_CPF)
      if (usuarioCpf) {
        this.logger.log(
          `[Revogação] Usuário resolvido por CD_CPF ${ctx.CD_CPF} para ${ctx.CD_Identificador}`,
        )
        return {
          cdUsuario: ctx.CD_CPF,
          inUsuarioAtivo:
            typeof usuarioCpf.STATUS === 'number' ? usuarioCpf.STATUS : null,
        }
      }
    }

    return {
      cdUsuario: null,
      inUsuarioAtivo: null,
    }
  }

  private async _revogarUsuarioFilial(
    ctx: PessoaAcessoContext,
    cdUsuario: string,
  ): Promise<void> {
    if (ctx.IN_Funcionario || ctx.IN_Responsavel) {
      return
    }

    if (ctx.CD_Filial === null || ctx.CD_Filial === undefined) {
      this.logger.warn(
        `[UsuarioFilial] CD_Filial ausente para revogação do usuário ${cdUsuario} na coligada ${ctx.CD_Coligada} — etapa ignorada`,
      )
      return
    }

    const result = await this.totvsService.revogarUsuarioFilial({
      cdColigada: ctx.CD_Coligada,
      cdFilial: ctx.CD_Filial,
      cdUsuario,
    })

    if (result.status === 'Error') {
      this.logger.warn(
        `[UsuarioFilial] Falha ao revogar acesso usuário-filial para ${cdUsuario} (coligada ${ctx.CD_Coligada}, filial ${ctx.CD_Filial})`,
      )
    }
  }

  // ─── Coleta e filtro de perfis ─────────────────────────────────────────────

  /**
   * Coleta todos os perfis do usuário sem filtro de sistema.
   * Faz um GET por sistema conhecido para contornar o escopo por CODSISTEMA da API TOTVS.
   * O filtro por TP_Entidade é aplicado depois em _filtrarPerfisTransferiveis.
   */
  private async _coletarPerfisUsuario(
    cdUsuario: string,
  ): Promise<PerfisColetados> {
    const resultado: PerfisColetados = {}

    for (const codSistema of this.sistemasConhecidos) {
      const dados = await this.totvsService.buscarUsuarioPorSistema(
        cdUsuario,
        codSistema,
      )
      if (!dados) continue

      const gpermis: any[] = dados.GPERMIS ?? []
      const gusrperfil: GusrPerfilItem[] = gpermis.flatMap(
        (p: any) => p.GUSRPERFIL ?? [],
      )

      resultado[codSistema] = { dadosUsuario: dados, gpermis, gusrperfil }
    }

    return resultado
  }

  /**
   * Retorna os papéis ativos da pessoa com base nos campos IN_*.
   * Uma pessoa pode ter múltiplos papéis simultaneamente.
   */
  private _getPapeisAtivos(ctx: PessoaAcessoContext): TipoEntidade[] {
    const papeis: TipoEntidade[] = []
    if (ctx.IN_Aluno) papeis.push(TipoEntidade.ALUNO)
    if (ctx.IN_Funcionario) papeis.push(TipoEntidade.FUNCIONARIO)
    if (ctx.IN_Responsavel) papeis.push(TipoEntidade.RESPONSAVEL)
    return papeis
  }

  /**
   * Filtra os perfis coletados, mantendo apenas os elegíveis para transferência.
   * Um perfil é mantido se:
   * - Não está mapeado em PERFIS_ACESSO (desconhecido) → mantém sem filtro
   * - Está mapeado e seu TP_Entidade corresponde a qualquer papel ativo da pessoa
   * Um perfil é descartado se está mapeado e seu TP_Entidade não corresponde
   * a nenhum papel ativo (ex: perfil de FUNCIONARIO para pessoa que deixou de sê-lo).
   */
  private _filtrarPerfisTransferiveis(
    perfis: PerfisColetados,
    ctx: PessoaAcessoContext,
  ): GusrPerfilItem[] {
    const papeis = this._getPapeisAtivos(ctx)
    const resultado: GusrPerfilItem[] = []

    for (const [codSistema, sistemaDados] of Object.entries(perfis)) {
      for (const perfilItem of sistemaDados.gusrperfil) {
        const mapeamento = PERFIS_ACESSO.find(
          (p) =>
            p.NM_Perfil === perfilItem.CODPERFIL && p.CD_Sistema === codSistema,
        )

        if (!mapeamento) {
          // Perfil desconhecido — mantém sem filtro
          resultado.push(perfilItem)
          continue
        }

        if (this._isPerfilEsperadoParaContexto(mapeamento, papeis, ctx)) {
          resultado.push(perfilItem)
        }
        // else: descarta (TP_Entidade do perfil não é um papel ativo desta pessoa)
      }
    }

    return resultado
  }

  // ─── Garantia de perfis ────────────────────────────────────────────────────

  /**
   * Garante que o usuário possui todos os perfis esperados.
   * Processa em batch por sistema: um único PUT por sistema com todos os perfis faltando.
   * Lida com transferíveis de múltiplas coligadas.
   */
  private async _garantirPerfis(
    cdUsuario: string,
    ctx: PessoaAcessoContext,
    perfisTransferiveis: GusrPerfilItem[] = [],
  ): Promise<void> {
    // Mapa: sistema → coligada → Set<codPerfil>
    const perfisPorSistemaColigada = new Map<string, Map<number, Set<string>>>()

    const registrarPerfil = (
      codSistema: string,
      codColigada: number,
      codPerfil: string,
    ) => {
      if (!perfisPorSistemaColigada.has(codSistema)) {
        perfisPorSistemaColigada.set(codSistema, new Map())
      }
      const coligadasMap = perfisPorSistemaColigada.get(codSistema)!
      if (!coligadasMap.has(codColigada)) {
        coligadasMap.set(codColigada, new Set())
      }
      coligadasMap.get(codColigada)!.add(codPerfil)
    }

    // Perfis esperados da constante para as coligadas aplicáveis + todos os papéis ativos da pessoa
    const papeis = this._getPapeisAtivos(ctx)
    const coligadasPerfil = this._resolverColigadasPerfil(ctx)
    for (const entry of PERFIS_ACESSO) {
      if (
        coligadasPerfil.includes(entry.CD_Coligada) &&
        this._isPerfilEsperadoParaContexto(entry, papeis, ctx)
      ) {
        registrarPerfil(entry.CD_Sistema, entry.CD_Coligada, entry.NM_Perfil)
      }
    }

    // Perfis transferíveis (podem abranger múltiplas coligadas e sistemas)
    for (const p of perfisTransferiveis) {
      registrarPerfil(p.CODSISTEMA, p.CODCOLIGADA, p.CODPERFIL)
    }

    if (perfisPorSistemaColigada.size === 0) return

    for (const [codSistema, coligadasMap] of perfisPorSistemaColigada) {
      const dadosUsuario = await this.totvsService.buscarUsuarioPorSistema(
        cdUsuario,
        codSistema,
      )
      if (!dadosUsuario) {
        this.logger.warn(
          `[Perfis] Usuário ${cdUsuario} não encontrado no sistema ${codSistema} — skip`,
        )
        continue
      }

      const gpermisAtual: any[] = dadosUsuario?.GPERMIS ?? []
      const gpermisAtualizado = [...gpermisAtual]
      let houveMudanca = false

      for (const [coligada, perfisEsperados] of coligadasMap) {
        const gpermisColigada = gpermisAtual.find(
          (p) => p.CODCOLIGADA === coligada,
        )
        const perfisExistentes = new Set<string>(
          gpermisColigada?.GUSRPERFIL?.map((p: any) => p.CODPERFIL) ?? [],
        )

        const perfisFaltando = [...perfisEsperados].filter(
          (p) => !perfisExistentes.has(p),
        )
        if (perfisFaltando.length === 0) {
          this.logger.log(
            `[Perfis] [Sistema ${codSistema}] Usuário ${cdUsuario} já possui todos os perfis na coligada ${coligada} — skip`,
          )
          continue
        }

        houveMudanca = true
        this.logger.log(
          `[Perfis] [Sistema ${codSistema}] Concedendo [${perfisFaltando.join(', ')}] ao usuário ${cdUsuario} na coligada ${coligada}`,
        )

        const novosPerfilObjs = perfisFaltando.map((codPerfil, idx) => ({
          CODCOLIGADA: coligada,
          CODUSUARIO: cdUsuario,
          CODSISTEMA: codSistema,
          CODPERFIL: codPerfil,
          INDICE: idx,
        }))

        const idxColigada = gpermisAtualizado.findIndex(
          (p) => p.CODCOLIGADA === coligada,
        )
        if (idxColigada === -1) {
          gpermisAtualizado.push({
            CODCOLIGADA: coligada,
            CODSISTEMA: codSistema,
            CODUSUARIO: cdUsuario,
            GUSRPERFIL: novosPerfilObjs,
          })
        } else {
          gpermisAtualizado[idxColigada] = {
            ...gpermisAtualizado[idxColigada],
            GUSRPERFIL: [
              ...(gpermisAtualizado[idxColigada].GUSRPERFIL ?? []),
              ...novosPerfilObjs,
            ],
          }
        }
      }

      if (!houveMudanca) continue

      const result = await this.totvsService.atualizarPerfisUsuario(
        cdUsuario,
        codSistema,
        gpermisAtualizado,
        dadosUsuario,
      )

      if (result.status === 'Error') {
        this.logger.warn(
          `[Perfis] [Sistema ${codSistema}] Falha ao conceder perfis ao usuário ${cdUsuario}`,
        )
      }
    }
  }

  private _resolverColigadasPerfil(ctx: PessoaAcessoContext): number[] {
    const coligadas = [ctx.CD_Coligada]

    if (ctx.IN_Responsavel && ctx.IN_Matricula_Extra_Ativa_Coligada5 === 1) {
      coligadas.push(6)
    }

    return [...new Set(coligadas)]
  }

  private async _removerPerfisPorEntidade(
    cdUsuario: string,
    ctx: PessoaAcessoContext,
    entidades: TipoEntidade[],
  ): Promise<void> {
    for (const codSistema of this.sistemasConhecidos) {
      const dadosUsuario = await this.totvsService.buscarUsuarioPorSistema(
        cdUsuario,
        codSistema,
      )

      if (!dadosUsuario) {
        continue
      }

      const gpermisAtual: any[] = dadosUsuario.GPERMIS ?? []
      const perfisRemocao = gpermisAtual.flatMap((permissao) => {
        const perfisAtuais: GusrPerfilItem[] = permissao.GUSRPERFIL ?? []

        return perfisAtuais.filter((perfil) =>
          this._deveRemoverPerfil(perfil, ctx, entidades),
        )
      })

      if (perfisRemocao.length === 0) {
        this.logger.log(
          `[Revogação] [Sistema ${codSistema}] Usuário ${cdUsuario} sem perfis a remover na coligada ${ctx.CD_Coligada}`,
        )
        continue
      }

      let houveFalha = false

      for (const perfil of perfisRemocao) {
        const result = await this.totvsService.removerPerfilUsuario({
          cdUsuario,
          cdColigada: perfil.CODCOLIGADA,
          codPerfil: perfil.CODPERFIL,
        })

        if (result.status === 'Error') {
          houveFalha = true
          this.logger.warn(
            `[Revogação] [Sistema ${codSistema}] Falha ao remover perfil ${perfil.CODPERFIL} do usuário ${cdUsuario} na coligada ${perfil.CODCOLIGADA}`,
          )
        }
      }

      if (!houveFalha) {
        this.logger.log(
          `[Revogação] [Sistema ${codSistema}] Perfis removidos do usuário ${cdUsuario}`,
        )
      }
    }
  }

  private _deveRemoverPerfil(
    perfil: GusrPerfilItem,
    ctx: PessoaAcessoContext,
    entidades: TipoEntidade[],
  ): boolean {
    const mapeamento = PERFIS_ACESSO.find(
      (item) =>
        item.NM_Perfil === perfil.CODPERFIL &&
        item.CD_Sistema === perfil.CODSISTEMA &&
        item.CD_Coligada === perfil.CODCOLIGADA,
    )

    if (!mapeamento) {
      return false
    }

    return (
      mapeamento.CD_Coligada === ctx.CD_Coligada &&
      entidades.includes(mapeamento.TP_Entidade)
    )
  }

  private _isPerfilEsperadoParaContexto(
    perfil: PerfilAcessoEntry,
    papeis: TipoEntidade[],
    ctx: PessoaAcessoContext,
  ): boolean {
    if (!papeis.includes(perfil.TP_Entidade)) {
      return false
    }

    if (perfil.TP_Entidade !== TipoEntidade.RESPONSAVEL) {
      return true
    }

    if (perfil.TP_Vinculo_Responsavel === 'ACADEMICO') {
      return !!ctx.IN_Filiacao || !!ctx.IN_Responsavel_Academico
    }

    if (perfil.TP_Vinculo_Responsavel === 'FINANCEIRO') {
      return !!ctx.IN_Responsavel_Financeiro
    }

    return true
  }
}
