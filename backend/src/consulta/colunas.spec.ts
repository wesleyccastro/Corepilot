import { mesclarColunas } from './colunas';

describe('mesclarColunas', () => {
  it('cria colunas novas sem descrição quando não há colunas existentes', () => {
    expect(mesclarColunas(null, ['CODPRODUTO', 'QUANTIDADE'])).toEqual([
      { nomeTecnico: 'CODPRODUTO', descricao: null },
      { nomeTecnico: 'QUANTIDADE', descricao: null },
    ]);
  });

  it('preserva a descrição de colunas já descritas anteriormente', () => {
    const existentes = [
      { nomeTecnico: 'CODPRODUTO', descricao: 'Código do produto' },
    ];
    expect(mesclarColunas(existentes, ['CODPRODUTO', 'QUANTIDADE'])).toEqual([
      { nomeTecnico: 'CODPRODUTO', descricao: 'Código do produto' },
      { nomeTecnico: 'QUANTIDADE', descricao: null },
    ]);
  });

  it('descarta colunas que não aparecem mais no resultado atual', () => {
    const existentes = [
      { nomeTecnico: 'COLUNA_ANTIGA', descricao: 'Não existe mais' },
    ];
    expect(mesclarColunas(existentes, ['CODPRODUTO'])).toEqual([
      { nomeTecnico: 'CODPRODUTO', descricao: null },
    ]);
  });
});
