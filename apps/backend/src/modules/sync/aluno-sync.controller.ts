import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common'
import { AlunoSyncService } from './aluno-sync.service'
import { CancelamentoAlunoSchema } from './dto/aluno-cancelamento.dto'
import { WebhookAlunoSchema } from './dto/aluno-webhook.dto'
import { ZodError } from 'zod'

@Controller()
export class AlunoSyncController {
  private readonly logger = new Logger(AlunoSyncController.name)

  constructor(private readonly alunoSyncService: AlunoSyncService) {}

  @Post('sync/alunos')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSync(): Promise<{ message: string }> {
    this.logger.log('Sincronização de alunos disparada manualmente via API')

    // Executa em background — não bloqueia a resposta
    this.alunoSyncService.syncAlunosPorColigada().catch((error) => {
      this.logger.error(
        'Falha crítica na sincronização manual de alunos',
        error,
      )
    })

    return { message: 'Sincronização de alunos iniciada.' }
  }

  @Post('sync/alunos/cancelamentos')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerCancelamentoLote(): Promise<{ message: string }> {
    this.logger.log(
      'Cancelamento em lote disparado manualmente via API para todas as coligadas configuradas',
    )

    this.alunoSyncService.syncCancelamentosPorColigada().catch((error) => {
      this.logger.error(
        'Falha crítica no cancelamento em lote de alunos',
        error,
      )
    })

    return { message: 'Cancelamento de acessos de alunos iniciado.' }
  }

  @Post('sync/alunos/cancelamentos/aluno')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerCancelamentoAluno(
    @Body() body: unknown,
  ): Promise<{ message: string }> {
    const payload = this.parseBody(body, CancelamentoAlunoSchema)

    this.logger.log(
      `Cancelamento unitário disparado para aluno ${payload.CD_Registro_Academico}`,
    )

    this.alunoSyncService.syncCancelamentoAluno(payload).catch((error) => {
      this.logger.error(
        'Falha crítica no cancelamento unitário de aluno',
        error,
      )
    })

    return { message: 'Cancelamento unitário de acesso iniciado.' }
  }

  @Post('webhooks/alunos')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerWebhookAluno(
    @Body() body: unknown,
  ): Promise<{ message: string }> {
    console.log('🚀 ~ AlunoSyncController ~ triggerWebhookAluno ~ body:', body)
    const payload = this.parseBody(body, WebhookAlunoSchema)

    this.logger.log(
      `Webhook de aluno recebido para RA ${payload.CD_Registro_Academico}`,
    )

    await this.alunoSyncService.syncWebhookAluno(payload)

    return {
      message:
        'Webhook unitário recebido. Cancelamento e concessão foram enfileirados.',
    }
  }

  private parseBody<T extends { parse: (input: unknown) => unknown }>(
    body: unknown,
    schema: T,
  ): ReturnType<T['parse']> {
    try {
      return schema.parse(body) as ReturnType<T['parse']>
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Payload inválido.',
          errors: error.flatten(),
        })
      }

      throw error
    }
  }
}
