import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ModuloModule } from '../modulo/modulo.module';
import { FluxoService } from './fluxo.service';
import { FluxoController } from './fluxo.controller';

@Module({
  imports: [AuthModule, AuditModule, ModuloModule],
  controllers: [FluxoController],
  providers: [FluxoService],
  exports: [FluxoService],
})
export class OrquestradorModule {}
