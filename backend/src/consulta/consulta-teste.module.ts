import { Module } from '@nestjs/common';
import { ConsultaTesteController } from './consulta-teste.controller';
import { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';
import { AuthModule } from '../auth/auth.module';
import { ConsultaModule } from './consulta.module';
import { TotvsRmModule } from '../totvs-rm/totvs-rm.module';

@Module({
  imports: [AuthModule, ConsultaModule, TotvsRmModule],
  controllers: [ConsultaTesteController],
  providers: [ConsultaSincronizacaoService],
  exports: [ConsultaSincronizacaoService],
})
export class ConsultaTesteModule {}
