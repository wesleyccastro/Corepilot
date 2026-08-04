import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConversaService, type AtualizarConversaDto } from './conversa.service';

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

  @Patch(':id')
  async atualizar(@Param('id') id: string, @Body() body: AtualizarConversaDto) {
    const { usuarioId } = this.tenantContext.get();
    return this.conversaService.update(id, usuarioId, body);
  }

  @Delete(':id')
  async remover(@Param('id') id: string) {
    const { usuarioId } = this.tenantContext.get();
    await this.conversaService.remove(id, usuarioId);
    return { ok: true };
  }
}
