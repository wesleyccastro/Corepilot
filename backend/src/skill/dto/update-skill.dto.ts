import type { CampoSaida } from '../schema-builder';

export interface UpdateSkillDto {
  nome?: string;
  objetivo?: string;
  camposSaida?: CampoSaida[];
}
