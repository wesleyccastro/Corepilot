import {
  Body,
  Controller,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { TenantContext } from '../auth/tenant-context';
import { AuditService } from '../audit/audit.service';
import { EmpresaService } from './empresa.service';
import type { UpdateEmpresaDto } from './dto/update-empresa.dto';

const LIMITE_MULTER_BYTES = 5 * 1024 * 1024;

@Controller('empresa')
@UseGuards(JwtAuthGuard, TenantGuard)
export class EmpresaController {
  constructor(
    private readonly empresaService: EmpresaService,
    private readonly audit: AuditService,
    private readonly tenantContext: TenantContext,
  ) {}

  @Patch()
  async atualizar(@Body() body: UpdateEmpresaDto) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const empresa = await this.empresaService.atualizarDados(empresaId, body);

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'empresa_atualizada',
      dadosDepois: { nome: body.nome, razaoSocial: body.razaoSocial },
    });

    return empresa;
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('logo', { limits: { fileSize: LIMITE_MULTER_BYTES } }),
  )
  async atualizarLogo(@UploadedFile() arquivo?: Express.Multer.File) {
    const { usuarioId, empresaId } = this.tenantContext.get();
    const empresa = await this.empresaService.atualizarLogo(empresaId, arquivo);

    await this.audit.record({
      empresaId,
      atorUsuarioId: usuarioId,
      acao: 'empresa_logo_atualizado',
      dadosDepois: {
        contentType: arquivo?.mimetype ?? null,
        tamanhoBytes: arquivo?.size ?? null,
      },
    });

    return empresa;
  }
}
