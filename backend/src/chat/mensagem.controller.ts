import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConversaService } from '../conversa/conversa.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsultaService } from '../consulta/consulta.service';
import {
  buscarDadosLocaisConsulta,
  consultaIdDaFerramenta,
  montarFerramentasDeConsultas,
} from '../consulta/consulta-ferramenta.util';
import { AnthropicService, type MensagemConversa } from './anthropic.service';
import { MensagemService } from './mensagem.service';

interface EnviarMensagemBody {
  conteudo: string;
}

function montarSystemPrompt(modulo: {
  nome: string;
  objetivo: string;
  instrucoes: string | null;
}): string {
  const partes = [
    `Você é o assistente de IA do módulo "${modulo.nome}" desta empresa.`,
    `Objetivo do módulo: ${modulo.objetivo}`,
    'Quando uma pergunta depender de dados operacionais, use as ferramentas de consulta disponíveis em vez de responder de memória.',
  ];

  if (modulo.instrucoes?.trim()) {
    partes.push(`Instruções adicionais: ${modulo.instrucoes}`);
  }

  return partes.join('\n\n');
}

const MAX_ITERACOES_TOOL_USE = 5;

interface RespostaComUso {
  content: Array<Record<string, unknown>>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: string;
}

const MENSAGEM_RESPOSTA_TRUNCADA =
  'A resposta ficou grande demais e foi cortada antes de terminar. Pode tentar de novo pedindo algo mais específico (ex.: um talhão ou período menor)?';
const MENSAGEM_RESPOSTA_VAZIA =
  'Não consegui gerar uma resposta para essa pergunta. Pode tentar reformular?';

function extrairTexto(content: Array<Record<string, unknown>>): string {
  return content
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text as string)
    .join('');
}

@Controller('conversas/:conversaId/mensagens')
@UseGuards(JwtAuthGuard, TenantGuard)
export class MensagemController {
  private readonly logger = new Logger(MensagemController.name);

  constructor(
    private readonly conversaService: ConversaService,
    private readonly mensagemService: MensagemService,
    private readonly anthropicService: AnthropicService,
    private readonly consultaService: ConsultaService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
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
    const conversa = await this.conversaService.findOwned(
      conversaId,
      usuarioId,
    );

    await this.mensagemService.appendUserMessage(conversaId, body.conteudo);
    const historico = await this.mensagemService.listByConversa(conversaId);

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const system = montarSystemPrompt(conversa.modulo);
    let mensagens: MensagemConversa[] = historico.map((mensagem) => ({
      role:
        mensagem.papel === 'usuario'
          ? ('user' as const)
          : ('assistant' as const),
      content: mensagem.conteudo,
    }));

    let ferramentasUsadas = false;

    try {
      const consultas = await this.consultaService.findAllByModulo(
        conversa.moduloId,
        empresaId,
      );
      const consultasTestadas = consultas.filter(
        (consulta) => consulta.testada,
      );

      let respostaJaFinalizada: RespostaComUso | null = null;

      if (consultasTestadas.length > 0) {
        ferramentasUsadas = true;
        const resultado = await this.resolverFerramentas(
          res,
          mensagens,
          system,
          conversa.modulo.modeloIA,
          consultasTestadas,
        );
        mensagens = resultado.mensagens;
        respostaJaFinalizada = resultado.respostaFinal;
      }

      let textoCompleto: string;
      let usage: RespostaComUso['usage'];
      let stopReason: string;

      if (respostaJaFinalizada) {
        // O modelo já produziu a resposta final dentro do loop de ferramentas (stop_reason
        // diferente de 'tool_use'). Não dá pra fazer uma segunda chamada streaming a partir
        // daqui — a Anthropic rejeita histórico terminando em 'assistant' ("prefill").
        textoCompleto = extrairTexto(respostaJaFinalizada.content);
        usage = respostaJaFinalizada.usage;
        stopReason = respostaJaFinalizada.stop_reason;
      } else {
        if (ferramentasUsadas) {
          res.write(
            JSON.stringify({
              type: 'status',
              mensagem: 'Redigindo a resposta…',
            }) + '\n',
          );
        }
        const stream = this.anthropicService.streamReplyFromHistory({
          system,
          messages: mensagens,
          model: conversa.modulo.modeloIA,
          maxTokens: 16000,
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            res.write(
              JSON.stringify({ type: 'delta', text: event.delta.text }) + '\n',
            );
          }
        }

        const final = await stream.finalMessage();
        textoCompleto = extrairTexto(
          final.content as unknown as Array<Record<string, unknown>>,
        );
        usage = final.usage;
        stopReason = final.stop_reason ?? 'desconhecido';
      }

      if (!textoCompleto.trim()) {
        this.logger.warn(
          `Resposta do chat veio vazia (stop_reason=${stopReason}) na conversa ${conversaId}`,
        );
        textoCompleto =
          stopReason === 'max_tokens'
            ? MENSAGEM_RESPOSTA_TRUNCADA
            : MENSAGEM_RESPOSTA_VAZIA;
      }
      res.write(JSON.stringify({ type: 'delta', text: textoCompleto }) + '\n');

      const mensagemAgente = await this.mensagemService.appendAgentMessage(
        conversaId,
        textoCompleto,
        usage.input_tokens,
        usage.output_tokens,
      );

      await this.audit.record({
        empresaId,
        atorUsuarioId: usuarioId,
        acao: 'chat_mensagem',
        dadosDepois: {
          moduloId: conversa.moduloId,
          tokensEntrada: usage.input_tokens,
          tokensSaida: usage.output_tokens,
          modelo: conversa.modulo.modeloIA,
          ferramentasUsadas,
        },
      });

      res.write(
        JSON.stringify({
          type: 'done',
          mensagemId: mensagemAgente.id,
          tokensEntrada: usage.input_tokens,
          tokensSaida: usage.output_tokens,
        }) + '\n',
      );
    } catch (err) {
      this.logger.error(
        'Falha ao gerar resposta do chat',
        err instanceof Error ? err.stack : err,
      );
      res.write(
        JSON.stringify({ type: 'erro', mensagem: 'Falha ao gerar resposta' }) +
          '\n',
      );
    } finally {
      res.end();
    }
  }

  private async resolverFerramentas(
    res: Response,
    mensagensIniciais: MensagemConversa[],
    system: string,
    model: string,
    consultas: { id: string; nome: string; camposFiltro: unknown }[],
  ): Promise<{
    mensagens: MensagemConversa[];
    respostaFinal: RespostaComUso | null;
  }> {
    const tools = montarFerramentasDeConsultas(consultas);
    const nomesPorConsultaId = new Map(
      consultas.map((consulta) => [consulta.id, consulta.nome]),
    );
    let mensagens = mensagensIniciais;

    const emitirStatus = (mensagem: string) =>
      res.write(JSON.stringify({ type: 'status', mensagem }) + '\n');

    for (let iteracao = 0; iteracao < MAX_ITERACOES_TOOL_USE; iteracao++) {
      emitirStatus(
        iteracao === 0
          ? 'Verificando quais dados essa pergunta precisa…'
          : 'Analisando os dados retornados…',
      );

      const resposta = (await this.anthropicService.createWithTools({
        system,
        messages: mensagens,
        model,
        maxTokens: 16000,
        tools,
      })) as unknown as RespostaComUso;

      if (resposta.stop_reason !== 'tool_use') {
        return { mensagens, respostaFinal: resposta };
      }

      mensagens = [
        ...mensagens,
        { role: 'assistant', content: resposta.content },
      ];

      const blocosDeTool = resposta.content.filter(
        (bloco) => bloco.type === 'tool_use',
      );
      const nomesConsultadosNesteTurno = blocosDeTool
        .map((bloco) =>
          nomesPorConsultaId.get(consultaIdDaFerramenta(bloco.name as string)),
        )
        .filter((nome): nome is string => !!nome);
      if (nomesConsultadosNesteTurno.length > 0) {
        emitirStatus(`Consultando ${nomesConsultadosNesteTurno.join(', ')}…`);
      }

      const resultadosDeTool = await Promise.all(
        blocosDeTool.map(async (bloco) => {
          const consultaId = consultaIdDaFerramenta(bloco.name as string);
          const linhas = await buscarDadosLocaisConsulta(
            this.prisma,
            consultaId,
            bloco.input as Record<string, unknown>,
          );
          return {
            type: 'tool_result',
            tool_use_id: bloco.id as string,
            content: JSON.stringify(linhas),
          };
        }),
      );

      mensagens = [...mensagens, { role: 'user', content: resultadosDeTool }];
    }

    return { mensagens, respostaFinal: null };
  }
}
