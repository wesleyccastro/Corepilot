import type { CampoSaida } from '../skill/schema-builder';

function tipoJsonSchema(tipo: CampoSaida['tipo']) {
  switch (tipo) {
    case 'string':
      return { type: 'string' as const };
    case 'number':
      return { type: 'number' as const };
    case 'boolean':
      return { type: 'boolean' as const };
    case 'string[]':
      return { type: 'array' as const, items: { type: 'string' as const } };
  }
}

export function construirInputSchemaFerramenta(campos: CampoSaida[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const campo of campos) {
    const propriedade = tipoJsonSchema(campo.tipo);
    properties[campo.nome] = campo.descricao
      ? { ...propriedade, description: campo.descricao }
      : propriedade;
    if (campo.obrigatorio) required.push(campo.nome);
  }

  return { type: 'object' as const, properties, required };
}
