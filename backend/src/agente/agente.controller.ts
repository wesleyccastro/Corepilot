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
import { AgenteService } from './agente.service';
import type { CreateAgenteDto } from './dto/create-agente.dto';
import type { UpdateAgenteDto } from './dto/update-agente.dto';

@Controller('modulos/:moduloId/agentes')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AgenteController {
  constructor(
    private readonly agenteService: AgenteService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(
    @Param('moduloId') moduloId: string,
    @Body() body: CreateAgenteDto,
  ) {
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

  @Patch(':agenteId')
  async atualizar(
    @Param('moduloId') _moduloId: string,
    @Param('agenteId') agenteId: string,
    @Body() body: UpdateAgenteDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.agenteService.update(
      agenteId,
      empresaId,
      body,
    );
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'agente_atualizado',
      dadosDepois: body as unknown as Prisma.InputJsonValue,
    });
    return resultado;
  }
}
