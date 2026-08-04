import type { PrismaService } from '../prisma/prisma.service';
import {
  buscarDadosLocaisConsulta,
  consultaIdDaFerramenta,
  montarFerramentasDeConsultas,
  nomeFerramentaConsulta,
} from './consulta-ferramenta.util';

describe('consulta-ferramenta.util', () => {
  it('nomeFerramentaConsulta e consultaIdDaFerramenta são inversas', () => {
    const nome = nomeFerramentaConsulta('consulta-1');
    expect(nome).toBe('consulta_consulta-1');
    expect(consultaIdDaFerramenta(nome)).toBe('consulta-1');
  });

  it('monta uma tool por consulta, com input_schema a partir dos camposFiltro', () => {
    const tools = montarFerramentasDeConsultas([
      {
        id: 'consulta-1',
        nome: 'Saldo de estoque',
        camposFiltro: [{ nome: 'codProduto', tipo: 'string', obrigatorio: true }],
      },
    ]);

    expect(tools).toEqual([
      {
        name: 'consulta_consulta-1',
        description: 'Consulta "Saldo de estoque" com dados sincronizados do TOTVS RM.',
        input_schema: {
          type: 'object',
          properties: { codProduto: { type: 'string' } },
          required: ['codProduto'],
        },
      },
    ]);
  });

  it('buscarDadosLocaisConsulta filtra por consultaId e pelos valores informados, nunca chama o RM', async () => {
    const prisma = {
      consultaResultado: {
        findMany: jest.fn().mockResolvedValue([
          { dados: { codProduto: 'X1', saldo: 42 } },
          { dados: { codProduto: 'X2', saldo: 7 } },
        ]),
      },
    } as unknown as PrismaService;

    const resultado = await buscarDadosLocaisConsulta(prisma, 'consulta-1', { codProduto: 'X1' });

    expect(prisma.consultaResultado.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { consultaParametrizadaId: 'consulta-1' } }),
    );
    expect(resultado).toEqual([{ codProduto: 'X1', saldo: 42 }]);
  });

  it('sem filtro, devolve todas as linhas sincronizadas (o modelo é quem interpreta, não um corte arbitrário)', async () => {
    const prisma = {
      consultaResultado: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 50 }, (_, i) => ({ dados: { codProduto: `X${i}` } })),
        ),
      },
    } as unknown as PrismaService;

    const resultado = await buscarDadosLocaisConsulta(prisma, 'consulta-1', {});

    expect(resultado).toHaveLength(50);
  });

  it('o filtro é substring case-insensitive, não igualdade exata — "Fox" bate com "FOXXPRO"', async () => {
    const prisma = {
      consultaResultado: {
        findMany: jest.fn().mockResolvedValue([
          { dados: { NOMEFANTASIA: 'FOXXPRO', TALHAO: 'Pivo 20' } },
          { dados: { NOMEFANTASIA: 'DRIVE', TALHAO: 'Pivo 01' } },
        ]),
      },
    } as unknown as PrismaService;

    const resultado = await buscarDadosLocaisConsulta(prisma, 'consulta-1', { NOMEFANTASIA: 'fox' });

    expect(resultado).toEqual([{ NOMEFANTASIA: 'FOXXPRO', TALHAO: 'Pivo 20' }]);
  });
});
