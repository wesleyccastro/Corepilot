import { ConfigService } from '@nestjs/config';
import { ConsultaSincronizacaoService } from './consulta-sincronizacao.service';
import { criptografar } from '../fonte-de-dados/crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { TotvsRmAdapterService } from '../totvs-rm/totvs-rm-adapter.service';

describe('ConsultaSincronizacaoService', () => {
  const CHAVE = 'a'.repeat(64);

  function buildDeps() {
    const prisma = {
      consultaParametrizada: { update: jest.fn() },
      consultaResultado: { deleteMany: jest.fn(), createMany: jest.fn() },
      fonteDeDados: { update: jest.fn() },
    } as unknown as PrismaService;
    const config = { getOrThrow: jest.fn().mockReturnValue(CHAVE) } as unknown as ConfigService;
    const totvsRmAdapter = { realizarConsultaSQL: jest.fn() } as unknown as TotvsRmAdapterService;
    return { prisma, config, totvsRmAdapter };
  }

  function buildConsulta() {
    return {
      id: 'consulta-1',
      fonteDeDadosId: 'fonte-1',
      codSentenca: 'SALDOESTOQUEINSU',
      parametrosSincronizacao: { CODFILIAL: '001' },
      colunas: null,
      fonteDeDados: {
        configuracao: {
          serverUrl: 'http://servidor:8051',
          username: 'admin',
          senhaCriptografada: criptografar('segredo', CHAVE),
          codSistema: 'T',
          codColigada: '1',
        },
      },
    };
  }

  it('sincroniza com sucesso: descobre colunas, substitui resultados, atualiza status', async () => {
    const { prisma, config, totvsRmAdapter } = buildDeps();
    const consulta = buildConsulta();
    (totvsRmAdapter.realizarConsultaSQL as jest.Mock).mockResolvedValue([
      { CODPRODUTO: '1', QUANTIDADE: '10' },
    ]);
    const service = new ConsultaSincronizacaoService(prisma, config, totvsRmAdapter);

    const resultado = await service.executarSincronizacao(consulta);

    expect(totvsRmAdapter.realizarConsultaSQL).toHaveBeenCalledWith(
      expect.objectContaining({ serverUrl: 'http://servidor:8051', senha: 'segredo' }),
      'SALDOESTOQUEINSU',
      { CODFILIAL: '001' },
    );
    expect(prisma.consultaResultado.deleteMany).toHaveBeenCalledWith({
      where: { consultaParametrizadaId: 'consulta-1' },
    });
    expect(prisma.consultaResultado.createMany).toHaveBeenCalledWith({
      data: [{ consultaParametrizadaId: 'consulta-1', dados: { CODPRODUTO: '1', QUANTIDADE: '10' } }],
    });
    expect(prisma.consultaParametrizada.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'consulta-1' },
        data: expect.objectContaining({ testada: true }),
      }),
    );
    expect(resultado).toEqual({
      sucesso: true,
      linhasLidas: 1,
      colunas: [
        { nomeTecnico: 'CODPRODUTO', descricao: null },
        { nomeTecnico: 'QUANTIDADE', descricao: null },
      ],
      amostra: [{ CODPRODUTO: '1', QUANTIDADE: '10' }],
    });
  });

  it('registra falha sem tocar em ConsultaResultado quando o RM retorna erro', async () => {
    const { prisma, config, totvsRmAdapter } = buildDeps();
    const consulta = buildConsulta();
    (totvsRmAdapter.realizarConsultaSQL as jest.Mock).mockRejectedValue(
      new Error('Coligada inválida'),
    );
    const service = new ConsultaSincronizacaoService(prisma, config, totvsRmAdapter);

    const resultado = await service.executarSincronizacao(consulta);

    expect(prisma.consultaResultado.deleteMany).not.toHaveBeenCalled();
    expect(prisma.fonteDeDados.update).toHaveBeenCalledWith({
      where: { id: 'fonte-1' },
      data: {
        ultimoTesteEm: expect.any(Date),
        ultimoTesteSucesso: false,
        ultimaMensagemErro: 'Coligada inválida',
      },
    });
    expect(resultado).toEqual({ sucesso: false, erro: 'Coligada inválida' });
  });
});
