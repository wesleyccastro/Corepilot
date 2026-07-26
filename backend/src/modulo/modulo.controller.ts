import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ModuloService } from './modulo.service';
import type { CreateModuloDto } from './dto/create-modulo.dto';

@Controller('modulos')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ModuloController {
  constructor(
    private readonly moduloService: ModuloService,
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
  async listar() {
    const { empresaId } = this.tenantContext.get();
    return this.moduloService.findAllByEmpresa(empresaId);
  }
}
