import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MeModule } from './me/me.module';
import { ModuloModule } from './modulo/modulo.module';
import { ConversaModule } from './conversa/conversa.module';
import { ChatModule } from './chat/chat.module';
import { AgenteModule } from './agente/agente.module';
import { SkillModule } from './skill/skill.module';
import { SkillExecucaoModule } from './skill/skill-execucao.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    MeModule,
    ModuloModule,
    ConversaModule,
    ChatModule,
    AgenteModule,
    SkillModule,
    SkillExecucaoModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
