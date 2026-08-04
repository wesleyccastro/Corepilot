import { Module } from '@nestjs/common';
import { AgenteController } from './agente.controller';
import { AgenteService } from './agente.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';
import { AuditModule } from '../audit/audit.module';
import { AnthropicModule } from '../chat/anthropic.module';

@Module({
  imports: [AuthModule, ModuloModule, AuditModule, AnthropicModule],
  controllers: [AgenteController],
  providers: [AgenteService],
  exports: [AgenteService],
})
export class AgenteModule {}
