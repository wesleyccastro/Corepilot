import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AgenteService } from './agente.service';
import type { CreateAgenteDto } from './dto/create-agente.dto';

@Controller('modulos/:moduloId/agentes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AgenteController {
  constructor(
    private readonly agenteService: AgenteService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Param('moduloId') moduloId: string, @Body() body: CreateAgenteDto) {
    if (!body.nome?.trim() || !body.funcao?.trim() || !body.objetivo?.trim()) {
      throw new BadRequestException('nome, funcao e objetivo são obrigatórios');
    }

    const { empresaId } = this.tenantContext.get();
    return this.agenteService.create(moduloId, empresaId, body);
  }

  @Get()
  async listar(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.agenteService.findAllByModulo(moduloId, empresaId);
  }
}
