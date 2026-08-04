import { Body, Controller, Get, Param, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { SkillService } from './skill.service';
import { SkillExecucaoService } from './skill-execucao.service';
import { AnthropicService, type MensagemConversa } from '../chat/anthropic.service';
import { AuditService } from '../audit/audit.service';
import { construirSchemaSaida, type CampoSaida } from './schema-builder';
import {
  buscarDadosLocaisConsulta,
  consultaIdDaFerramenta,
  montarFerramentasDeConsultas,
} from '../consulta/consulta-ferramenta.util';
import type { ExecutarSkillDto } from './dto/executar-skill.dto';

function montarSystemPrompt(
  agente: {
    nome: string;
    funcao: string;
    objetivo: string;
    guardrails: string | null;
    regraEscalonamento: string | null;
  },
  skill: { objetivo: string },
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
    partes.push(`ESCALONAMENTO PARA HUMANO:\n${agente.regraEscalonamento.trim()}`);
  }

  return partes.join('\n\n');
}

const MAX_ITERACOES_TOOL_USE = 5;

@Controller('skills/:skillId/execucoes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillExecucaoController {
  constructor(
    private readonly skillService: SkillService,
    private readonly skillExecucaoService: SkillExecucaoService,
    private readonly anthropicService: AnthropicService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get()
  async listar(@Param('skillId') skillId: string) {
    const { empresaId } = this.tenantContext.get();
    await this.skillService.findByIdInEmpresa(skillId, empresaId);
    return this.skillExecucaoService.listBySkill(skillId);
  }

  @Post()
  async executar(@Param('skillId') skillId: string, @Body() body: ExecutarSkillDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const skill = await this.skillService.findByIdInEmpresa(skillId, empresaId);

    const schema = construirSchemaSaida(skill.camposSaida as unknown as CampoSaida[]);
    const system = montarSystemPrompt(skill.agente, skill);

    const response =
      skill.ferramentas.length === 0
        ? await this.anthropicService.parseStructured({
            system,
            mensagem: body.entrada,
            model: skill.agente.modeloIA,
            maxTokens: 4096,
            schema,
          })
        : await this.executarComFerramentas(skill, system, body.entrada, schema);

    if (!response.parsed_output) {
      throw new UnprocessableEntityException(
        'A resposta do agente não pôde ser validada contra o schema da skill',
      );
    }

    const execucao = await this.skillExecucaoService.appendExecucao(
      skillId,
      usuarioId,
      body.entrada,
      response.parsed_output,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'skill_execucao',
      dadosDepois: {
        skillId,
        agenteId: skill.agenteId,
        moduloId: skill.agente.moduloId,
        tokensEntrada: response.usage.input_tokens,
        tokensSaida: response.usage.output_tokens,
        modelo: skill.agente.modeloIA,
      },
    });

    return {
      execucaoId: execucao.id,
      saida: execucao.saida,
      tokensEntrada: execucao.tokensEntrada,
      tokensSaida: execucao.tokensSaida,
    };
  }

  private async executarComFerramentas(
    skill: {
      ferramentas: { id: string; nome: string; camposFiltro: unknown }[];
      agente: { modeloIA: string };
    },
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
        model: skill.agente.modeloIA,
        maxTokens: 4096,
        tools,
      })) as unknown as { stop_reason: string; content: Array<Record<string, unknown>> };

      mensagens = [...mensagens, { role: 'assistant', content: resposta.content }];

      if (resposta.stop_reason !== 'tool_use') {
        break;
      }

      const blocosDeTool = resposta.content.filter((bloco) => bloco.type === 'tool_use');

      const resultadosDeTool = await Promise.all(
        blocosDeTool.map(async (bloco) => {
          const consultaId = consultaIdDaFerramenta(bloco.name as string);
          const linhas = await buscarDadosLocaisConsulta(this.prisma, consultaId, bloco.input as Record<string, unknown>);
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
      model: skill.agente.modeloIA,
      maxTokens: 4096,
      schema,
    });
  }
}
