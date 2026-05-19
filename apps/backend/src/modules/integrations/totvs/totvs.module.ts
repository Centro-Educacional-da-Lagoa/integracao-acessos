import { Module } from '@nestjs/common'
import { TotvsService } from './totvs.service'
import { TotvsController } from './totvs.controller'

@Module({
  controllers: [TotvsController],
  providers: [TotvsService],
  exports: [TotvsService],
})
export class TotvsModule {}
