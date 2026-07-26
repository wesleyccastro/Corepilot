import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConversaService } from '../conversa/conversa.service';
import { AuditService } from '../audit/audit.service';
import { AnthropicService } from './anthropic.service';
import { MensagemService } from './mensagem.service';

interface EnviarMensagemBody {
  conteudo: string;
}

function montarSystemPrompt(modulo: { nome: string; objetivo: string; instrucoes: string | null }): string {
  const partes = [
    `Você é o assistente de IA do módulo "${modulo.nome}" desta empresa.`,
    `Objetivo do módulo: ${modulo.objetivo}`,
  ];

  if (modulo.instrucoes?.trim()) {
    partes.push(`Instruções adicionais: ${modulo.instrucoes}`);
  }

  return partes.join('\n\n');
}

@Controller('conversas/:conversaId/mensagens')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MensagemController {
  constructor(
    private readonly conversaService: ConversaService,
    private readonly mensagemService: MensagemService,
    private readonly anthropicService: AnthropicService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  async listar(@Param('conversaId') conversaId: string) {
    const { usuarioId } = this.tenantContext.get();
    await this.conversaService.findOwned(conversaId, usuarioId);
    return this.mensagemService.listByConversa(conversaId);
  }

  @Post()
  async enviar(
    @Param('conversaId') conversaId: string,
    @Body() body: EnviarMensagemBody,
    @Res() res: Response,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const conversa = await this.conversaService.findOwned(conversaId, usuarioId);

    await this.mensagemService.appendUserMessage(conversaId, body.conteudo);
    const historico = await this.mensagemService.listByConversa(conversaId);

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const system = montarSystemPrompt(conversa.modulo);
    const messages = historico.map((mensagem) => ({
      role: mensagem.papel === 'usuario' ? ('user' as const) : ('assistant' as const),
      content: mensagem.conteudo,
    }));

    try {
      const stream = this.anthropicService.streamReply({
        system,
        messages,
        model: conversa.modulo.modeloIA,
        maxTokens: 4096,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(JSON.stringify({ type: 'delta', text: event.delta.text }) + '\n');
        }
      }

      const final = await stream.finalMessage();
      const textoCompleto = final.content
        .filter((bloco): bloco is Extract<(typeof final.content)[number], { type: 'text' }> => bloco.type === 'text')
        .map((bloco) => bloco.text)
        .join('');

      const mensagemAgente = await this.mensagemService.appendAgentMessage(
        conversaId,
        textoCompleto,
        final.usage.input_tokens,
        final.usage.output_tokens,
      );

      await this.audit.record({
        empresaId,
        atorUsuarioId: usuarioId,
        acao: 'chat_mensagem',
        dadosDepois: {
          moduloId: conversa.moduloId,
          tokensEntrada: final.usage.input_tokens,
          tokensSaida: final.usage.output_tokens,
          modelo: conversa.modulo.modeloIA,
        },
      });

      res.write(
        JSON.stringify({
          type: 'done',
          mensagemId: mensagemAgente.id,
          tokensEntrada: final.usage.input_tokens,
          tokensSaida: final.usage.output_tokens,
        }) + '\n',
      );
    } catch {
      res.write(JSON.stringify({ type: 'erro', mensagem: 'Falha ao gerar resposta' }) + '\n');
    } finally {
      res.end();
    }
  }
}
