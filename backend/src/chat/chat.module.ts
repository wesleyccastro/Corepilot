import { Module } from '@nestjs/common';
import { MensagemController } from './mensagem.controller';
import { MensagemService } from './mensagem.service';
import { AnthropicService } from './anthropic.service';
import { anthropicClientProvider } from './anthropic-client.provider';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConversaModule } from '../conversa/conversa.module';

@Module({
  imports: [AuthModule, AuditModule, ConversaModule],
  controllers: [MensagemController],
  providers: [MensagemService, AnthropicService, anthropicClientProvider],
})
export class ChatModule {}
