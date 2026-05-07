import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { AlunoSyncService } from './aluno-sync.service'
import { AlunoSyncCron } from './aluno-sync.cron'
import { AlunoSyncController } from './aluno-sync.controller'
import { AlunoSyncProcessor } from './aluno-sync.processor'
import { ResponsavelSyncController } from './responsavel-sync.controller'
import { ResponsavelSyncProcessor } from './responsavel-sync.processor'
import { ResponsavelSyncService } from './responsavel-sync.service'
import { TotvsModule } from '../integrations/totvs/totvs.module'
import { GoogleModule } from '../integrations/google/google.module'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AppLoggerModule } from '../../core/logger/logger.module'
import { AccessProvisioningModule } from './access-provisioning/access-provisioning.module'

@Module({
  imports: [
    AppLoggerModule,
    TotvsModule,
    GoogleModule,
    AccessProvisioningModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
      },
    }),
    BullModule.registerQueue({
      name: 'aluno-sync',
    }),
    BullModule.registerQueue({
      name: 'responsavel-sync',
    }),
  ],
  controllers: [AlunoSyncController, ResponsavelSyncController],
  providers: [
    AlunoSyncService,
    AlunoSyncCron,
    AlunoSyncProcessor,
    ResponsavelSyncService,
    ResponsavelSyncProcessor,
    PrismaService,
  ],
})
export class SyncModule {}
