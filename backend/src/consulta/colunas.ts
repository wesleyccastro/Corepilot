export interface ColunaDescrita {
  nomeTecnico: string;
  descricao: string | null;
}

export function mesclarColunas(
  existentes: ColunaDescrita[] | null,
  nomesTecnicos: string[],
): ColunaDescrita[] {
  const descricoesPorNome = new Map(
    (existentes ?? []).map((c) => [c.nomeTecnico, c.descricao]),
  );

  return nomesTecnicos.map((nomeTecnico) => ({
    nomeTecnico,
    descricao: descricoesPorNome.get(nomeTecnico) ?? null,
  }));
}
