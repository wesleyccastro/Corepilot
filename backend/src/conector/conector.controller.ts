import {
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { ConectorService } from './conector.service';

@Controller('conectores')
export class ConectorController {
  private readonly logger = new Logger(ConectorController.name);

  constructor(
    private readonly conectorService: ConectorService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, TenantGuard)
  async listar() {
    const { usuarioId, empresaId } = this.tenantContext.get();
    return this.conectorService.listar(usuarioId, empresaId);
  }

  @Get(':provider/iniciar')
  @UseGuards(JwtAuthGuard, TenantGuard)
  iniciar(@Param('provider') provider: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    return {
      url: this.conectorService.iniciar(provider, usuarioId, empresaId),
    };
  }

  // Sem guard de propósito: o navegador do usuário chega aqui direto do
  // redirect do provider OAuth, sem o header Authorization da API. A
  // verificação de identidade acontece via o "state" assinado (ver
  // ConectorService.processarCallback / estado-oauth.ts).
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    const frontendOrigin =
      this.config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173';
    try {
      const { usuarioId, empresaId } =
        await this.conectorService.processarCallback(provider, code, state);
      await this.audit.record({
        empresaId,
        atorUsuarioId: usuarioId,
        acao: 'conector_conectado',
        dadosDepois: { provider },
      });
      res.redirect(`${frontendOrigin}/?conectores=sucesso`);
    } catch (erro) {
      this.logger.warn(
        `Callback do provider "${provider}" falhou: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
      res.redirect(`${frontendOrigin}/?conectores=erro`);
    }
  }

  @Delete(':provider')
  @UseGuards(JwtAuthGuard, TenantGuard)
  async desconectar(@Param('provider') provider: string) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    await this.conectorService.desconectar(provider, usuarioId, empresaId);
    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'conector_desconectado',
      dadosDepois: { provider },
    });
    return { ok: true };
  }
}
