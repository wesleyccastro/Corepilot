import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModuloService } from '../modulo/modulo.service';

export interface AtualizarConversaDto {
  titulo?: string;
  arquivada?: boolean;
  fixada?: boolean;
  tagId?: string | null;
}

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

  async update(conversaId: string, usuarioId: string, dto: AtualizarConversaDto) {
    await this.findOwned(conversaId, usuarioId);

    return this.prisma.conversa.update({
      where: { id: conversaId },
      data: {
        titulo: dto.titulo,
        arquivada: dto.arquivada,
        fixada: dto.fixada,
        tagId: dto.tagId,
      },
    });
  }

  async remove(conversaId: string, usuarioId: string) {
    await this.findOwned(conversaId, usuarioId);

    await this.prisma.mensagem.deleteMany({ where: { conversaId } });
    await this.prisma.conversa.delete({ where: { id: conversaId } });
  }
}
