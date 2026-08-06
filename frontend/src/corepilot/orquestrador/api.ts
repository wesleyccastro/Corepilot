import { apiFetch } from '../api/apiFetch';
import type {
  AcaoEtapa, CustomFieldEtapa, Etapa, ExecutorEtapa, Fluxo, InstanciaDeProcesso,
  InstanciaDetalhe, IntegracaoWhatsApp, Macroetapa, TipoEtapa,
} from './types';

export async function obterFluxo(accessToken: string, moduloId: string): Promise<Fluxo> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo`, accessToken);
  if (!response.ok) throw new Error(`Falha ao carregar o fluxo (status ${response.status})`);
  return (await response.json()) as Fluxo;
}

export async function criarMacroetapa(accessToken: string, moduloId: string, nome: string): Promise<Macroetapa> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/macroetapas`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  });
  if (!response.ok) throw new Error(`Falha ao criar coluna (status ${response.status})`);
  return (await response.json()) as Macroetapa;
}

export async function atualizarMacroetapa(accessToken: string, moduloId: string, macroetapaId: string, nome: string): Promise<Macroetapa> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/macroetapas/${macroetapaId}`, accessToken, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome }),
  });
  if (!response.ok) throw new Error(`Falha ao renomear coluna (status ${response.status})`);
  return (await response.json()) as Macroetapa;
}

export async function excluirMacroetapa(accessToken: string, moduloId: string, macroetapaId: string): Promise<void> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/macroetapas/${macroetapaId}`, accessToken, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Falha ao excluir coluna (status ${response.status})`);
}

export interface CriarEtapaDto {
  nome: string;
  tipo: TipoEtapa;
  macroetapaId: string;
  executor?: ExecutorEtapa;
}

export async function criarEtapa(accessToken: string, moduloId: string, dto: CriarEtapaDto): Promise<Etapa> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/etapas`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar etapa (status ${response.status})`);
  return (await response.json()) as Etapa;
}

export interface AtualizarEtapaDto {
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

export async function atualizarEtapa(accessToken: string, moduloId: string, etapaId: string, dto: AtualizarEtapaDto): Promise<Etapa> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/etapas/${etapaId}`, accessToken, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar etapa (status ${response.status})`);
  return (await response.json()) as Etapa;
}

export async function excluirEtapa(accessToken: string, moduloId: string, etapaId: string): Promise<void> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/etapas/${etapaId}`, accessToken, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Falha ao excluir etapa (status ${response.status})`);
}

export async function publicarFluxo(accessToken: string, moduloId: string): Promise<Fluxo> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/publicar`, accessToken, { method: 'POST' });
  if (!response.ok) throw new Error(`Falha ao publicar o fluxo (status ${response.status})`);
  return (await response.json()) as Fluxo;
}

export async function criarInstancia(accessToken: string, moduloId: string, dadosIniciais: Record<string, unknown>): Promise<InstanciaDeProcesso> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/instancias`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dadosIniciais }),
  });
  if (!response.ok) throw new Error(`Falha ao criar instância (status ${response.status})`);
  return (await response.json()) as InstanciaDeProcesso;
}

export async function listarInstancias(accessToken: string, moduloId: string): Promise<InstanciaDeProcesso[]> {
  const response = await apiFetch(`/modulos/${moduloId}/fluxo/instancias`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar instâncias (status ${response.status})`);
  return (await response.json()) as InstanciaDeProcesso[];
}

export async function detalharInstancia(accessToken: string, instanciaId: string): Promise<InstanciaDetalhe> {
  const response = await apiFetch(`/instancias/${instanciaId}`, accessToken);
  if (!response.ok) throw new Error(`Falha ao carregar instância (status ${response.status})`);
  return (await response.json()) as InstanciaDetalhe;
}

export async function executarAcao(
  accessToken: string,
  instanciaId: string,
  acaoId: string,
  dados: Record<string, unknown> = {},
): Promise<InstanciaDeProcesso> {
  const response = await apiFetch(`/instancias/${instanciaId}/acoes`, accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acaoId, dados }),
  });
  if (!response.ok) throw new Error(`Falha ao executar ação (status ${response.status})`);
  return (await response.json()) as InstanciaDeProcesso;
}

export async function obterIntegracaoWhatsApp(accessToken: string): Promise<IntegracaoWhatsApp | null> {
  const response = await apiFetch('/empresas/atual/integracao-whatsapp', accessToken);
  if (!response.ok) throw new Error(`Falha ao carregar integração de WhatsApp (status ${response.status})`);
  return (await response.json()) as IntegracaoWhatsApp | null;
}

export interface SalvarIntegracaoWhatsAppDto {
  apiUrl: string;
  instanceName: string;
  apiKey?: string;
  phone?: string;
}

export async function salvarIntegracaoWhatsApp(accessToken: string, dto: SalvarIntegracaoWhatsAppDto): Promise<IntegracaoWhatsApp> {
  const response = await apiFetch('/empresas/atual/integracao-whatsapp', accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao salvar integração de WhatsApp (status ${response.status})`);
  return (await response.json()) as IntegracaoWhatsApp;
}

export async function testarIntegracaoWhatsApp(accessToken: string): Promise<IntegracaoWhatsApp> {
  const response = await apiFetch('/empresas/atual/integracao-whatsapp/testar', accessToken, { method: 'POST' });
  if (!response.ok) throw new Error(`Falha ao testar integração de WhatsApp (status ${response.status})`);
  return (await response.json()) as IntegracaoWhatsApp;
}

export type { AcaoEtapa };
