import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateEmpresaDto } from './dto/update-empresa.dto';

const TIPOS_LOGO_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const TAMANHO_MAXIMO_LOGO_BYTES = 2 * 1024 * 1024;

export interface EmpresaResumo {
  id: string;
  nome: string;
  razaoSocial: string | null;
  logoDataUrl: string | null;
}

@Injectable()
export class EmpresaService {
  constructor(private readonly prisma: PrismaService) {}

  toEmpresaResumo(empresa: {
    id: string;
    nome: string;
    razaoSocial: string | null;
    logoData: Uint8Array | null;
    logoContentType: string | null;
  }): EmpresaResumo {
    return {
      id: empresa.id,
      nome: empresa.nome,
      razaoSocial: empresa.razaoSocial,
      logoDataUrl:
        empresa.logoData && empresa.logoContentType
          ? `data:${empresa.logoContentType};base64,${Buffer.from(empresa.logoData).toString('base64')}`
          : null,
    };
  }

  async atualizarDados(
    empresaId: string,
    dto: UpdateEmpresaDto,
  ): Promise<EmpresaResumo> {
    if (dto.nome !== undefined && !dto.nome.trim()) {
      throw new BadRequestException('nome não pode ser vazio');
    }

    const empresa = await this.prisma.empresa.update({
      where: { id: empresaId },
      data: {
        nome: dto.nome?.trim(),
        razaoSocial: dto.razaoSocial === undefined ? undefined : (dto.razaoSocial?.trim() || null),
      },
    });

    return this.toEmpresaResumo(empresa);
  }

  async atualizarLogo(
    empresaId: string,
    arquivo: Express.Multer.File | undefined,
  ): Promise<EmpresaResumo> {
    if (!arquivo) {
      throw new BadRequestException('Nenhum arquivo enviado');
    }
    if (!TIPOS_LOGO_PERMITIDOS.includes(arquivo.mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo não suportado: ${arquivo.mimetype}. Use PNG, JPEG, WebP ou SVG.`,
      );
    }
    if (arquivo.size > TAMANHO_MAXIMO_LOGO_BYTES) {
      throw new BadRequestException('Arquivo excede o tamanho máximo de 2MB');
    }

    const empresa = await this.prisma.empresa.update({
      where: { id: empresaId },
      data: {
        logoData: new Uint8Array(arquivo.buffer),
        logoContentType: arquivo.mimetype,
      },
    });

    return this.toEmpresaResumo(empresa);
  }
}
