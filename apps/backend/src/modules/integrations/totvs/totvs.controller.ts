import { Controller, Get, NotFoundException, Param, Logger } from '@nestjs/common'
import { TotvsService } from './totvs.service'

@Controller('totvs')
export class TotvsController {
  private readonly logger = new Logger(TotvsController.name)

  constructor(private readonly totvsService: TotvsService) {}

  /**
   * Busca um usuário no TOTVS pelo código (RA/login).
   * Retorna os dados do usuário se existir, ou 404 caso contrário.
   *
   * GET /totvs/usuario/:codigo
   */
  @Get('usuario/:codigo')
  async buscarUsuario(@Param('codigo') codigo: string) {
    this.logger.log(`Buscando usuário TOTVS — código: ${codigo}`)

    const existe = await this.totvsService.verificarUsuario(codigo)

    if (!existe) {
      throw new NotFoundException(
        `Usuário com código "${codigo}" não encontrado no TOTVS`,
      )
    }

    return {
      status: 'Sucesso',
      codigo,
      data: existe,
    }
  }
}
