import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmpresaService, type EmpresaResumo } from '../empresa/empresa.service';
import type { SupabaseJwtPayload } from '../auth/jwt-verifier';
import type { CriarEmpresaDto } from './dto/criar-empresa.dto';
import { normalizarCnpjCpf, validarCnpjCpf } from './validar-documento';

const CAMPOS_OBRIGATORIOS: (keyof CriarEmpresaDto)[] = [
  'nome',
  'razaoSocial',
  'cnpjCpf',
  'segmento',
  'uf',
  'cidade',
  'whatsapp',
];

export interface CadastroEmpresaResultado {
  usuario: { id: string; nome: string; email: string };
  empresa: EmpresaResumo;
  perfil: 'admin';
}

@Injectable()
export class CadastroEmpresaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly empresaService: EmpresaService,
  ) {}

  async criarParaUsuarioLogado(
    jwtPayload: SupabaseJwtPayload,
    dto: CriarEmpresaDto,
  ): Promise<CadastroEmpresaResultado> {
    if (!jwtPayload.email) {
      throw new BadRequestException('Token sem e-mail associado');
    }

    for (const campo of CAMPOS_OBRIGATORIOS) {
      if (!dto[campo]?.trim()) {
        throw new BadRequestException(`Campo obrigatório ausente: ${campo}`);
      }
    }

    if (!validarCnpjCpf(dto.cnpjCpf)) {
      throw new BadRequestException('CNPJ/CPF inválido');
    }

    const cnpjCpf = normalizarCnpjCpf(dto.cnpjCpf);

    const usuarioExistente = await this.prisma.usuario.findUnique({
      where: { supabaseUserId: jwtPayload.sub },
    });
    if (usuarioExistente) {
      throw new ConflictException('Esta conta já está associada a uma empresa');
    }

    const empresaExistente = await this.prisma.empresa.findUnique({
      where: { cnpjCpf },
    });
    if (empresaExistente) {
      throw new ConflictException('CNPJ/CPF já cadastrado');
    }

    try {
      const { usuario, empresa } = await this.prisma.$transaction(
        async (tx) => {
          const empresa = await tx.empresa.create({
            data: {
              nome: dto.razaoSocial.trim(),
              razaoSocial: dto.razaoSocial.trim(),
              cnpjCpf,
              segmento: dto.segmento.trim(),
              uf: dto.uf.trim(),
              cidade: dto.cidade.trim(),
              whatsapp: dto.whatsapp.trim(),
            },
          });

          const usuario = await tx.usuario.create({
            data: {
              supabaseUserId: jwtPayload.sub,
              nome: dto.nome.trim(),
              email: jwtPayload.email!,
            },
          });

          await tx.usuarioEmpresa.create({
            data: {
              usuarioId: usuario.id,
              empresaId: empresa.id,
              perfil: 'admin',
            },
          });

          return { usuario, empresa };
        },
      );

      return {
        usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
        empresa: this.empresaService.toEmpresaResumo(empresa),
        perfil: 'admin',
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('CNPJ/CPF ou conta já cadastrados');
      }
      throw error;
    }
  }
}
