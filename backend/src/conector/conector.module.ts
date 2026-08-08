import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConectorController } from './conector.controller';
import { ConectorService } from './conector.service';
import { GoogleConectorProvider } from './providers/google-conector.provider';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ConectorController],
  providers: [ConectorService, GoogleConectorProvider],
})
export class ConectorModule {}
