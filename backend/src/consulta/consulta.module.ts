import { Module } from '@nestjs/common';
import { ConsultaController } from './consulta.controller';
import { ConsultaService } from './consulta.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';
import { FonteDeDadosModule } from '../fonte-de-dados/fonte-de-dados.module';

@Module({
  imports: [AuthModule, ModuloModule, FonteDeDadosModule],
  controllers: [ConsultaController],
  providers: [ConsultaService],
  exports: [ConsultaService],
})
export class ConsultaModule {}
