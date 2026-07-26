import { AnthropicService } from './anthropic.service';
import type Anthropic from '@anthropic-ai/sdk';

describe('AnthropicService', () => {
  it('chama client.messages.stream com os parâmetros corretos', () => {
    const streamFalso = { fake: 'stream' };
    const client = {
      messages: { stream: jest.fn().mockReturnValue(streamFalso) },
    } as unknown as Anthropic;
    const service = new AnthropicService(client);

    const resultado = service.streamReply({
      system: 'Você é um assistente de compras.',
      messages: [{ role: 'user', content: 'Oi' }],
      model: 'claude-sonnet-5',
      maxTokens: 4096,
    });

    expect(client.messages.stream).toHaveBeenCalledWith({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      system: 'Você é um assistente de compras.',
      messages: [{ role: 'user', content: 'Oi' }],
    });
    expect(resultado).toBe(streamFalso);
  });
});
