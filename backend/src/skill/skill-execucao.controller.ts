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
import { construirInputSchemaFerramenta } from '../consulta/tool-schema-builder';
import type { ExecutarSkillDto } from './dto/executar-skill.dto';

function montarSystemPrompt(
  agente: { nome: string; funcao: string; objetivo: string },
  skill: { objetivo: string },
): string {
  return [
    `Você é o agente "${agente.nome}" (${agente.funcao}) desta empresa.`,
    `Objetivo do agente: ${agente.objetivo}`,
    `Você está executando a skill com o seguinte objetivo: ${skill.objetivo}`,
  ].join('\n\n');
}

function nomeFerramenta(consultaId: string): string {
  return `consulta_${consultaId}`;
}

function consultaIdDaFerramenta(nome: string): string {
  return nome.replace('consulta_', '');
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
    const tools = skill.ferramentas.map((ferramenta) => ({
      name: nomeFerramenta(ferramenta.id),
      description: `Consulta "${ferramenta.nome}" com dados sincronizados do TOTVS RM.`,
      input_schema: construirInputSchemaFerramenta(ferramenta.camposFiltro as unknown as CampoSaida[]),
    }));

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
          const linhas = await this.buscarDadosLocais(consultaId, bloco.input as Record<string, unknown>);
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

  private async buscarDadosLocais(
    consultaId: string,
    filtro: Record<string, unknown>,
  ): Promise<Record<string, unknown>[]> {
    const linhas = await this.prisma.consultaResultado.findMany({
      where: { consultaParametrizadaId: consultaId },
      take: 200,
    });

    const dados = linhas.map((linha) => linha.dados as Record<string, unknown>);
    const chavesFiltro = Object.entries(filtro);

    return dados.filter((linha) => chavesFiltro.every(([chave, valor]) => linha[chave] === valor)).slice(0, 20);
  }
}
