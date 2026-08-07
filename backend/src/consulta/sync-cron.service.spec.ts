import { SyncCronService } from './sync-cron.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';

describe('SyncCronService', () => {
  function buildDeps() {
    const prisma = {
      consultaParametrizada: { findMany: jest.fn() },
    } as unknown as PrismaService;
    const consultaSincronizacaoService = {
      executarSincronizacao: jest.fn().mockResolvedValue({
        sucesso: true,
        linhasLidas: 0,
        colunas: [],
        amostra: [],
      }),
    } as unknown as ConsultaSincronizacaoService;
    return { prisma, consultaSincronizacaoService };
  }

  it('sincroniza só as consultas ativas e devidas', async () => {
    const { prisma, consultaSincronizacaoService } = buildDeps();
    (prisma.consultaParametrizada.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'devida',
        ultimaSincronizacaoEm: null,
        intervaloSincronizacaoMinutos: 60,
      },
      {
        id: 'nao-devida',
        ultimaSincronizacaoEm: new Date(),
        intervaloSincronizacaoMinutos: 60,
      },
    ]);
    const service = new SyncCronService(prisma, consultaSincronizacaoService);

    await service.verificarConsultasDevidas();

    expect(prisma.consultaParametrizada.findMany).toHaveBeenCalledWith({
      where: { sincronizacaoAtiva: true },
      include: { fonteDeDados: true },
    });
    expect(
      consultaSincronizacaoService.executarSincronizacao,
    ).toHaveBeenCalledTimes(1);
    expect(
      consultaSincronizacaoService.executarSincronizacao,
    ).toHaveBeenCalledWith(expect.objectContaining({ id: 'devida' }));
  });

  it('continua para as próximas consultas mesmo se uma falhar inesperadamente', async () => {
    const { prisma, consultaSincronizacaoService } = buildDeps();
    (prisma.consultaParametrizada.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'quebra',
        ultimaSincronizacaoEm: null,
        intervaloSincronizacaoMinutos: 60,
      },
      {
        id: 'ok',
        ultimaSincronizacaoEm: null,
        intervaloSincronizacaoMinutos: 60,
      },
    ]);
    (consultaSincronizacaoService.executarSincronizacao as jest.Mock)
      .mockRejectedValueOnce(new Error('erro inesperado'))
      .mockResolvedValueOnce({
        sucesso: true,
        linhasLidas: 0,
        colunas: [],
        amostra: [],
      });
    const service = new SyncCronService(prisma, consultaSincronizacaoService);

    await service.verificarConsultasDevidas();

    expect(
      consultaSincronizacaoService.executarSincronizacao,
    ).toHaveBeenCalledTimes(2);
  });
});
