import { Inject, Injectable } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { ANTHROPIC_CLIENT } from './anthropic-client.provider';

export interface StreamReplyParams {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  model: string;
  maxTokens: number;
}

export interface ParseStructuredParams {
  system: string;
  mensagem: string;
  model: string;
  maxTokens: number;
  schema: z.ZodTypeAny;
}

export interface MensagemConversa {
  role: 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
}

export interface FerramentaTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface CreateWithToolsParams {
  system: string;
  messages: MensagemConversa[];
  model: string;
  maxTokens: number;
  tools: FerramentaTool[];
}

export interface ParseStructuredFromHistoryParams {
  system: string;
  messages: MensagemConversa[];
  model: string;
  maxTokens: number;
  schema: z.ZodTypeAny;
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

  async parseStructured(params: ParseStructuredParams) {
    return this.client.messages.parse({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: 'user', content: params.mensagem }],
      output_config: { format: zodOutputFormat(params.schema) },
    });
  }

  async createWithTools(params: CreateWithToolsParams) {
    return this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
    } as Parameters<typeof this.client.messages.create>[0]);
  }

  async parseStructuredFromHistory(params: ParseStructuredFromHistoryParams) {
    return this.client.messages.parse({
      model: params.model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: params.messages,
      output_config: { format: zodOutputFormat(params.schema) },
    } as Parameters<typeof this.client.messages.parse>[0]);
  }
}
