import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EvolutionApiAdapterService } from './evolution-api-adapter.service';
import { IntegracaoWhatsAppService } from './integracao-whatsapp.service';
import { IntegracaoWhatsAppController } from './integracao-whatsapp.controller';

@Module({
  imports: [AuthModule],
  controllers: [IntegracaoWhatsAppController],
  providers: [EvolutionApiAdapterService, IntegracaoWhatsAppService],
  exports: [EvolutionApiAdapterService],
})
export class IntegracaoWhatsAppModule {}
