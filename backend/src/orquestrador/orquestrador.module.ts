import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ModuloModule } from '../modulo/modulo.module';
import { AnthropicModule } from '../chat/anthropic.module';
import { FluxoService } from './fluxo.service';
import { FluxoController } from './fluxo.controller';
import { InstanciaController } from './instancia.controller';
import { InstanciaAcaoController } from './instancia-acao.controller';
import { OrquestradorEngineService } from './orquestrador-engine.service';
import { OrquestradorFilaWorker } from './orquestrador-fila.worker';

@Module({
  imports: [AuthModule, AuditModule, ModuloModule, AnthropicModule],
  controllers: [FluxoController, InstanciaController, InstanciaAcaoController],
  providers: [FluxoService, OrquestradorEngineService, OrquestradorFilaWorker],
  exports: [FluxoService, OrquestradorEngineService],
})
export class OrquestradorModule {}
