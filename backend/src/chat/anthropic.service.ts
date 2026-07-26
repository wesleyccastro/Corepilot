import { Inject, Injectable } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT } from './anthropic-client.provider';

export interface StreamReplyParams {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  model: string;
  maxTokens: number;
}

@Injectable()
export class AnthropicService {
  constructor(@Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic) {}

  streamReply(params: StreamReplyParams) {
    return this.client.messages.stream({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
    });
  }
}
