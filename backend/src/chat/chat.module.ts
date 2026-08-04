import { Module } from '@nestjs/common';
import { MensagemController } from './mensagem.controller';
import { MensagemService } from './mensagem.service';
import { AnthropicModule } from './anthropic.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ConversaModule } from '../conversa/conversa.module';
import { ConsultaModule } from '../consulta/consulta.module';

@Module({
  imports: [AuthModule, AuditModule, ConversaModule, ConsultaModule, AnthropicModule],
  controllers: [MensagemController],
  providers: [MensagemService],
  exports: [AnthropicModule],
})
export class ChatModule {}
