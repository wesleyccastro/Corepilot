import type { ExecutorEtapa, TipoEtapa } from '@prisma/client';

export interface CreateEtapaDto {
  nome: string;
  tipo: TipoEtapa;
  macroetapaId: string;
  executor?: ExecutorEtapa;
}
