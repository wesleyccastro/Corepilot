import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { SkillService } from './skill.service';
import { SkillExecucaoService } from './skill-execucao.service';
import { SkillExecutorService } from './skill-executor.service';
import { AuditService } from '../audit/audit.service';
import type { CampoSaida } from './schema-builder';
import type { ExecutarSkillDto } from './dto/executar-skill.dto';

@Controller('skills/:skillId/execucoes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillExecucaoController {
  constructor(
    private readonly skillService: SkillService,
    private readonly skillExecucaoService: SkillExecucaoService,
    private readonly skillExecutorService: SkillExecutorService,
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
  async executar(
    @Param('skillId') skillId: string,
    @Body() body: ExecutarSkillDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const skill = await this.skillService.findByIdInEmpresa(skillId, empresaId);

    const { output, usage } = await this.skillExecutorService.executar({
      agente: skill.agente,
      modulo: skill.agente.modulo,
      skill: {
        objetivo: skill.objetivo,
        camposSaida: skill.camposSaida as unknown as CampoSaida[],
        ferramentas: skill.ferramentas,
      },
      entrada: body.entrada,
    });

    if (!output) {
      throw new UnprocessableEntityException(
        'A resposta do agente não pôde ser validada contra o schema da skill',
      );
    }

    const execucao = await this.skillExecucaoService.appendExecucao(
      skillId,
      usuarioId,
      body.entrada,
      output,
      usage.input_tokens,
      usage.output_tokens,
    );

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'skill_execucao',
      dadosDepois: {
        skillId,
        agenteId: skill.agenteId,
        moduloId: skill.agente.moduloId,
        tokensEntrada: usage.input_tokens,
        tokensSaida: usage.output_tokens,
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
