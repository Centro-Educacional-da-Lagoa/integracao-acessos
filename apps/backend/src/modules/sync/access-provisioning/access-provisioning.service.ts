import { Injectable, Logger } from '@nestjs/common'
import { TotvsService } from '../../integrations/totvs/totvs.service'
import { GoogleService } from '../../integrations/google/google.service'
import { PessoaAcessoContext } from './interfaces/pessoa-acesso-context.interface'
import { TipoEntidade } from './enums/tipo-entidade.enum'
import { PERFIS_ACESSO } from './constants/perfis-acesso.constants'

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

  // ─── E-mail da Pessoa ──────────────────────────────────────────────────────

  private _isElegivelEmailPessoa(ctx: PessoaAcessoContext): boolean {
    return (
      !ctx.IN_Funcionario &&
      !ctx.IN_Responsavel &&
      !!ctx.IN_Existe_Matricula_Regular &&
      !ctx.IN_Inativo_Regular
    )
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
      !!ctx.IN_Inativo_Regular &&
      !!ctx.IN_Inativo_Extra
    )
  }

  private _deveRemoverPerfilAlunoNoCancelamento(
    ctx: PessoaAcessoContext,
  ): boolean {
    return (
      !!ctx.CD_Usuario &&
      !this._deveInativarUsuarioNoCancelamento(ctx) &&
      !!ctx.IN_Inativo_Regular &&
      !!ctx.IN_Inativo_Extra
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
      const result = await this.totvsService.criarUsuario(
        {
          cdUsuario: cdUsuarioCorreto,
          nome: ctx.NM_Pessoa,
          dtNascimento: ctx.DT_Nascimento,
        },
        ctx.TX_Email_Institucional,
      )
      if (result.status === 'Error') {
        throw new Error(
          `[Usuário] Falha ao criar usuário ${cdUsuarioCorreto} — pessoa ${ctx.CD_Pessoa}`,
        )
      }
    } else if (usuarioExistente.STATUS !== 1) {
      const result = await this.totvsService.ativarUsuario(
        cdUsuarioCorreto,
        usuarioExistente.EMAIL ?? null,
        ctx.TX_Email_Institucional,
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
      const result = await this.totvsService.ativarUsuario(
        cdUsuario,
        ctx.TX_Email_Usuario,
        ctx.TX_Email_Institucional,
      )
      if (result.status === 'Error') {
        this.logger.warn(`[Usuário] Falha ao reativar usuário ${cdUsuario}`)
      }
    } else {
      // Atualiza email do usuário apenas para alunos com matrícula regular ativa
      const deveAtualizarEmail =
        ctx.IN_Aluno &&
        ctx.IN_Existe_Matricula_Regular &&
        !ctx.IN_Inativo_Regular &&
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

        if (papeis.includes(mapeamento.TP_Entidade)) {
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

    // Perfis esperados da constante para a coligada atual + todos os papéis ativos da pessoa
    const papeis = this._getPapeisAtivos(ctx)
    for (const entry of PERFIS_ACESSO) {
      if (
        entry.CD_Coligada === ctx.CD_Coligada &&
        papeis.includes(entry.TP_Entidade)
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
      let houveMudanca = false

      const gpermisAtualizado = gpermisAtual
        .map((permissao) => {
          const perfisAtuais = permissao.GUSRPERFIL ?? []
          const perfisMantidos = perfisAtuais.filter(
            (perfil: GusrPerfilItem) => {
              const deveRemover = this._deveRemoverPerfil(
                perfil,
                ctx,
                entidades,
              )

              if (deveRemover) {
                houveMudanca = true
              }

              return !deveRemover
            },
          )

          if (perfisMantidos.length === 0) {
            return null
          }

          return {
            ...permissao,
            GUSRPERFIL: perfisMantidos,
          }
        })
        .filter(Boolean)

      if (!houveMudanca) {
        this.logger.log(
          `[Revogação] [Sistema ${codSistema}] Usuário ${cdUsuario} sem perfis a remover na coligada ${ctx.CD_Coligada}`,
        )
        continue
      }

      const result = await this.totvsService.atualizarPerfisUsuario(
        cdUsuario,
        codSistema,
        gpermisAtualizado,
        dadosUsuario,
      )

      if (result.status === 'Error') {
        this.logger.warn(
          `[Revogação] [Sistema ${codSistema}] Falha ao remover perfis do usuário ${cdUsuario}`,
        )
        continue
      }

      this.logger.log(
        `[Revogação] [Sistema ${codSistema}] Perfis removidos do usuário ${cdUsuario}`,
      )
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
}
