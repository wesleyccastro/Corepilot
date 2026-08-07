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
    const respostaFalsa = {
      parsed_output: { titulo: 'ok' },
      usage: { input_tokens: 10, output_tokens: 5 },
    };
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

  it('createWithTools chama client.messages.create com tools', async () => {
    const respostaFalsa = { stop_reason: 'end_turn', content: [] };
    const client = {
      messages: { create: jest.fn().mockResolvedValue(respostaFalsa) },
    } as unknown as Anthropic;
    const service = new AnthropicService(client);
    const tools = [
      {
        name: 'consulta_1',
        description: 'x',
        input_schema: { type: 'object' as const, properties: {}, required: [] },
      },
    ];

    const resultado = await service.createWithTools({
      system: 'sys',
      messages: [{ role: 'user', content: 'oi' }],
      model: 'claude-sonnet-5',
      maxTokens: 4096,
      tools,
    });

    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        system: 'sys',
        tools,
      }),
    );
    expect(resultado).toBe(respostaFalsa);
  });

  it('parseStructuredFromHistory chama client.messages.parse com o histórico completo', async () => {
    const respostaFalsa = {
      parsed_output: { titulo: 'ok' },
      usage: { input_tokens: 20, output_tokens: 8 },
    };
    const client = {
      messages: { parse: jest.fn().mockResolvedValue(respostaFalsa) },
    } as unknown as Anthropic;
    const service = new AnthropicService(client);
    const schema = z.object({ titulo: z.string() });
    const historico = [
      { role: 'user' as const, content: 'oi' },
      { role: 'assistant' as const, content: [{ type: 'text', text: 'ok' }] },
    ];

    const resultado = await service.parseStructuredFromHistory({
      system: 'sys',
      messages: historico,
      model: 'claude-sonnet-5',
      maxTokens: 4096,
      schema,
    });

    expect(client.messages.parse).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'sys', messages: historico }),
    );
    expect(resultado).toBe(respostaFalsa);
  });

  it('streamReplyFromHistory chama client.messages.stream com o histórico completo', () => {
    const streamFalso = { fake: 'stream' };
    const client = {
      messages: { stream: jest.fn().mockReturnValue(streamFalso) },
    } as unknown as Anthropic;
    const service = new AnthropicService(client);
    const historico = [
      { role: 'user' as const, content: 'oi' },
      { role: 'assistant' as const, content: [{ type: 'text', text: 'ok' }] },
    ];

    const resultado = service.streamReplyFromHistory({
      system: 'sys',
      messages: historico,
      model: 'claude-sonnet-5',
      maxTokens: 4096,
    });

    expect(client.messages.stream).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'sys', messages: historico }),
    );
    expect(resultado).toBe(streamFalso);
  });
});
