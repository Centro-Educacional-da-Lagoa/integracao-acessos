import { HttpException, Injectable, Logger } from '@nestjs/common'
import { google } from 'googleapis'
import GoogleConstantObj from './shared/constants'
import { AlunoTotvsDto } from '../totvs/dto/aluno-totvs.dto'
import { ColigadaConfig } from '../../sync/interfaces/coligada-config.interface'

const DIRECTORY_SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.user',
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
]

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name)

  private isProduction(): boolean {
    return process.env.NODE_ENV === 'production'
  }

  private logSkippedNonProduction(action: string, email: string): void {
    this.logger.warn(
      `[Google] ${action} ignorado para ${email}: NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}`,
    )
  }

  // ─── Verificação ──────────────────────────────────────────────────────────────

  async verifyGmailAccount(data: {
    TX_Email: string
    CD_Coligada: number
  }): Promise<{ exists: boolean; suspended: boolean }> {
    try {
      const service = google.admin({
        version: 'directory_v1',
        auth: await GoogleConstantObj.JwtAuth(
          DIRECTORY_SCOPES,
          data.CD_Coligada,
        ),
      })

      const res = await service.users.get({ userKey: data.TX_Email })
      return {
        exists: !!res.data,
        suspended: res.data?.suspended ?? false,
      }
    } catch (error: any) {
      if (error.code === 404) {
        this.logger.log(`Conta Google não encontrada: ${data.TX_Email}`)
        return { exists: false, suspended: false }
      }
      this.logger.error(
        `Erro ao verificar conta Google para ${data.TX_Email}`,
        error.stack,
      )
      throw error
    }
  }

  // ─── Criação ─────────────────────────────────────────────────────────────────

  /**
   * Cria a conta Google do aluno usando os dados do DTO retornado pela procedure.
   * A senha inicial é a data de nascimento no formato DDMMYYYY.
   */
  async createGmailAccount(
    email: string,
    aluno: AlunoTotvsDto,
    coligada: number,
  ): Promise<void> {
    try {
      const [firstName, ...rest] = aluno.NM_Aluno.trim().split(' ')
      const lastName = rest.join(' ') || firstName
      const password = aluno.DT_Nascimento
        ? aluno.DT_Nascimento.replace(/[^0-9]/g, '')
        : aluno.CD_Registro_Academico

      const service = google.admin({
        version: 'directory_v1',
        auth: await GoogleConstantObj.JwtAuth(
          ['https://www.googleapis.com/auth/admin.directory.user'],
          coligada,
        ),
      })

      await service.users.insert({
        requestBody: {
          name: { givenName: firstName, familyName: lastName },
          password,
          primaryEmail: email,
        },
      })

      this.logger.log(`Conta Google criada: ${email}`)
    } catch (error: any) {
      this.logger.error(`Erro ao criar conta Google para ${email}`, error.stack)
      throw new HttpException(`Erro ao criar a conta Gmail para ${email}`, 500)
    }
  }

  // ─── Suspensão ───────────────────────────────────────────────────────────────

  async suspendGmailAccount(
    email: string,
    coligada: number,
  ): Promise<{ message: string }> {
    try {
      const service = google.admin({
        version: 'directory_v1',
        auth: await GoogleConstantObj.JwtAuth(
          ['https://www.googleapis.com/auth/admin.directory.user'],
          coligada,
        ),
      })

      await service.users.update({
        userKey: email,
        requestBody: { suspended: true },
      })

      this.logger.log(`Conta Google suspensa: ${email}`)
      return { message: 'Email suspenso!' }
    } catch (error: any) {
      if (error.code === 404) {
        this.logger.log(`Conta Google não encontrada para suspensão: ${email}`)
        return { message: 'Email inexistente.' }
      }

      this.logger.error(
        `Erro ao suspender conta Google para ${email}`,
        error.stack,
      )
      throw new HttpException('Erro ao suspender a conta Gmail', 500)
    }
  }

  // ─── Reativação ──────────────────────────────────────────────────────────────

  async reactivateGmailAccount(
    email: string,
    coligada: number,
  ): Promise<{ message: string }> {
    try {
      const service = google.admin({
        version: 'directory_v1',
        auth: await GoogleConstantObj.JwtAuth(
          ['https://www.googleapis.com/auth/admin.directory.user'],
          coligada,
        ),
      })

      await service.users.update({
        userKey: email,
        requestBody: { suspended: false },
      })

      this.logger.log(`Conta Google reativada: ${email}`)
      return { message: 'Email reativado!' }
    } catch (error: any) {
      this.logger.error(
        `Erro ao reativar conta Google para ${email}`,
        error.stack,
      )
      throw new HttpException('Erro ao reativar a conta Gmail', 500)
    }
  }

  // ─── Orquestrador de Provisionamento ─────────────────────────────────────────

  /**
   * Verifica o estado da conta Google e executa a ação necessária:
   * - Não existe → cria
   * - Existe e suspensa → reativa
   * - Existe e ativa → não faz nada
   */
  async checkAndProvisionEmail(
    email: string,
    aluno: AlunoTotvsDto,
    coligada: ColigadaConfig,
  ): Promise<
    'created' | 'activated' | 'already_active' | 'skipped_non_production'
  > {
    if (!this.isProduction()) {
      this.logSkippedNonProduction('Provisionamento de Gmail de aluno', email)
      return 'skipped_non_production'
    }

    const { exists, suspended } = await this.verifyGmailAccount({
      TX_Email: email,
      CD_Coligada: coligada.id,
    })

    if (!exists) {
      await this.createGmailAccount(email, aluno, coligada.id)
      return 'created'
    }

    if (suspended) {
      await this.reactivateGmailAccount(email, coligada.id)
      return 'activated'
    }

    this.logger.log(`Conta Google já ativa: ${email}`)
    return 'already_active'
  }

  async cancelarEmailInstitucional(
    TX_Email: string,
    CD_Coligada: number,
  ): Promise<
    'suspended' | 'already_suspended' | 'not_found' | 'skipped_non_production'
  > {
    if (!this.isProduction()) {
      this.logSkippedNonProduction(
        'Cancelamento de Gmail institucional de aluno',
        TX_Email,
      )
      return 'skipped_non_production'
    }

    const { exists, suspended } = await this.verifyGmailAccount({
      TX_Email,
      CD_Coligada,
    })

    if (!exists) {
      this.logger.log(`Conta Google ausente para cancelamento: ${TX_Email}`)
      return 'not_found'
    }

    if (suspended) {
      this.logger.log(`Conta Google já suspensa: ${TX_Email}`)
      return 'already_suspended'
    }

    await this.suspendGmailAccount(TX_Email, CD_Coligada)
    return 'suspended'
  }
}
