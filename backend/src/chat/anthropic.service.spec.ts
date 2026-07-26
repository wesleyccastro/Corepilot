import { z } from 'zod';
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

  it('chama client.messages.parse com os parâmetros corretos', async () => {
    const respostaFalsa = { parsed_output: { titulo: 'ok' }, usage: { input_tokens: 10, output_tokens: 5 } };
    const client = {
      messages: { parse: jest.fn().mockResolvedValue(respostaFalsa) },
    } as unknown as Anthropic;
    const service = new AnthropicService(client);
    const schema = z.object({ titulo: z.string() });

    const resultado = await service.parseStructured({
      system: 'Você é um agente de triagem.',
      mensagem: 'Pedido: 10 parafusos',
      model: 'claude-sonnet-5',
      maxTokens: 4096,
      schema,
    });

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: 'Você é um agente de triagem.',
        messages: [{ role: 'user', content: 'Pedido: 10 parafusos' }],
      }),
    );
    expect(resultado).toBe(respostaFalsa);
  });
});
