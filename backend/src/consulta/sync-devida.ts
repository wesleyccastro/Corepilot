export function estaDevida(
  ultimaSincronizacaoEm: Date | null,
  intervaloMinutos: number | null,
): boolean {
  if (!ultimaSincronizacaoEm) return true;
  if (!intervaloMinutos) return false;

  const proximaExecucao = new Date(
    ultimaSincronizacaoEm.getTime() + intervaloMinutos * 60_000,
  );
  return new Date() >= proximaExecucao;
}
