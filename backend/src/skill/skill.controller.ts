import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { SkillService } from './skill.service';
import type { CreateSkillDto } from './dto/create-skill.dto';

@Controller('agentes/:agenteId/skills')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SkillController {
  constructor(
    private readonly skillService: SkillService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Param('agenteId') agenteId: string, @Body() body: CreateSkillDto) {
    if (!body.nome?.trim() || !body.objetivo?.trim() || !body.camposSaida?.length) {
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
}
