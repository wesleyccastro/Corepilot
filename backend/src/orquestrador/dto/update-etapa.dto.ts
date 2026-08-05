import type { ExecutorEtapa, TipoEtapa } from '@prisma/client';
import type { CustomFieldEtapa } from '../campos';

export interface UpdateEtapaDto {
  nome?: string;
  tipo?: TipoEtapa;
  executor?: ExecutorEtapa;
  macroetapaId?: string;
  prazoDias?: number | null;
  agenteId?: string | null;
  skillId?: string | null;
  autonomia?: string | null;
  aprovadores?: string[];
  loopParaEtapaId?: string | null;
  entradaRefs?: string[];
  camposUsuario?: CustomFieldEtapa[];
}
