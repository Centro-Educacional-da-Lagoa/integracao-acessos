import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import axios, { AxiosError } from 'axios'
import { PrismaService } from '../../../core/prisma/prisma.service'
import { FuncionarioTotvsDto } from './dto/funcionario-totvs.dto'
import { AlunoTotvsDto } from './dto/aluno-totvs.dto'
import { AlunoCancelamentoTotvsDto } from './dto/aluno-cancelamento-totvs.dto'
import { getTotvsTableName } from 'src/utils/get-table-corpore'
import { totvsApiConstants } from './constants/totvs-api.constants'

/**
 * Interface para o resultado das operações da API TOTVS
 */
interface TotvsApiResponse<T = any> {
  status: 'Sucesso' | 'Error'
  data: T
}

@Injectable()
export class TotvsService {
  private readonly logger = new Logger(TotvsService.name)
  private readonly tableCorpore = getTotvsTableName()
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida a resposta da API TOTVS.
   * A TOTVS retorna HTTP 200 mesmo em erros lógicos,
   * mas nesse caso preenche o array `messages` com detalhes do erro.
   *
   * @throws Error quando a resposta contém mensagens de erro (messages.length > 0)
   */
  private handleTotvsResponse(response: any, contexto: string): void {
    const messages: any[] = response?.data?.messages ?? []
    if (messages.length > 0) {
      const detalhes = messages
        .map(
          (m: any) =>
            `[${m.type ?? 'ERROR'}] ${m.message ?? JSON.stringify(m)}`,
        )
        .join(' | ')
      this.logger.error(`${contexto} — TOTVS retornou erro lógico: ${detalhes}`)
      throw new Error(`TOTVS error: ${detalhes}`)
    }
  }

  // ─── Método legado (mantido para o fluxo de funcionários existente) ──────────

  async fetchUsersToSync(): Promise<FuncionarioTotvsDto[]> {
    this.logger.log('Buscando dados na TOTVS para sincronização...')
    // TODO: Implementar a chamada HTTP real ou Query na view da TOTVS
    return []
  }

  async grantProfileAccess(
    matricula: string,
    profileId: string,
  ): Promise<boolean> {
    this.logger.log(
      `Concedendo perfil ${profileId} para matrícula ${matricula}`,
    )
    // TODO: Chamada para a API da TOTVS executando a escrita
    return true
  }

  // ─── Alunos ──────────────────────────────────────────────────────────────────

  /**
   * Executa a procedure para buscar alunos ativos no período letivo informado
   * para uma coligada específica.
   */
  async fetchAlunosAtivos(
    periodoLetivo: string,
    coligada: number,
  ): Promise<AlunoTotvsDto[]> {
    this.logger.log(
      `Buscando alunos ativos — coligada ${coligada}, período ${periodoLetivo}`,
    )

    const result = await this.prisma.$queryRawUnsafe<AlunoTotvsDto[]>(
      `
      EXEC ${this.tableCorpore}.[dbo].[PR_MGA_Consulta_Aluno_Ativacao_Acesso] '${periodoLetivo}', ${coligada}`,
    )

    this.logger.log(
      `Encontrados ${result.length} alunos na coligada ${coligada}`,
    )
    return result
  }

  async fetchAlunosCancelamento(
    CD_Periodo_Letivo: string,
    CD_Coligada: number,
  ): Promise<AlunoCancelamentoTotvsDto[]> {
    this.logger.log(
      `Buscando alunos para cancelamento — coligada ${CD_Coligada}, período ${CD_Periodo_Letivo}`,
    )

    const result = await this.prisma.$queryRawUnsafe<
      AlunoCancelamentoTotvsDto[]
    >(
      `
      EXEC ${this.tableCorpore}.[dbo].[PR_MGA_Consulta_Aluno_Cancelamento_Acesso] '${CD_Periodo_Letivo.replace(/'/g, "''")}', ${CD_Coligada}`,
    )

    this.logger.log(
      `Encontrados ${result.length} aluno(s) para cancelamento na coligada ${CD_Coligada}`,
    )

    return result
  }

  async fetchAlunoCancelamento(
    CD_Periodo_Letivo: string,
    CD_Coligada: number,
    CD_Registro_Academico: string,
  ): Promise<AlunoCancelamentoTotvsDto | null> {
    const alunos = await this.fetchAlunosCancelamento(
      CD_Periodo_Letivo,
      CD_Coligada,
    )

    return (
      alunos.find(
        (aluno) => aluno.CD_Registro_Academico === CD_Registro_Academico,
      ) ?? null
    )
  }

  // ─── Requisições à API REST do TOTVS ─────────────────────────────────────────

  /**
   * Atualiza o e-mail da pessoa no cadastro do TOTVS via API REST.
   *
   * @param coligada - Código da coligada
   * @param cdPessoa - Código da pessoa no TOTVS
   * @param email - Novo email da pessoa
   * @returns Promise com o resultado da operação
   */
  async atualizarEmailAluno(
    coligada: number,
    cdPessoa: string,
    email: string,
  ): Promise<TotvsApiResponse> {
    this.logger.log(
      `Atualizando email da pessoa ${cdPessoa} na coligada ${coligada} para ${email}`,
    )

    const parametros = {
      CODCOLIGADA: coligada,
      EMAIL: email,
    }

    try {
      const response = await axios({
        method: 'patch',
        url: `${totvsApiConstants.urlAPI}/rmsrestdataserver/rest/EduPessoaData/${cdPessoa}`,
        headers: {
          CODCOLIGADA: parametros.CODCOLIGADA.toString(),
          CODFILIAL: totvsApiConstants.codigoFilial,
          CODTIPOCURSO: totvsApiConstants.codigoTipoCurso,
          CODSISTEMA: totvsApiConstants.codigoSistema,
          Authorization: totvsApiConstants.authorization,
        },
        data: parametros,
      })

      this.handleTotvsResponse(
        response,
        `atualizarEmailAluno pessoa=${cdPessoa}`,
      )

      this.logger.log(
        `Email da pessoa ${cdPessoa} atualizado com sucesso na coligada ${coligada}`,
      )

      return {
        status: 'Sucesso',
        data: response.data.data,
      }
    } catch (error: any) {
      this.logger.error('------------------------------------')
      this.logger.error('ERRO NA ATUALIZAÇÃO DO EMAIL DO ALUNO:')

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError
        this.logger.error(axiosError.response?.data)
      } else {
        this.logger.error(error)
      }

      this.logger.error('PARÂMETROS USADOS:')
      this.logger.error(JSON.stringify(parametros, null, 2))
      this.logger.error('CD_PESSOA:')
      this.logger.error(cdPessoa)
      this.logger.error('------------------------------------')

      return {
        status: 'Error',
        data:
          axios.isAxiosError(error) && error.response
            ? error.response.data
            : error,
      }
    }
  }

  // ─── Gestão de Usuários TOTVS ─────────────────────────────────────────────────

  /**
   * Verifica se um usuário já existe no TOTVS via GET GlbUsuarioData.
   *
   * @param cdUsuario - Código do usuário (RA do aluno)
   * @returns true se o usuário já existir, false caso contrário
   */
  async verificarUsuario(cdUsuario: string): Promise<any> {
    this.logger.log(`Verificando existência do usuário ${cdUsuario} no TOTVS`)

    try {
      const response = await axios({
        method: 'get',
        url: `${totvsApiConstants.urlAPI}/rmsrestdataserver/rest/GlbUsuarioData/${cdUsuario}`,
        headers: {
          CODFILIAL: totvsApiConstants.codigoFilial,
          CODSISTEMA: totvsApiConstants.codigoSistema,
          Authorization: totvsApiConstants.authorization,
        },
      })
      if (response.data?.messages?.length > 0) {
        this.logger.log(`Usuário ${cdUsuario} já existe no TOTVS`)
        return false
      }
      return response.data?.data
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.logger.log(`Usuário ${cdUsuario} não encontrado no TOTVS`)
        return false
      }

      // Outro erro inesperado — relançar para tratamento no caller
      this.logger.error(
        `Erro ao verificar usuário ${cdUsuario}: ${(error as Error).message}`,
      )
      throw error
    }
  }

  /**
   * Vincula um usuário já existente no TOTVS à ficha da pessoa do aluno.
   * Usado quando CD_Usuario é nulo na view mas o usuário já existe em GlbUsuarioData.
   *
   * @param coligada - Código da coligada
   * @param cdPessoa - Código da pessoa no TOTVS
   * @param cdUsuario - Login do usuário (RA do aluno)
   */
  async vincularUsuarioPessoa(
    coligada: number,
    cdPessoa: string,
    cdUsuario: string,
  ): Promise<TotvsApiResponse> {
    this.logger.log(
      `Vinculando usuário ${cdUsuario} à pessoa ${cdPessoa} (coligada ${coligada})`,
    )

    const payload = { CODUSUARIO: cdUsuario }

    try {
      const response = await axios({
        method: 'patch',
        url: `${totvsApiConstants.urlAPI}/rmsrestdataserver/rest/EduPessoaData/${cdPessoa}`,
        headers: {
          CODCOLIGADA: coligada.toString(),
          CODFILIAL: totvsApiConstants.codigoFilial,
          CODTIPOCURSO: totvsApiConstants.codigoTipoCurso,
          CODSISTEMA: totvsApiConstants.codigoSistema,
          Authorization: totvsApiConstants.authorization,
        },
        data: payload,
      })

      this.handleTotvsResponse(
        response,
        `vincularUsuarioPessoa usuario=${cdUsuario} pessoa=${cdPessoa}`,
      )

      this.logger.log(
        `Usuário ${cdUsuario} vinculado à pessoa ${cdPessoa} com sucesso`,
      )
      return { status: 'Sucesso', data: response.data }
    } catch (error: any) {
      this.logger.error('------------------------------------')
      this.logger.error(
        `ERRO AO VINCULAR USUÁRIO ${cdUsuario} À PESSOA ${cdPessoa}:`,
      )

      if (axios.isAxiosError(error)) {
        this.logger.error(error.response?.data)
      } else {
        this.logger.error(error)
      }

      this.logger.error('PAYLOAD:')
      this.logger.error(JSON.stringify(payload, null, 2))
      this.logger.error('------------------------------------')

      return {
        status: 'Error',
        data:
          axios.isAxiosError(error) && error.response
            ? error.response.data
            : error,
      }
    }
  }

  /**
   * Cria o usuário de sistema (login) no TOTVS via POST GlbUsuarioData.
   * Realiza verificação prévia (GET) antes de criar para evitar duplicidade.
   *
   * @param dados - Dados básicos do usuário a criar
   * @param email - E-mail institucional do usuário
   */
  async criarUsuario(
    dados: { cdUsuario: string; nome: string; dtNascimento: string | null },
    email: string,
  ): Promise<TotvsApiResponse> {
    const { cdUsuario, nome, dtNascimento } = dados

    this.logger.log(`Criando usuário TOTVS para ${cdUsuario}`)

    // Formatar senha: DT_Nascimento sem barras (ex: 01/01/2000 → 01012000)
    const senhaFormatada = dtNascimento
      ? dtNascimento.replace(/\//g, '')
      : cdUsuario

    // Data de início: data atual no formato ISO (YYYY-MM-DD)
    const dataInicio = new Date().toISOString().split('T')[0]

    const payload = {
      CODUSUARIO: cdUsuario,
      NOME: nome,
      DATAINICIO: dataInicio,
      SENHA: senhaFormatada,
      CODACESSO: 'Acesso03',
      EMAIL: email,
      OBRIGAALTERARSENHA: 'F',
      ACESSONET: 'T',
    }

    this.logger.debug(
      `Payload de criação de usuário: ${JSON.stringify(payload)}`,
    )

    try {
      const response = await axios({
        method: 'post',
        url: `${totvsApiConstants.urlAPI}/rmsrestdataserver/rest/GlbUsuarioData`,
        headers: {
          CODFILIAL: totvsApiConstants.codigoFilial,
          CODSISTEMA: totvsApiConstants.codigoSistema,
          Authorization: totvsApiConstants.authorization,
        },
        data: payload,
      })
      this.handleTotvsResponse(response, `criarUsuario RA=${cdUsuario}`)

      this.logger.log(`Usuário ${cdUsuario} criado com sucesso no TOTVS`)
      return { status: 'Sucesso', data: response.data }
    } catch (error: any) {
      this.logger.error('------------------------------------')
      this.logger.error(`ERRO AO CRIAR USUÁRIO ${cdUsuario} NO TOTVS:`)

      if (axios.isAxiosError(error)) {
        this.logger.error(error.response?.data)
      } else {
        this.logger.error(error)
      }

      this.logger.error('PAYLOAD:')
      this.logger.error(JSON.stringify(payload, null, 2))
      this.logger.error('------------------------------------')

      return {
        status: 'Error',
        data:
          axios.isAxiosError(error) && error.response
            ? error.response.data
            : error,
      }
    }
  }

  /**
   * Reativa um usuário inativo no TOTVS via PATCH GlbUsuarioData.
   * Atualiza STATUS e, quando necessário, o EMAIL em um único PATCH.
   *
   * Cenários:
   *  - Usuário inativo com email correto → { STATUS: 1 }
   *  - Usuário inativo com email ausente/diferente → { STATUS: 1, EMAIL }
   *
   * @param cdUsuario - Login do usuário no TOTVS
   * @param emailAtual - E-mail atualmente cadastrado no TOTVS (TX_Email_Usuario)
   * @param emailEsperado - E-mail institucional correto do aluno
   */
  async ativarUsuario(
    cdUsuario: string,
    emailAtual: string | null,
    emailEsperado: string,
  ): Promise<TotvsApiResponse> {
    const emailCorreto = emailAtual && emailAtual === emailEsperado

    const payload: Record<string, unknown> = { STATUS: 1 }

    if (!emailCorreto) {
      payload.EMAIL = emailEsperado
      this.logger.log(
        `Reativando usuário ${cdUsuario} e atualizando email para ${emailEsperado}`,
      )
    } else {
      this.logger.log(
        `Reativando usuário ${cdUsuario} (email já correto: ${emailEsperado})`,
      )
    }

    try {
      const response = await axios({
        method: 'patch',
        url: `${totvsApiConstants.urlAPI}/rmsrestdataserver/rest/GlbUsuarioData/${cdUsuario}`,
        headers: {
          CODFILIAL: totvsApiConstants.codigoFilial,
          CODSISTEMA: totvsApiConstants.codigoSistema,
          Authorization: totvsApiConstants.authorization,
        },
        data: payload,
      })

      this.handleTotvsResponse(response, `ativarUsuario cdUsuario=${cdUsuario}`)

      this.logger.log(`Usuário ${cdUsuario} reativado com sucesso no TOTVS`)
      return { status: 'Sucesso', data: response.data }
    } catch (error: any) {
      this.logger.error('------------------------------------')
      this.logger.error(`ERRO AO REATIVAR USUÁRIO ${cdUsuario} NO TOTVS:`)

      if (axios.isAxiosError(error)) {
        this.logger.error(error.response?.data)
      } else {
        this.logger.error(error)
      }

      this.logger.error('PAYLOAD:')
      this.logger.error(JSON.stringify(payload, null, 2))
      this.logger.error('------------------------------------')

      return {
        status: 'Error',
        data:
          axios.isAxiosError(error) && error.response
            ? error.response.data
            : error,
      }
    }
  }

  /**
   * Busca os dados de um usuário no TOTVS escopados por um CODSISTEMA específico.
   * O GPERMIS retornado pela API é filtrado pelo CODSISTEMA passado no header.
   *
   * @param cdUsuario - Login do usuário (RA do aluno)
   * @param codSistema - Sistema alvo da busca (ex: "S" ou "L")
   * @returns Dados do usuário ou false se não encontrado / erro lógico
   */
  async buscarUsuarioPorSistema(
    cdUsuario: string,
    codSistema: string,
  ): Promise<any | false> {
    this.logger.log(`Buscando usuário ${cdUsuario} no sistema ${codSistema}`)

    try {
      const response = await axios({
        method: 'get',
        url: `${totvsApiConstants.urlAPI}/rmsrestdataserver/rest/GlbUsuarioData/${cdUsuario}`,
        headers: {
          CODFILIAL: totvsApiConstants.codigoFilial,
          CODSISTEMA: codSistema,
          Authorization: totvsApiConstants.authorization,
        },
      })

      if (response.data?.messages?.length > 0) {
        this.logger.log(
          `Usuário ${cdUsuario} não encontrado no sistema ${codSistema}`,
        )
        return false
      }

      return response.data?.data ?? false
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        this.logger.log(
          `Usuário ${cdUsuario} não encontrado no sistema ${codSistema} (404)`,
        )
        return false
      }

      this.logger.error(
        `Erro ao buscar usuário ${cdUsuario} no sistema ${codSistema}: ${(error as Error).message}`,
      )
      throw error
    }
  }

  /**
   * Inativa um usuário no TOTVS via PATCH GlbUsuarioData.
   *
   * @param cdUsuario - Login do usuário no TOTVS
   */
  async inativarUsuario(cdUsuario: string): Promise<TotvsApiResponse> {
    this.logger.log(`Inativando usuário ${cdUsuario} no TOTVS`)

    const payload = { STATUS: 0 }

    try {
      const response = await axios({
        method: 'patch',
        url: `${totvsApiConstants.urlAPI}/rmsrestdataserver/rest/GlbUsuarioData/${cdUsuario}`,
        headers: {
          CODFILIAL: totvsApiConstants.codigoFilial,
          CODSISTEMA: totvsApiConstants.codigoSistema,
          Authorization: totvsApiConstants.authorization,
        },
        data: payload,
      })

      this.handleTotvsResponse(
        response,
        `inativarUsuario cdUsuario=${cdUsuario}`,
      )

      this.logger.log(`Usuário ${cdUsuario} inativado com sucesso no TOTVS`)
      return { status: 'Sucesso', data: response.data }
    } catch (error: any) {
      this.logger.error('------------------------------------')
      this.logger.error(`ERRO AO INATIVAR USUÁRIO ${cdUsuario} NO TOTVS:`)

      if (axios.isAxiosError(error)) {
        this.logger.error(error.response?.data)
      } else {
        this.logger.error(error)
      }

      this.logger.error('------------------------------------')

      return {
        status: 'Error',
        data:
          axios.isAxiosError(error) && error.response
            ? error.response.data
            : (error as Error),
      }
    }
  }

  /**
   * Aplica o GPERMIS já construído ao usuário via PUT GlbUsuarioData.
   * A responsabilidade de verificar quais perfis faltam e montar o GPERMIS
   * atualizado é do chamador (AccessProvisioningService._garantirPerfis).
   *
   * @param cdUsuario - Login do usuário no TOTVS
   * @param codSistema - Sistema alvo ("S" ou "L") — usado no header da requisição
   * @param gpermisAtualizado - Array GPERMIS completo com os novos perfis incluídos
   * @param dadosUsuarioSistema - Objeto completo do usuário obtido via GET (base do payload)
   */
  async concederPerfil(
    cdUsuario: string,
    codSistema: string,
    gpermisAtualizado: any[],
    dadosUsuarioSistema: any,
  ): Promise<TotvsApiResponse> {
    return this.atualizarPerfisUsuario(
      cdUsuario,
      codSistema,
      gpermisAtualizado,
      dadosUsuarioSistema,
    )
  }

  async atualizarPerfisUsuario(
    cdUsuario: string,
    codSistema: string,
    gpermisAtualizado: any[],
    dadosUsuarioSistema: any,
  ): Promise<TotvsApiResponse> {
    const payload = { ...dadosUsuarioSistema, GPERMIS: gpermisAtualizado }

    try {
      const response = await axios({
        method: 'put',
        url: `${totvsApiConstants.urlAPI}/rmsrestdataserver/rest/GlbUsuarioData/${cdUsuario}`,
        headers: {
          CODFILIAL: totvsApiConstants.codigoFilial,
          CODSISTEMA: codSistema,
          Authorization: totvsApiConstants.authorization,
        },
        data: payload,
      })

      this.handleTotvsResponse(
        response,
        `atualizarPerfisUsuario cdUsuario=${cdUsuario} sistema=${codSistema}`,
      )

      this.logger.log(
        `[Sistema ${codSistema}] Perfis atualizados para o usuário ${cdUsuario} com sucesso`,
      )
      return { status: 'Sucesso', data: response.data }
    } catch (error: any) {
      this.logger.error('------------------------------------')
      this.logger.error(
        `ERRO AO ATUALIZAR PERFIS [Sistema ${codSistema}] USUÁRIO ${cdUsuario}:`,
      )

      if (axios.isAxiosError(error)) {
        this.logger.error(error.response?.data)
      } else {
        this.logger.error(error)
      }

      this.logger.error('PAYLOAD:')
      this.logger.error(JSON.stringify(payload, null, 2))
      this.logger.error('------------------------------------')

      return {
        status: 'Error',
        data:
          axios.isAxiosError(error) && error.response
            ? error.response.data
            : (error as Error),
      }
    }
  }

  /**
   * Atualiza o e-mail do usuário de sistema no TOTVS via PATCH GlbUsuarioData.
   * Usado quando o usuário está ativo mas o e-mail está ausente ou desatualizado.
   *
   * @param cdUsuario - Login do usuário no TOTVS
   * @param emailEsperado - E-mail institucional correto do aluno
   */
  async atualizarEmailUsuario(
    cdUsuario: string,
    emailEsperado: string,
  ): Promise<TotvsApiResponse> {
    this.logger.log(
      `Atualizando email do usuário ativo ${cdUsuario} para ${emailEsperado}`,
    )

    const payload = { EMAIL: emailEsperado }

    try {
      const response = await axios({
        method: 'patch',
        url: `${totvsApiConstants.urlAPI}/rmsrestdataserver/rest/GlbUsuarioData/${cdUsuario}`,
        headers: {
          CODFILIAL: totvsApiConstants.codigoFilial,
          CODSISTEMA: totvsApiConstants.codigoSistema,
          Authorization: totvsApiConstants.authorization,
        },
        data: payload,
      })

      this.handleTotvsResponse(
        response,
        `atualizarEmailUsuario cdUsuario=${cdUsuario}`,
      )

      this.logger.log(
        `Email do usuário ${cdUsuario} atualizado com sucesso no TOTVS`,
      )
      return { status: 'Sucesso', data: response.data }
    } catch (error: any) {
      this.logger.error('------------------------------------')
      this.logger.error(
        `ERRO AO ATUALIZAR EMAIL DO USUÁRIO ${cdUsuario} NO TOTVS:`,
      )

      if (axios.isAxiosError(error)) {
        this.logger.error(error.response?.data)
      } else {
        this.logger.error(error)
      }

      this.logger.error('PAYLOAD:')
      this.logger.error(JSON.stringify(payload, null, 2))
      this.logger.error('------------------------------------')

      return {
        status: 'Error',
        data:
          axios.isAxiosError(error) && error.response
            ? error.response.data
            : (error as Error),
      }
    }
  }
}
