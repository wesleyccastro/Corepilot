import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConversaTagService } from './conversa-tag.service';

interface CriarConversaTagDto {
  nome: string;
}

@Controller('modulos/:moduloId/tags')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConversaTagController {
  constructor(
    private readonly conversaTagService: ConversaTagService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Param('moduloId') moduloId: string, @Body() body: CriarConversaTagDto) {
    if (!body.nome?.trim()) {
      throw new BadRequestException('nome é obrigatório');
    }

    const { empresaId } = this.tenantContext.get();
    return this.conversaTagService.create(moduloId, empresaId, body.nome.trim());
  }

  @Get()
  async listar(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.conversaTagService.findAllByModulo(moduloId, empresaId);
  }

  @Delete(':tagId')
  async remover(@Param('tagId') tagId: string) {
    const { empresaId } = this.tenantContext.get();
    await this.conversaTagService.remove(tagId, empresaId);
    return { ok: true };
  }
}
