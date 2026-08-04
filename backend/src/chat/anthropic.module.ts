import { Module } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';
import { anthropicClientProvider } from './anthropic-client.provider';

@Module({
  providers: [AnthropicService, anthropicClientProvider],
  exports: [AnthropicService],
})
export class AnthropicModule {}
