import { apiFetch } from '../api/apiFetch';
import type { ConversaTag } from './types';

export async function listarTags(accessToken: string, moduloId: string): Promise<ConversaTag[]> {
  const response = await apiFetch(`/modulos/${moduloId}/tags`, accessToken);
  if (!response.ok) throw new Error(`Falha ao listar tags (status ${response.status})`);
  return (await response.json()) as ConversaTag[];
}

export async function criarTag(accessToken: string, moduloId: string, nome: string): Promise<ConversaTag> {
  const response = await apiFetch(`/modulos/${moduloId}/tags`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome }),
  });
  if (!response.ok) throw new Error(`Falha ao criar tag (status ${response.status})`);
  return (await response.json()) as ConversaTag;
}

export async function removerTag(accessToken: string, moduloId: string, tagId: string): Promise<void> {
  const response = await apiFetch(`/modulos/${moduloId}/tags/${tagId}`, accessToken, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Falha ao remover tag (status ${response.status})`);
}
