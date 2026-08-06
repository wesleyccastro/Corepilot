import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type {
  Agente,
  Etapa,
  ExecucaoDeEtapa,
  InstanciaDeProcesso,
  Prisma,
  Skill,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicService } from '../chat/anthropic.service';
import { construirSchemaSaida, type CampoSaida } from '../skill/schema-builder';
import { OrquestradorEngineService } from './orquestrador-engine.service';

type ExecucaoDeAgente = ExecucaoDeEtapa & {
  instancia: InstanciaDeProcesso;
  etapa: Etapa & { agente: Agente | null; skill: Skill | null };
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
}
