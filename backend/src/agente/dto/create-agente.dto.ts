export interface CreateAgenteDto {
  nome: string;
  funcao: string;
  objetivo: string;
  guardrails?: string;
  regraEscalonamento?: string;
  modeloIA?: string;
}
