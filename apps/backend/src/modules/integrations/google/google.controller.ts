import { Controller, Post, Get, Param, HttpException } from '@nestjs/common'
import { GoogleService } from './google.service'

@Controller('google')
export class GoogleController {
  constructor(private readonly googleService: GoogleService) {}

  @Get('verify-gmail-account/:email')
  async verifyGmailAccount(
    @Param('email') email: string,
    @Param('coligada') coligada: number,
  ) {
    const response = await this.googleService.verifyGmailAccount({
      TX_Email: email,
      CD_Coligada: coligada,
    })
    return response instanceof HttpException
      ? new HttpException(response.message, response.getStatus())
      : response
  }

  @Post('suspend-gmail-account/:email/:coligada')
  async suspendGmailAccount(
    @Param('email') email: string,
    @Param('coligada') coligada: number,
  ) {
    const response = await this.googleService.suspendGmailAccount(
      email,
      Number(coligada),
    )
    return response instanceof HttpException
      ? new HttpException(response.message, response.getStatus())
      : response
  }

  @Post('activate-gmail-account/:email/:coligada')
  async reactivateGmailAccount(
    @Param('email') email: string,
    @Param('coligada') coligada: number,
  ) {
    const response = await this.googleService.reactivateGmailAccount(
      email,
      Number(coligada),
    )
    return response instanceof HttpException
      ? new HttpException(response.message, response.getStatus())
      : response
  }
}
