export function chaveIdempotencia(instanciaId: string, etapaId: string, numeroDaExecucao: number): string {
  return `${instanciaId}:${etapaId}:${numeroDaExecucao}`;
}
