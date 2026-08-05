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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { FluxoService } from './fluxo.service';
import type { CreateMacroetapaDto } from './dto/create-macroetapa.dto';
import type { UpdateMacroetapaDto } from './dto/update-macroetapa.dto';

@Controller('modulos/:moduloId/fluxo')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FluxoController {
  constructor(
    private readonly fluxoService: FluxoService,
    private readonly tenantContext: TenantContext,
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
}
