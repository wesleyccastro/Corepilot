import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConversaService } from './conversa.service';

@Controller('modulos/:moduloId/conversas')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConversaController {
  constructor(
    private readonly conversaService: ConversaService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Param('moduloId') moduloId: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    return this.conversaService.create(moduloId, usuarioId, empresaId);
  }

  @Get()
  async listar(@Param('moduloId') moduloId: string) {
    const { usuarioId } = this.tenantContext.get();
    return this.conversaService.findAllByModuloAndUsuario(moduloId, usuarioId);
  }
}
