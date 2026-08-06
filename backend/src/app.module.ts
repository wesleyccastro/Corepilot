import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MeModule } from './me/me.module';
import { EmpresaModule } from './empresa/empresa.module';
import { ModuloModule } from './modulo/modulo.module';
import { ConversaModule } from './conversa/conversa.module';
import { ChatModule } from './chat/chat.module';
import { AgenteModule } from './agente/agente.module';
import { SkillModule } from './skill/skill.module';
import { SkillExecucaoModule } from './skill/skill-execucao.module';
import { FonteDeDadosModule } from './fonte-de-dados/fonte-de-dados.module';
import { ConsultaModule } from './consulta/consulta.module';
import { ConsultaTesteModule } from './consulta/consulta-teste.module';
import { SyncCronModule } from './consulta/sync-cron.module';
import { FerramentaModule } from './skill/ferramenta.module';
import { OrquestradorModule } from './orquestrador/orquestrador.module';
import { IntegracaoWhatsAppModule } from './integracao-whatsapp/integracao-whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    MeModule,
    EmpresaModule,
    ModuloModule,
    ConversaModule,
    ChatModule,
    AgenteModule,
    SkillModule,
    SkillExecucaoModule,
    FonteDeDadosModule,
    ConsultaModule,
    ConsultaTesteModule,
    SyncCronModule,
    FerramentaModule,
    OrquestradorModule,
    IntegracaoWhatsAppModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
