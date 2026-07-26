import type { CampoSaida } from '../agentes/types';

export interface ColunaDescrita {
  nomeTecnico: string;
  descricao: string | null;
}

export interface Consulta {
  id: string;
  moduloId: string;
  fonteDeDadosId: string;
  nome: string;
  codSentenca: string;
  parametrosSincronizacao: Record<string, string>;
  camposFiltro: CampoSaida[];
  colunas: ColunaDescrita[] | null;
  testada: boolean;
  sincronizacaoAtiva: boolean;
  intervaloSincronizacaoMinutos: number | null;
  ultimaSincronizacaoEm: string | null;
  ultimoResultadoSincronizacao: { sucesso: boolean; linhasLidas?: number; erro?: string } | null;
  criadoEm: string;
}

export interface ResultadoTeste {
  sucesso: boolean;
  linhasLidas?: number;
  colunas?: ColunaDescrita[];
  amostra?: Record<string, unknown>[];
  erro?: string;
}
