import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { OrquestradorEngineService } from './orquestrador-engine.service';
import type { ExecutarAcaoDto } from './dto/executar-acao.dto';

@Controller('instancias')
@UseGuards(JwtAuthGuard, TenantGuard)
export class InstanciaAcaoController {
  constructor(
    private readonly engine: OrquestradorEngineService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Get(':id')
  async detalhar(@Param('id') id: string) {
    const { empresaId } = this.tenantContext.get();
    return this.engine.detalhar(id, empresaId);
  }

  @Post(':id/acoes')
  async executarAcao(@Param('id') id: string, @Body() body: ExecutarAcaoDto) {
    if (!body.acaoId) throw new BadRequestException('acaoId é obrigatório');
    const { usuarioId, empresaId } = this.tenantContext.get();
    const instancia = await this.engine.executarAcao(
      id,
      empresaId,
      body.acaoId,
      body.dados ?? {},
      usuarioId,
    );
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'etapa_acao_executada',
      dadosDepois: {
        instanciaId: id,
        acaoId: body.acaoId,
        dados: body.dados ?? {},
      } as unknown as Prisma.InputJsonValue,
    });
    return instancia;
  }
}
