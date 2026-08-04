import { Module } from '@nestjs/common';
import { ConversaController } from './conversa.controller';
import { ConversaService } from './conversa.service';
import { ConversaTagController } from './conversa-tag.controller';
import { ConversaTagService } from './conversa-tag.service';
import { AuthModule } from '../auth/auth.module';
import { ModuloModule } from '../modulo/modulo.module';

@Module({
  imports: [AuthModule, ModuloModule],
  controllers: [ConversaController, ConversaTagController],
  providers: [ConversaService, ConversaTagService],
  exports: [ConversaService, ConversaTagService],
})
export class ConversaModule {}
