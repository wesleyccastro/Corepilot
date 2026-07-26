import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncCronService } from './sync-cron.service';
import { ConsultaTesteModule } from './consulta-teste.module';

@Module({
  imports: [ScheduleModule.forRoot(), ConsultaTesteModule],
  providers: [SyncCronService],
})
export class SyncCronModule {}
