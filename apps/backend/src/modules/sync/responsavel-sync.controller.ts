import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common'
import { ZodError } from 'zod'
import { CancelamentoResponsavelSchema } from './dto/responsavel-cancelamento.dto'
import { ResponsavelSyncService } from './responsavel-sync.service'

@Controller()
export class ResponsavelSyncController {
  private readonly logger = new Logger(ResponsavelSyncController.name)

  constructor(private readonly responsavelSyncService: ResponsavelSyncService) {}

  @Post('sync/responsaveis/cancelamentos')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerCancelamentoLote(): Promise<{ message: string }> {
    this.logger.log(
      'Cancelamento em lote de responsáveis disparado manualmente via API',
    )

    this.responsavelSyncService.syncCancelamentos().catch((error) => {
      this.logger.error(
        'Falha crítica no cancelamento em lote de responsáveis',
        error,
      )
    })

    return { message: 'Cancelamento de acessos de responsáveis iniciado.' }
  }

  @Post('sync/responsaveis/cancelamentos/responsavel')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerCancelamentoResponsavel(
    @Body() body: unknown,
  ): Promise<{ message: string }> {
    const payload = this.parseBody(body, CancelamentoResponsavelSchema)

    this.logger.log(
      `Cancelamento unitário de responsável disparado (pessoa ${payload.CD_Pessoa ?? 'NULL'}, cpf ${payload.CD_CPF ?? 'NULL'})`,
    )

    this.responsavelSyncService.syncCancelamentoResponsavel(payload).catch(
      (error) => {
        this.logger.error(
          'Falha crítica no cancelamento unitário de responsável',
          error,
        )
      },
    )

    return { message: 'Cancelamento unitário de responsável iniciado.' }
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
