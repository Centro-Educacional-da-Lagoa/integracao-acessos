import { Module } from '@nestjs/common'
import { TotvsService } from './totvs.service'
import { TotvsController } from './totvs.controller'
import { PrismaService } from '../../../core/prisma/prisma.service'

@Module({
  controllers: [TotvsController],
  providers: [TotvsService, PrismaService],
  exports: [TotvsService],
})
export class TotvsModule {}
