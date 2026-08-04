import { apiFetch } from '../api/apiFetch';
import type { Agente, CampoSaida, Skill, SkillExecucao } from './types';

export interface CriarAgenteDto {
  nome: string;
  funcao: string;
  objetivo: string;
  modeloIA?: string;
}

export async function listarAgentes(accessToken: string, moduloId: string): Promise<Agente[]> {
  const response = await apiFetch(`/modulos/${moduloId}/agentes`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar agentes (status ${response.status})`);
  return (await response.json()) as Agente[];
}

export async function criarAgente(
  accessToken: string,
  moduloId: string,
  dto: CriarAgenteDto,
): Promise<Agente> {
  const response = await apiFetch(`/modulos/${moduloId}/agentes`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar agente (status ${response.status})`);
  return (await response.json()) as Agente;
}

export interface CriarSkillDto {
  nome: string;
  objetivo: string;
  camposSaida: CampoSaida[];
}

export async function listarSkills(accessToken: string, agenteId: string): Promise<Skill[]> {
  const response = await apiFetch(`/agentes/${agenteId}/skills`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar skills (status ${response.status})`);
  return (await response.json()) as Skill[];
}

export async function criarSkill(
  accessToken: string,
  agenteId: string,
  dto: CriarSkillDto,
): Promise<Skill> {
  const response = await apiFetch(`/agentes/${agenteId}/skills`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar skill (status ${response.status})`);
  return (await response.json()) as Skill;
}

export interface ExecutarSkillResultado {
  execucaoId: string;
  saida: Record<string, unknown>;
  tokensEntrada: number;
  tokensSaida: number;
}

export async function executarSkill(
  accessToken: string,
  skillId: string,
  entrada: string,
): Promise<ExecutarSkillResultado> {
  const response = await apiFetch(`/skills/${skillId}/execucoes`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entrada }),
  });
  if (!response.ok) throw new Error(`Falha ao executar skill (status ${response.status})`);
  return (await response.json()) as ExecutarSkillResultado;
}

export async function listarExecucoes(accessToken: string, skillId: string): Promise<SkillExecucao[]> {
  const response = await apiFetch(`/skills/${skillId}/execucoes`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar execuções (status ${response.status})`);
  return (await response.json()) as SkillExecucao[];
}

export async function anexarFerramenta(
  accessToken: string,
  skillId: string,
  consultaId: string,
): Promise<void> {
  const response = await apiFetch(`/skills/${skillId}/ferramentas/${consultaId}`, accessToken, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(`Falha ao anexar ferramenta (status ${response.status})`);
}

export async function removerFerramenta(
  accessToken: string,
  skillId: string,
  consultaId: string,
): Promise<void> {
  const response = await apiFetch(`/skills/${skillId}/ferramentas/${consultaId}`, accessToken, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error(`Falha ao remover ferramenta (status ${response.status})`);
}

export interface AtualizarAgenteDto {
  nome?: string;
  funcao?: string;
  objetivo?: string;
  guardrails?: string;
  regraEscalonamento?: string;
}

export async function atualizarAgente(
  accessToken: string,
  moduloId: string,
  agenteId: string,
  dto: AtualizarAgenteDto,
): Promise<Agente> {
  const response = await apiFetch(`/modulos/${moduloId}/agentes/${agenteId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar agente (status ${response.status})`);
  return (await response.json()) as Agente;
}

export interface AtualizarSkillDto {
  nome?: string;
  objetivo?: string;
  camposSaida?: CampoSaida[];
}

export async function atualizarSkill(
  accessToken: string,
  agenteId: string,
  skillId: string,
  dto: AtualizarSkillDto,
): Promise<Skill> {
  const response = await apiFetch(`/agentes/${agenteId}/skills/${skillId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar skill (status ${response.status})`);
  return (await response.json()) as Skill;
}
