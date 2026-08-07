import { construirInputSchemaFerramenta } from './tool-schema-builder';

describe('construirInputSchemaFerramenta', () => {
  it('constrói um JSON Schema com properties e required a partir dos campos', () => {
    const schema = construirInputSchemaFerramenta([
      {
        nome: 'codProduto',
        tipo: 'string',
        descricao: 'Código do produto',
        obrigatorio: true,
      },
      { nome: 'quantidadeMinima', tipo: 'number', obrigatorio: false },
    ]);

    expect(schema).toEqual({
      type: 'object',
      properties: {
        codProduto: { type: 'string', description: 'Código do produto' },
        quantidadeMinima: { type: 'number' },
      },
      required: ['codProduto'],
    });
  });

  it('retorna required vazio quando nenhum campo é obrigatório', () => {
    const schema = construirInputSchemaFerramenta([
      { nome: 'filtro', tipo: 'string', obrigatorio: false },
    ]);

    expect(schema.required).toEqual([]);
  });

  it('lida com lista vazia de campos', () => {
    const schema = construirInputSchemaFerramenta([]);
    expect(schema).toEqual({ type: 'object', properties: {}, required: [] });
  });
});
