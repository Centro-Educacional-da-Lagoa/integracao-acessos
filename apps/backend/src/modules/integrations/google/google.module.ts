import { Module } from '@nestjs/common'
import { GoogleService } from './google.service'
import { GoogleController } from './google.controller'
import { PrismaService } from '../../../core/prisma/prisma.service'

@Module({
  providers: [GoogleService, PrismaService],
  controllers: [GoogleController],
  exports: [GoogleService],
})
export class GoogleModule {}
