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
import {
  AtivacaoResponsavelSchema,
  CancelamentoResponsavelSchema,
} from './dto/responsavel-cancelamento.dto'
import { ResponsavelSyncService } from './responsavel-sync.service'

@Controller()
export class ResponsavelSyncController {
  private readonly logger = new Logger(ResponsavelSyncController.name)

  constructor(private readonly responsavelSyncService: ResponsavelSyncService) {}

  @Post('sync/responsaveis')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSyncLote(): Promise<{ message: string }> {
    this.logger.log(
      'Concessão em lote de responsáveis disparada manualmente via API',
    )

    this.responsavelSyncService.syncResponsaveis().catch((error) => {
      this.logger.error(
        'Falha crítica na concessão em lote de responsáveis',
        error,
      )
    })

    return { message: 'Concessão de acessos de responsáveis iniciada.' }
  }

  @Post('sync/responsaveis/responsavel')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSyncResponsavel(
    @Body() body: unknown,
  ): Promise<{ message: string }> {
    const payload = this.parseBody(body, AtivacaoResponsavelSchema)

    this.logger.log(
      `Concessão unitária de responsável disparada (pessoa ${payload.CD_Pessoa ?? 'NULL'}, cpf ${payload.CD_CPF ?? 'NULL'}, ra ${payload.CD_Registro_Academico ?? 'NULL'})`,
    )

    this.responsavelSyncService.syncResponsavel(payload).catch((error) => {
      this.logger.error(
        'Falha crítica na concessão unitária de responsável',
        error,
      )
    })

    return { message: 'Concessão unitária de responsável iniciada.' }
  }

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
