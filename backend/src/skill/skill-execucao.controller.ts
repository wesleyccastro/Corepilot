import { Body, Controller, Get, Param, Post, UnprocessableEntityException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { SkillService } from './skill.service';
import { SkillExecucaoService } from './skill-execucao.service';
import { AnthropicService } from '../chat/anthropic.service';
import { AuditService } from '../audit/audit.service';
import { construirSchemaSaida, type CampoSaida } from './schema-builder';
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

@Controller('skills/:skillId/execucoes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillExecucaoController {
  constructor(
    private readonly skillService: SkillService,
    private readonly skillExecucaoService: SkillExecucaoService,
    private readonly anthropicService: AnthropicService,
    private readonly audit: AuditService,
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

    const response = await this.anthropicService.parseStructured({
      system,
      mensagem: body.entrada,
      model: skill.agente.modeloIA,
      maxTokens: 4096,
      schema,
    });

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
}
