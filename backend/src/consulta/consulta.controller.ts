import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { ConsultaService } from './consulta.service';
import type { CreateConsultaDto } from './dto/create-consulta.dto';

interface AtualizarSincronizacaoDto {
  ativa: boolean;
  intervaloMinutos?: number;
}

@Controller()
@UseGuards(JwtAuthGuard, TenantGuard)
export class ConsultaController {
  constructor(
    private readonly consultaService: ConsultaService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post('modulos/:moduloId/consultas')
  async criar(@Param('moduloId') moduloId: string, @Body() body: CreateConsultaDto) {
    if (!body.nome?.trim() || !body.codSentenca?.trim() || !body.fonteDeDadosId?.trim()) {
      throw new BadRequestException('nome, codSentenca e fonteDeDadosId são obrigatórios');
    }

    const { empresaId } = this.tenantContext.get();
    return this.consultaService.create(moduloId, empresaId, {
      ...body,
      parametrosSincronizacao: body.parametrosSincronizacao ?? {},
      camposFiltro: body.camposFiltro ?? [],
    });
  }

  @Get('modulos/:moduloId/consultas')
  async listar(@Param('moduloId') moduloId: string) {
    const { empresaId } = this.tenantContext.get();
    return this.consultaService.findAllByModulo(moduloId, empresaId);
  }

  @Patch('consultas/:consultaId/sincronizacao')
  async atualizarSincronizacao(
    @Param('consultaId') consultaId: string,
    @Body() body: AtualizarSincronizacaoDto,
  ) {
    const { empresaId } = this.tenantContext.get();
    return this.consultaService.atualizarSincronizacao(
      consultaId,
      empresaId,
      body.ativa,
      body.intervaloMinutos,
    );
  }
}
