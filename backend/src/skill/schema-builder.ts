import { z } from 'zod';

export interface CampoSaida {
  nome: string;
  tipo: 'string' | 'number' | 'boolean' | 'string[]';
  descricao?: string;
  obrigatorio: boolean;
}

function tipoBaseParaZod(tipo: CampoSaida['tipo']) {
  switch (tipo) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'string[]':
      return z.array(z.string());
  }
}

export function construirSchemaSaida(campos: CampoSaida[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const campo of campos) {
    let tipoZod: z.ZodTypeAny = tipoBaseParaZod(campo.tipo);

    if (campo.descricao) {
      tipoZod = tipoZod.describe(campo.descricao);
    }
    if (!campo.obrigatorio) {
      tipoZod = tipoZod.optional();
    }

    shape[campo.nome] = tipoZod;
  }

  return z.object(shape);
}
