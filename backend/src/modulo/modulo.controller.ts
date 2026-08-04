import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { ModuloService } from './modulo.service';
import type { CreateModuloDto } from './dto/create-modulo.dto';
import type { UpdateModuloDto } from './dto/update-modulo.dto';

@Controller('modulos')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ModuloController {
  constructor(
    private readonly moduloService: ModuloService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Body() body: CreateModuloDto) {
    if (!body.nome?.trim() || !body.objetivo?.trim()) {
      throw new BadRequestException('nome e objetivo são obrigatórios');
    }

    const { empresaId } = this.tenantContext.get();
    return this.moduloService.create(empresaId, body);
  }

  @Get()
  async listar(@Query('todos') todos?: string) {
    const { empresaId } = this.tenantContext.get();
    return this.moduloService.findAllByEmpresa(empresaId, todos === 'true');
  }

  @Patch(':id')
  async atualizar(@Param('id') id: string, @Body() body: UpdateModuloDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.moduloService.update(id, empresaId, body);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'modulo_atualizado',
      dadosDepois: body as unknown as Prisma.InputJsonValue,
    });
    return resultado;
  }
}
