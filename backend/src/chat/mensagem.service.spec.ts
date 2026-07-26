import { MensagemService } from './mensagem.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('MensagemService', () => {
  function buildPrismaMock() {
    return {
      mensagem: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
  }

  it('lista mensagens de uma conversa em ordem cronológica', async () => {
    const prisma = buildPrismaMock();
    (prisma.mensagem.findMany as jest.Mock).mockResolvedValue([]);
    const service = new MensagemService(prisma);

    await service.listByConversa('conversa-1');

    expect(prisma.mensagem.findMany).toHaveBeenCalledWith({
      where: { conversaId: 'conversa-1' },
      orderBy: { criadoEm: 'asc' },
    });
  });

  it('appendUserMessage grava com papel usuario', async () => {
    const prisma = buildPrismaMock();
    (prisma.mensagem.create as jest.Mock).mockResolvedValue({ id: 'mensagem-1' });
    const service = new MensagemService(prisma);

    await service.appendUserMessage('conversa-1', 'Olá');

    expect(prisma.mensagem.create).toHaveBeenCalledWith({
      data: { conversaId: 'conversa-1', papel: 'usuario', conteudo: 'Olá' },
    });
  });

  it('appendAgentMessage grava com papel agente e os tokens informados', async () => {
    const prisma = buildPrismaMock();
    (prisma.mensagem.create as jest.Mock).mockResolvedValue({ id: 'mensagem-2' });
    const service = new MensagemService(prisma);

    await service.appendAgentMessage('conversa-1', 'Oi, tudo bem?', 10, 20);

    expect(prisma.mensagem.create).toHaveBeenCalledWith({
      data: {
        conversaId: 'conversa-1',
        papel: 'agente',
        conteudo: 'Oi, tudo bem?',
        tokensEntrada: 10,
        tokensSaida: 20,
      },
    });
  });
});
