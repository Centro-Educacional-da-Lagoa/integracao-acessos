import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppLoggerModule } from './core/logger/logger.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncModule } from './modules/sync/sync.module';
import { TotvsModule } from './modules/integrations/totvs/totvs.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';
	
@Module({
  imports: [
    AppLoggerModule,
    ScheduleModule.forRoot(),
    SyncModule,
    TotvsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
