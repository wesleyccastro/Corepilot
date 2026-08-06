import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type {
  Agente,
  Etapa,
  ExecucaoDeEtapa,
  InstanciaDeProcesso,
  Prisma,
  Skill,
} from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicService } from '../chat/anthropic.service';
import { construirSchemaSaida, type CampoSaida } from '../skill/schema-builder';
import { descriptografar } from '../fonte-de-dados/crypto';
import { EvolutionApiAdapterService } from '../integracao-whatsapp/evolution-api-adapter.service';
import { OrquestradorEngineService } from './orquestrador-engine.service';

type ExecucaoDeAgente = ExecucaoDeEtapa & {
  instancia: InstanciaDeProcesso;
  etapa: Etapa & { agente: Agente | null; skill: Skill | null };
};

type ExecucaoDeIntegracao = ExecucaoDeEtapa & {
  instancia: InstanciaDeProcesso;
  etapa: Etapa & { agente: Agente | null };
};

function montarSystemPromptDaEtapa(agente: Agente, skill: Skill): string {
  const partes = [
    `Você é o agente "${agente.nome}" (${agente.funcao}) desta empresa.`,
    `Objetivo do agente: ${agente.objetivo}`,
    `Você está executando a etapa "${skill.objetivo}" de um processo automatizado.`,
  ];
  if (agente.guardrails?.trim())
    partes.push(`RESTRIÇÕES (nunca viole):\n${agente.guardrails.trim()}`);
  if (agente.regraEscalonamento?.trim())
    partes.push(
      `ESCALONAMENTO PARA HUMANO:\n${agente.regraEscalonamento.trim()}`,
    );
  return partes.join('\n\n');
}

@Injectable()
export class OrquestradorFilaWorker {
  private readonly logger = new Logger(OrquestradorFilaWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropicService: AnthropicService,
    private readonly engine: OrquestradorEngineService,
    private readonly evolutionApi: EvolutionApiAdapterService,
    private readonly config: ConfigService,
  ) {}

  @Interval(5000)
  async processarFilaAgentes(): Promise<void> {
    const pendentes = (await this.prisma.execucaoDeEtapa.findMany({
      where: { status: 'pending', ator: 'agente' },
      orderBy: { criadoEm: 'asc' },
      take: 5,
      include: {
        instancia: true,
        etapa: { include: { agente: true, skill: true } },
      },
    })) as ExecucaoDeAgente[];

    for (const execucao of pendentes) {
      let processouComSucesso = false;
      try {
        await this.processarExecucaoDeAgente(execucao);
        processouComSucesso = true;
      } catch (erro) {
        this.logger.error(
          `Falha ao processar execução de agente ${execucao.id}`,
          erro,
        );
        await this.prisma.execucaoDeEtapa.update({
          where: { id: execucao.id },
          data: {
            status: 'failed',
            mensagemErro: String(erro),
            concluidoEm: new Date(),
          },
        });
        await this.prisma.instanciaDeProcesso.update({
          where: { id: execucao.instanciaId },
          data: { status: 'erro' },
        });
      }

      // engine.avancar roda fora do try/catch acima de propósito: nesse ponto
      // a execução já foi commitada como "done" com sua saída (agente
      // concluiu com sucesso). Se avancar falhar, a execução em si continua
      // "done" — só a instância fica travada — nunca sobrescrevemos um
      // registro de auditoria bem-sucedido com "failed".
      if (processouComSucesso) {
        try {
          await this.engine.avancar(execucao.instanciaId, execucao.etapaId);
        } catch (erro) {
          this.logger.error(
            `Execução de agente ${execucao.id} concluiu com sucesso, mas falhou ao avançar a instância`,
            erro,
          );
          await this.prisma.instanciaDeProcesso.update({
            where: { id: execucao.instanciaId },
            data: { status: 'erro' },
          });
        }
      }
    }
  }

  private async processarExecucaoDeAgente(
    execucao: ExecucaoDeAgente,
  ): Promise<void> {
    await this.prisma.execucaoDeEtapa.update({
      where: { id: execucao.id },
      data: { status: 'processing' },
    });

    const { etapa, instancia } = execucao;
    if (!etapa.agente || !etapa.skill) {
      throw new Error(
        `Etapa "${etapa.nome}" está marcada como tarefa_agente mas não tem agente/skill configurados`,
      );
    }

    const entrada = this.montarEntrada(instancia, etapa);
    const schema = construirSchemaSaida(
      etapa.skill.camposSaida as unknown as CampoSaida[],
    );
    const response = await this.anthropicService.parseStructured({
      system: montarSystemPromptDaEtapa(etapa.agente, etapa.skill),
      mensagem: JSON.stringify(entrada),
      model: etapa.agente.modeloIA,
      maxTokens: 4096,
      schema,
    });

    if (!response.parsed_output) {
      throw new Error(
        'A saída do agente não pôde ser validada contra o schema da skill',
      );
    }

    // Marcar a execução como "done" com a saída E acumular a saída em
    // InstanciaDeProcesso.dadosAcumulados são uma única operação lógica: se
    // uma delas falhar, a outra não pode ter sido persistida (mesmo padrão de
    // fluxo.service.ts's clonarComoRascunho e orquestrador-engine.service.ts).
    const dadosAcumulados = {
      ...(instancia.dadosAcumulados as Record<string, unknown>),
      [etapa.id]: response.parsed_output,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.execucaoDeEtapa.update({
        where: { id: execucao.id },
        data: {
          status: 'done',
          output: response.parsed_output as Prisma.InputJsonValue,
          tokensEntrada: response.usage.input_tokens,
          tokensSaida: response.usage.output_tokens,
          concluidoEm: new Date(),
        },
      });

      await tx.instanciaDeProcesso.update({
        where: { id: execucao.instanciaId },
        data: { dadosAcumulados: dadosAcumulados as Prisma.InputJsonValue },
      });
    });
  }

  private montarEntrada(
    instancia: InstanciaDeProcesso,
    etapa: Etapa,
  ): Record<string, unknown> {
    const refs = etapa.entradaRefs as unknown as string[];
    const dados = instancia.dadosAcumulados as Record<string, unknown>;
    if (!refs.length) return dados;
    return Object.fromEntries(
      refs.filter((id) => id in dados).map((id) => [id, dados[id]]),
    );
  }

  @Interval(5000)
  async processarFilaIntegracoes(): Promise<void> {
    const pendentes = (await this.prisma.execucaoDeEtapa.findMany({
      where: { status: 'pending', ator: 'integracao' },
      orderBy: { criadoEm: 'asc' },
      take: 5,
      include: { instancia: true, etapa: { include: { agente: true } } },
    })) as ExecucaoDeIntegracao[];

    for (const execucao of pendentes) {
      let processouComSucesso = false;
      try {
        await this.processarExecucaoDeIntegracao(execucao);
        processouComSucesso = true;
      } catch (erro) {
        this.logger.error(
          `Falha ao processar execução de integração ${execucao.id}`,
          erro,
        );
        await this.prisma.execucaoDeEtapa.update({
          where: { id: execucao.id },
          data: {
            status: 'failed',
            mensagemErro: String(erro),
            concluidoEm: new Date(),
          },
        });
        await this.prisma.instanciaDeProcesso.update({
          where: { id: execucao.instanciaId },
          data: { status: 'erro' },
        });
      }

      // Mesmo padrão de processarFilaAgentes: engine.avancar roda fora do
      // try/catch que marca falha. Nesse ponto a execução já foi commitada
      // como "done" (envio ocorreu com sucesso, ou já tinha sido enviada
      // antes e a idempotência foi respeitada). Se avancar falhar, só a
      // instância fica travada em erro — nunca sobrescrevemos o registro de
      // execução, já concluído, de volta para "failed".
      if (processouComSucesso) {
        try {
          await this.engine.avancar(execucao.instanciaId, execucao.etapaId);
        } catch (erro) {
          this.logger.error(
            `Execução de integração ${execucao.id} concluiu com sucesso, mas falhou ao avançar a instância`,
            erro,
          );
          await this.prisma.instanciaDeProcesso.update({
            where: { id: execucao.instanciaId },
            data: { status: 'erro' },
          });
        }
      }
    }
  }

  private async processarExecucaoDeIntegracao(
    execucao: ExecucaoDeIntegracao,
  ): Promise<void> {
    await this.prisma.execucaoDeEtapa.update({
      where: { id: execucao.id },
      data: { status: 'processing' },
    });

    const jaEnviada = await this.prisma.execucaoDeEtapa.findFirst({
      where: {
        chaveIdempotencia: execucao.chaveIdempotencia,
        status: 'done',
        id: { not: execucao.id },
      },
    });
    if (jaEnviada) {
      await this.prisma.$transaction(async (tx) => {
        await tx.execucaoDeEtapa.update({
          where: { id: execucao.id },
          data: {
            status: 'done',
            output: jaEnviada.output as Prisma.InputJsonValue,
            concluidoEm: new Date(),
          },
        });
      });
      return;
    }

    const { etapa, instancia } = execucao;
    const integracao = await this.prisma.integracaoWhatsApp.findUnique({
      where: { empresaId: instancia.empresaId },
    });
    if (!integracao) {
      throw new Error('Empresa não tem integração de WhatsApp configurada');
    }

    const telefone =
      ((instancia.dadosAcumulados as Record<string, unknown>).telefone as
        string | undefined) ??
      integracao.phone ??
      undefined;
    if (!telefone) {
      throw new Error(
        'Nenhum telefone de destino disponível (nem em dadosAcumulados.telefone, nem na integração)',
      );
    }

    const texto = await this.montarTextoDaMensagem(etapa, instancia);

    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');
    const resultado = await this.evolutionApi.enviarMensagem(
      {
        apiUrl: integracao.apiUrl,
        instanceName: integracao.instanceName,
        apiKey: descriptografar(integracao.apiKeyCriptografada, chave),
      },
      telefone,
      texto,
    );

    // Mesma justificativa do commit de processarExecucaoDeAgente: a marcação
    // de "done" com a saída é a única escrita do caminho de sucesso aqui,
    // mas fica dentro de uma transação por consistência com o restante do
    // worker e para blindar contra futuras escritas relacionadas que venham
    // a ser adicionadas a esse caminho.
    await this.prisma.$transaction(async (tx) => {
      await tx.execucaoDeEtapa.update({
        where: { id: execucao.id },
        data: {
          status: 'done',
          output: {
            texto,
            messageId: resultado.messageId,
          },
          concluidoEm: new Date(),
        },
      });
    });
  }

  private async montarTextoDaMensagem(
    etapa: Etapa & { agente: Agente | null },
    instancia: InstanciaDeProcesso,
  ): Promise<string> {
    if (etapa.executor !== 'agente_mais_integracao' || !etapa.agente) {
      return 'Atualização do seu processo no CorePilot.';
    }
    const resposta = await this.anthropicService.parseStructured({
      system: `Você é o agente "${etapa.agente.nome}". Redija uma mensagem de WhatsApp curta e objetiva pro destinatário, com base nos dados do processo.`,
      mensagem: JSON.stringify(instancia.dadosAcumulados),
      model: etapa.agente.modeloIA,
      maxTokens: 1024,
      schema: z.object({ mensagem: z.string() }),
    });
    const parsedOutput = resposta.parsed_output as
      { mensagem: string } | undefined;
    return (
      parsedOutput?.mensagem ?? 'Atualização do seu processo no CorePilot.'
    );
  }
}
