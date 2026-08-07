import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateModuloDto } from './dto/create-modulo.dto';
import type { UpdateModuloDto } from './dto/update-modulo.dto';

/** Precisa bater exatamente com o que o usuário digita para confirmar a exclusão. */
export const FRASE_CONFIRMACAO_EXCLUSAO_MODULO = 'Quero Excluir este módulo';

@Injectable()
export class ModuloService {
  constructor(private readonly prisma: PrismaService) {}

  async create(empresaId: string, dto: CreateModuloDto) {
    return this.prisma.modulo.create({
      data: {
        empresaId,
        nome: dto.nome,
        objetivo: dto.objetivo,
        instrucoes: dto.instrucoes,
        descricao: dto.descricao,
        responsavel: dto.responsavel,
        areas: dto.areas,
        icone: dto.icone,
        cor: dto.cor,
      },
    });
  }

  async findAllByEmpresa(empresaId: string, incluirInativos = false) {
    return this.prisma.modulo.findMany({
      where: incluirInativos ? { empresaId } : { empresaId, ativo: true },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(moduloId: string, empresaId: string) {
    const modulo = await this.prisma.modulo.findFirst({
      where: { id: moduloId, empresaId },
    });

    if (!modulo) {
      throw new NotFoundException('Módulo não encontrado');
    }

    return modulo;
  }

  async update(moduloId: string, empresaId: string, dto: UpdateModuloDto) {
    await this.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.modulo.update({
      where: { id: moduloId },
      data: {
        nome: dto.nome,
        objetivo: dto.objetivo,
        instrucoes: dto.instrucoes,
        descricao: dto.descricao,
        responsavel: dto.responsavel,
        areas: dto.areas,
        icone: dto.icone,
        cor: dto.cor,
        ativo: dto.ativo,
      },
    });
  }

  /**
   * Exclusão definitiva. O schema tem `onDelete: Cascade` em toda a árvore
   * que só existe por causa do módulo (conversas, agentes, skills,
   * consultas, fluxo/orquestrador) — um único `delete` no Modulo já
   * remove tudo isso no banco.
   */
  async remover(moduloId: string, empresaId: string) {
    const modulo = await this.findByIdInEmpresa(moduloId, empresaId);
    await this.prisma.modulo.delete({ where: { id: moduloId } });
    return modulo;
  }
}
