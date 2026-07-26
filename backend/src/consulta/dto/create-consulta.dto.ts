import type { CampoSaida } from '../../skill/schema-builder';

export interface CreateConsultaDto {
  fonteDeDadosId: string;
  nome: string;
  codSentenca: string;
  parametrosSincronizacao: Record<string, string>;
  camposFiltro: CampoSaida[];
}
