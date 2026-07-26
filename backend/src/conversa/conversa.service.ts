import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';

@Injectable()
export class ConversaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduloService: ModuloService,
  ) {}

  async create(moduloId: string, usuarioId: string, empresaId: string) {
    await this.moduloService.findByIdInEmpresa(moduloId, empresaId);

    return this.prisma.conversa.create({
      data: { moduloId, usuarioId, empresaId },
    });
  }

  async findAllByModuloAndUsuario(moduloId: string, usuarioId: string) {
    return this.prisma.conversa.findMany({
      where: { moduloId, usuarioId },
      orderBy: { atualizadoEm: 'desc' },
    });
  }

  async findOwned(conversaId: string, usuarioId: string) {
    const conversa = await this.prisma.conversa.findFirst({
      where: { id: conversaId, usuarioId },
      include: { modulo: true },
    });

    if (!conversa) {
      throw new NotFoundException('Conversa não encontrada');
    }

    return conversa;
  }
}
