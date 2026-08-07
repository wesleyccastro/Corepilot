import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';

@Injectable()
export class ConversaTagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
  ) {}

  async create(moduloId: string, empresaId: string, nome: string) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.conversaTag.create({
      data: { moduloId, empresaId, nome },
    });
  }

  async findAllByModulo(moduloId: string, empresaId: string) {
    return this.prisma.conversaTag.findMany({
      where: { moduloId, empresaId },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async remove(tagId: string, empresaId: string) {
    const tag = await this.prisma.conversaTag.findFirst({
      where: { id: tagId, empresaId },
    });

    if (!tag) {
      throw new NotFoundException('Tag não encontrada');
    }

    await this.prisma.conversaTag.delete({ where: { id: tagId } });
  }
}
