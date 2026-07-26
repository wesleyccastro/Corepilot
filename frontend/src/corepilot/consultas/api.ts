import { apiFetch } from '../api/apiFetch';
import type { CampoSaida } from '../agentes/types';
import type { Consulta, ResultadoTeste } from './types';

export interface CriarConsultaDto {
  fonteDeDadosId: string;
  nome: string;
  codSentenca: string;
  parametrosSincronizacao: Record<string, string>;
  camposFiltro: CampoSaida[];
}

export async function listarConsultas(accessToken: string, moduloId: string): Promise<Consulta[]> {
  const response = await apiFetch(`/modulos/${moduloId}/consultas`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar consultas (status ${response.status})`);
  return (await response.json()) as Consulta[];
}

export async function criarConsulta(
  accessToken: string,
  moduloId: string,
  dto: CriarConsultaDto,
): Promise<Consulta> {
  const response = await apiFetch(`/modulos/${moduloId}/consultas`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar consulta (status ${response.status})`);
  return (await response.json()) as Consulta;
}

export async function testarConsulta(accessToken: string, consultaId: string): Promise<ResultadoTeste> {
  const response = await apiFetch(`/consultas/${consultaId}/testar`, accessToken, { method: 'POST' });
  if (!response.ok) throw new Error(`Falha ao testar consulta (status ${response.status})`);
  return (await response.json()) as ResultadoTeste;
}

export async function atualizarSincronizacao(
  accessToken: string,
  consultaId: string,
  ativa: boolean,
  intervaloMinutos?: number,
): Promise<Consulta> {
  const response = await apiFetch(`/consultas/${consultaId}/sincronizacao`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ativa, intervaloMinutos }),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar sincronização (status ${response.status})`);
  return (await response.json()) as Consulta;
}
