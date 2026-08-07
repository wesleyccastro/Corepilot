import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { OrquestradorEngineService } from './orquestrador-engine.service';
import type { CriarInstanciaDto } from './dto/criar-instancia.dto';

@Controller('modulos/:moduloId/fluxo/instancias')
@UseGuards(JwtAuthGuard, TenantGuard)
export class InstanciaController {
  constructor(
    private readonly engine: OrquestradorEngineService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(
    @Param('moduloId') moduloId: string,
    @Body() body: CriarInstanciaDto,
  ) {
    const { empresaId } = this.tenantContext.get();
    return this.engine.criarInstancia(
      moduloId,
      empresaId,
      body.dadosIniciais ?? {},
    );
  }

  @Get()
  async listar(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.engine.listar(moduloId, empresaId);
  }
}
