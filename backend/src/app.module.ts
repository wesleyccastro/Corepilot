import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MeModule } from './me/me.module';
import { ModuloModule } from './modulo/modulo.module';
import { ConversaModule } from './conversa/conversa.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.local' }),
    PrismaModule,
    MeModule,
    ModuloModule,
    ConversaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
