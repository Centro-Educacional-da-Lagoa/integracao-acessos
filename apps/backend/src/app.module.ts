import { Module } from '@nestjs/common';
import { AppLoggerModule } from './core/logger/logger.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncModule } from './modules/sync/sync.module';
import { TotvsModule } from './modules/integrations/totvs/totvs.module';

@Module({
  imports: [
    AppLoggerModule,
    ScheduleModule.forRoot(),
    SyncModule,
    TotvsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
