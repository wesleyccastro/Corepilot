import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnthropicService,
  type MensagemConversa,
} from '../chat/anthropic.service';
import { construirSchemaSaida, type CampoSaida } from './schema-builder';
import {
  buscarDadosLocaisConsulta,
  consultaIdDaFerramenta,
  montarFerramentasDeConsultas,
} from '../consulta/consulta-ferramenta.util';

export interface ExecutarSkillAgente {
  nome: string;
  funcao: string;
  objetivo: string;
  guardrails: string | null;
  regraEscalonamento: string | null;
  modeloIA: string;
}

export interface ExecutarSkillModulo {
  instrucoes: string | null;
}

export interface ExecutarSkillSkill {
  objetivo: string;
  camposSaida: CampoSaida[];
  ferramentas: { id: string; nome: string; camposFiltro: unknown }[];
}

export interface ExecutarSkillParams {
  agente: ExecutarSkillAgente;
  modulo: ExecutarSkillModulo;
  skill: ExecutarSkillSkill;
  entrada: string;
}

export interface ExecutarSkillResultado {
  output: unknown;
  usage: { input_tokens: number; output_tokens: number };
}

function montarSystemPrompt(
  agente: ExecutarSkillAgente,
  modulo: ExecutarSkillModulo,
  skill: ExecutarSkillSkill,
): string {
  const partes = [
    `Você é o agente "${agente.nome}" (${agente.funcao}) desta empresa.`,
    `Objetivo do agente: ${agente.objetivo}`,
    `Você está executando a skill com o seguinte objetivo: ${skill.objetivo}`,
  ];

  if (agente.guardrails?.trim()) {
    partes.push(`RESTRIÇÕES (nunca viole):\n${agente.guardrails.trim()}`);
  }
  if (agente.regraEscalonamento?.trim()) {
    partes.push(
      `ESCALONAMENTO PARA HUMANO:\n${agente.regraEscalonamento.trim()}`,
    );
  }
  if (modulo.instrucoes?.trim()) {
    partes.push(`Instruções adicionais: ${modulo.instrucoes}`);
  }

  return partes.join('\n\n');
}

const MAX_ITERACOES_TOOL_USE = 5;

@Injectable()
export class SkillExecutorService {
  constructor(
    private readonly anthropicService: AnthropicService,
    private readonly prisma: PrismaService,
  ) {}

  async executar(
    params: ExecutarSkillParams,
  ): Promise<ExecutarSkillResultado> {
    const { agente, modulo, skill, entrada } = params;
    const schema = construirSchemaSaida(skill.camposSaida);
    const system = montarSystemPrompt(agente, modulo, skill);

    const response =
      skill.ferramentas.length === 0
        ? await this.anthropicService.parseStructured({
            system,
            mensagem: entrada,
            model: agente.modeloIA,
            maxTokens: 4096,
            schema,
          })
        : await this.executarComFerramentas(
            skill,
            agente.modeloIA,
            system,
            entrada,
            schema,
          );

    return { output: response.parsed_output, usage: response.usage };
  }

  private async executarComFerramentas(
    skill: ExecutarSkillSkill,
    model: string,
    system: string,
    entrada: string,
    schema: ReturnType<typeof construirSchemaSaida>,
  ) {
    const tools = montarFerramentasDeConsultas(skill.ferramentas);
    let mensagens: MensagemConversa[] = [{ role: 'user', content: entrada }];

    for (let iteracao = 0; iteracao < MAX_ITERACOES_TOOL_USE; iteracao++) {
      const resposta = (await this.anthropicService.createWithTools({
        system,
        messages: mensagens,
        model,
        maxTokens: 4096,
        tools,
      })) as unknown as {
        stop_reason: string;
        content: Array<Record<string, unknown>>;
      };

      mensagens = [
        ...mensagens,
        { role: 'assistant', content: resposta.content },
      ];

      if (resposta.stop_reason !== 'tool_use') {
        break;
      }

      const blocosDeTool = resposta.content.filter(
        (bloco) => bloco.type === 'tool_use',
      );

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

    return this.anthropicService.parseStructuredFromHistory({
      system,
      messages: mensagens,
      model,
      maxTokens: 4096,
      schema,
    });
  }
}
