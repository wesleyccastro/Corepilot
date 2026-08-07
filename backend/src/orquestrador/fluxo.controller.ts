import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { FluxoService } from './fluxo.service';
import type { CreateMacroetapaDto } from './dto/create-macroetapa.dto';
import type { UpdateMacroetapaDto } from './dto/update-macroetapa.dto';
import type { CreateEtapaDto } from './dto/create-etapa.dto';
import type { UpdateEtapaDto } from './dto/update-etapa.dto';

@Controller('modulos/:moduloId/fluxo')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FluxoController {
  constructor(
    private readonly fluxoService: FluxoService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async obterRascunho(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.getOrCreateRascunho(moduloId, empresaId);
  }

  @Post('macroetapas')
  async criarMacroetapa(
    @Param('moduloId') moduloId: string,
    @Body() body: CreateMacroetapaDto,
  ) {
    if (!body.nome?.trim()) throw new BadRequestException('nome é obrigatório');
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.criarMacroetapa(moduloId, empresaId, body);
  }

  @Patch('macroetapas/:macroetapaId')
  async atualizarMacroetapa(
    @Param('moduloId') moduloId: string,
    @Param('macroetapaId') macroetapaId: string,
    @Body() body: UpdateMacroetapaDto,
  ) {
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.atualizarMacroetapa(
      moduloId,
      empresaId,
      macroetapaId,
      body,
    );
  }

  @Delete('macroetapas/:macroetapaId')
  async excluirMacroetapa(
    @Param('moduloId') moduloId: string,
    @Param('macroetapaId') macroetapaId: string,
  ) {
    const { empresaId } = this.tenantContext.get();
    await this.fluxoService.excluirMacroetapa(
      moduloId,
      empresaId,
      macroetapaId,
    );
  }

  @Post('etapas')
  async criarEtapa(
    @Param('moduloId') moduloId: string,
    @Body() body: CreateEtapaDto,
  ) {
    if (!body.nome?.trim() || !body.tipo || !body.macroetapaId) {
      throw new BadRequestException(
        'nome, tipo e macroetapaId são obrigatórios',
      );
    }
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.criarEtapa(moduloId, empresaId, body);
  }

  @Patch('etapas/:etapaId')
  async atualizarEtapa(
    @Param('moduloId') moduloId: string,
    @Param('etapaId') etapaId: string,
    @Body() body: UpdateEtapaDto,
  ) {
    const { empresaId } = this.tenantContext.get();
    return this.fluxoService.atualizarEtapa(moduloId, empresaId, etapaId, body);
  }

  @Delete('etapas/:etapaId')
  async excluirEtapa(
    @Param('moduloId') moduloId: string,
    @Param('etapaId') etapaId: string,
  ) {
    const { empresaId } = this.tenantContext.get();
    await this.fluxoService.excluirEtapa(moduloId, empresaId, etapaId);
  }

  @Post('publicar')
  async publicar(@Param('moduloId') moduloId: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const fluxo = await this.fluxoService.publicar(moduloId, empresaId);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'fluxo_publicado',
      dadosDepois: {
        fluxoId: fluxo.id,
        moduloId,
        versao: fluxo.versao,
      },
    });
    return fluxo;
  }
}
