import type { CampoSaida } from '../schema-builder';

export interface CreateSkillDto {
  nome: string;
  objetivo: string;
  camposSaida: CampoSaida[];
}
