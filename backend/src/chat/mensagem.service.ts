import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MensagemService {
  constructor(private readonly prisma: PrismaService) {}

  async listByConversa(conversaId: string) {
    return this.prisma.mensagem.findMany({
      where: { conversaId },
      orderBy: { criadoEm: 'asc' },
    });
  }

  async appendUserMessage(conversaId: string, conteudo: string) {
    return this.prisma.mensagem.create({
      data: { conversaId, papel: 'usuario', conteudo },
    });
  }

  async appendAgentMessage(
    conversaId: string,
    conteudo: string,
    tokensEntrada: number,
    tokensSaida: number,
  ) {
    return this.prisma.mensagem.create({
      data: { conversaId, papel: 'agente', conteudo, tokensEntrada, tokensSaida },
    });
  }
}
