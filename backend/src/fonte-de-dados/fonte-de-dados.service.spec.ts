import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { FonteDeDadosService } from './fonte-de-dados.service';
import { descriptografar } from './crypto';
import type { PrismaService } from '../prisma/prisma.service';

describe('FonteDeDadosService', () => {
  const CHAVE = 'a'.repeat(64);

  function buildDeps() {
    const prisma = {
      fonteDeDados: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    } as unknown as PrismaService;
    const config = {
      getOrThrow: jest.fn().mockReturnValue(CHAVE),
    } as unknown as ConfigService;
    return { prisma, config };
  }

  const dto = {
    tipo: 'totvs_rm',
    nome: 'RM Produção',
    serverUrl: 'http://177.129.242.252:8051',
    username: 'admin',
    senha: 'segredo123',
    codSistema: 'T',
    codColigada: '1',
  };

  it('cria uma fonte de dados com a senha criptografada, nunca em texto plano', async () => {
    const { prisma, config } = buildDeps();
    (prisma.fonteDeDados.create as jest.Mock).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'fonte-1', ...data }),
    );
    const service = new FonteDeDadosService(prisma, config);

    const resultado = await service.create('empresa-1', dto);

    const configuracaoSalva = resultado.configuracao as { senhaCriptografada: string };
    expect(configuracaoSalva.senhaCriptografada).not.toBe('segredo123');
    expect(descriptografar(configuracaoSalva.senhaCriptografada, CHAVE)).toBe('segredo123');
  });

  it('lista fontes de dados só da empresa informada', async () => {
    const { prisma, config } = buildDeps();
    (prisma.fonteDeDados.findMany as jest.Mock).mockResolvedValue([]);
    const service = new FonteDeDadosService(prisma, config);

    await service.findAllByEmpresa('empresa-1');

    expect(prisma.fonteDeDados.findMany).toHaveBeenCalledWith({
      where: { empresaId: 'empresa-1' },
      orderBy: { criadoEm: 'desc' },
    });
  });

  it('findByIdInEmpresa lança NotFoundException se não encontrar', async () => {
    const { prisma, config } = buildDeps();
    (prisma.fonteDeDados.findFirst as jest.Mock).mockResolvedValue(null);
    const service = new FonteDeDadosService(prisma, config);

    await expect(service.findByIdInEmpresa('fonte-x', 'empresa-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
