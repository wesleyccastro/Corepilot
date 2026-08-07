import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type RequestComJwt } from '../auth/jwt-auth.guard';
import { AuditService } from '../audit/audit.service';
import { CadastroEmpresaService } from './cadastro-empresa.service';
import type { CriarEmpresaDto } from './dto/criar-empresa.dto';

/**
 * Único endpoint da aplicação que cria `Usuario` + `UsuarioEmpresa` — fica
 * atrás só do JwtAuthGuard (prova que existe um Supabase Auth user real),
 * nunca do TenantGuard (que exigiria já ter empresa, impossível aqui).
 */
@Controller('cadastro-empresa')
@UseGuards(JwtAuthGuard)
export class CadastroEmpresaController {
  constructor(
    private readonly cadastroEmpresaService: CadastroEmpresaService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  async criar(@Req() request: RequestComJwt, @Body() body: CriarEmpresaDto) {
    const resultado = await this.cadastroEmpresaService.criarParaUsuarioLogado(
      request.jwtPayload!,
      body,
    );

    await this.audit.record({
      empresaId: resultado.empresa.id,
      atorUsuarioId: resultado.usuario.id,
      acao: 'empresa_criada_via_cadastro',
      dadosDepois: { empresaId: resultado.empresa.id },
    });

    return resultado;
  }
}
