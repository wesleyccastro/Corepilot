import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (config: ConfigService) =>
    new Anthropic({ apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY') }),
  inject: [ConfigService],
};
