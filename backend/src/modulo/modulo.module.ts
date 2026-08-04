import { Module } from '@nestjs/common';
import { ModuloController } from './modulo.controller';
import { ModuloService } from './modulo.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { AnthropicModule } from '../chat/anthropic.module';

@Module({
  imports: [AuthModule, AuditModule, AnthropicModule],
  controllers: [ModuloController],
  providers: [ModuloService],
  exports: [ModuloService],
})
export class ModuloModule {}
