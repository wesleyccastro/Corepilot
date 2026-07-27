import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { SkillService } from './skill.service';
import type { CreateSkillDto } from './dto/create-skill.dto';
import type { UpdateSkillDto } from './dto/update-skill.dto';

@Controller('agentes/:agenteId/skills')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillController {
  constructor(
    private readonly skillService: SkillService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(
    @Param('agenteId') agenteId: string,
    @Body() body: CreateSkillDto,
  ) {
    if (
      !body.nome?.trim() ||
      !body.objetivo?.trim() ||
      !body.camposSaida?.length
    ) {
      throw new BadRequestException(
        'nome, objetivo e ao menos um campo de saída são obrigatórios',
      );
    }

    const { empresaId } = this.tenantContext.get();
    return this.skillService.create(agenteId, empresaId, body);
  }

  @Get()
  async listar(@Param('agenteId') agenteId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.skillService.findAllByAgente(agenteId, empresaId);
  }

  @Patch(':skillId')
  async atualizar(
    @Param('agenteId') _agenteId: string,
    @Param('skillId') skillId: string,
    @Body() body: UpdateSkillDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.skillService.update(skillId, empresaId, body);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'skill_atualizada',
      dadosDepois: body as unknown as Prisma.InputJsonValue,
    });
    return resultado;
  }
}
