import {
  BadRequestException,
  Body,
  Controller,
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
import {
  FonteDeDadosService,
  type ConfiguracaoFonteDeDados,
} from './fonte-de-dados.service';
import type { CreateFonteDeDadosDto } from './dto/create-fonte-de-dados.dto';
import type { UpdateFonteDeDadosDto } from './dto/update-fonte-de-dados.dto';

function sanitizar<T extends { configuracao: unknown }>(fonte: T) {
  const configuracao = fonte.configuracao as ConfiguracaoFonteDeDados;
  return {
    ...fonte,
    configuracao: {
      serverUrl: configuracao.serverUrl,
      username: configuracao.username,
      codSistema: configuracao.codSistema,
      codColigada: configuracao.codColigada,
    },
  };
}

@Controller('fontes-de-dados')
@UseGuards(JwtAuthGuard, TenantGuard)
export class FonteDeDadosController {
  constructor(
    private readonly fonteDeDadosService: FonteDeDadosService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Post()
  async criar(@Body() body: CreateFonteDeDadosDto) {
    if (
      !body.tipo?.trim() ||
      !body.nome?.trim() ||
      !body.serverUrl?.trim() ||
      !body.username?.trim() ||
      !body.senha?.trim() ||
      !body.codSistema?.trim() ||
      !body.codColigada?.trim()
    ) {
      throw new BadRequestException(
        'tipo, nome, serverUrl, username, senha, codSistema e codColigada são obrigatórios',
      );
    }

    const { empresaId } = this.tenantContext.get();
    const fonte = await this.fonteDeDadosService.create(empresaId, body);
    return sanitizar(fonte);
  }

  @Get()
  async listar() {
    const { empresaId } = this.tenantContext.get();
    const fontes = await this.fonteDeDadosService.findAllByEmpresa(empresaId);
    return fontes.map(sanitizar);
  }

  @Patch(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() body: UpdateFonteDeDadosDto,
  ) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const resultado = await this.fonteDeDadosService.update(
      id,
      empresaId,
      body,
    );

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'fonte_de_dados_atualizada',
      dadosDepois: {
        nome: body.nome,
        serverUrl: body.serverUrl,
        username: body.username,
        codSistema: body.codSistema,
        codColigada: body.codColigada,
        senhaAlterada: !!body.senha,
      },
    });

    return sanitizar(resultado);
  }
}
