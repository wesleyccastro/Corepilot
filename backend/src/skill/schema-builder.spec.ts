import { construirSchemaSaida } from './schema-builder';

describe('construirSchemaSaida', () => {
  it('constrói um schema que aceita todos os tipos suportados', () => {
    const schema = construirSchemaSaida([
      { nome: 'titulo', tipo: 'string', obrigatorio: true },
      { nome: 'prioridade', tipo: 'number', obrigatorio: true },
      { nome: 'urgente', tipo: 'boolean', obrigatorio: true },
      { nome: 'tags', tipo: 'string[]', obrigatorio: true },
    ]);

    const resultado = schema.safeParse({
      titulo: 'Pedido de compra',
      prioridade: 2,
      urgente: false,
      tags: ['ferramentas', 'urgente'],
    });

    expect(resultado.success).toBe(true);
  });

  it('rejeita quando falta um campo obrigatório', () => {
    const schema = construirSchemaSaida([
      { nome: 'titulo', tipo: 'string', obrigatorio: true },
    ]);

    const resultado = schema.safeParse({});

    expect(resultado.success).toBe(false);
  });

  it('aceita omitir um campo marcado como não obrigatório', () => {
    const schema = construirSchemaSaida([
      { nome: 'titulo', tipo: 'string', obrigatorio: true },
      { nome: 'observacao', tipo: 'string', obrigatorio: false },
    ]);

    const resultado = schema.safeParse({ titulo: 'Pedido de compra' });

    expect(resultado.success).toBe(true);
  });

  it('rejeita um tipo incompatível com o campo declarado', () => {
    const schema = construirSchemaSaida([
      { nome: 'prioridade', tipo: 'number', obrigatorio: true },
    ]);

    const resultado = schema.safeParse({ prioridade: 'alta' });

    expect(resultado.success).toBe(false);
  });
});
