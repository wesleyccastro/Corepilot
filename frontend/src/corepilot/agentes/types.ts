export interface Agente {
  id: string;
  moduloId: string;
  nome: string;
  funcao: string;
  objetivo: string;
  modeloIA: string;
  criadoEm: string;
}

export type TipoCampoSaida = 'string' | 'number' | 'boolean' | 'string[]';

export interface CampoSaida {
  nome: string;
  tipo: TipoCampoSaida;
  descricao?: string;
  obrigatorio: boolean;
}

export interface Skill {
  id: string;
  agenteId: string;
  nome: string;
  objetivo: string;
  camposSaida: CampoSaida[];
  criadoEm: string;
}

export interface SkillExecucao {
  id: string;
  skillId: string;
  usuarioId: string;
  entrada: string;
  saida: Record<string, unknown>;
  tokensEntrada: number | null;
  tokensSaida: number | null;
  criadoEm: string;
}
