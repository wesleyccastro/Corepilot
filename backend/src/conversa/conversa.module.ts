import { Module } from '@nestjs/common';
import { ConversaController } from './conversa.controller';
import { ConversaService } from './conversa.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';

@Module({
  imports: [AuthModule, ModuloModule],
  controllers: [ConversaController],
  providers: [ConversaService],
  exports: [ConversaService],
})
export class ConversaModule {}
