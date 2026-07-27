import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateModuloDto } from './dto/create-modulo.dto';

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

  async findAllByEmpresa(empresaId: string) {
    return this.prisma.modulo.findMany({
      where: { empresaId },
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
}
