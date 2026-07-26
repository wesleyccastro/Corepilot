import { apiFetch } from '../api/apiFetch';
import type { FonteDeDados } from './types';

export interface CriarFonteDeDadosDto {
  tipo: string;
  nome: string;
  serverUrl: string;
  username: string;
  senha: string;
  codSistema: string;
  codColigada: string;
}

export async function listarFontesDeDados(accessToken: string): Promise<FonteDeDados[]> {
  const response = await apiFetch('/fontes-de-dados', accessToken);
  if (!response.ok) throw new Error(`Falha ao listar fontes de dados (status ${response.status})`);
  return (await response.json()) as FonteDeDados[];
}

export async function criarFonteDeDados(
  accessToken: string,
  dto: CriarFonteDeDadosDto,
): Promise<FonteDeDados> {
  const response = await apiFetch('/fontes-de-dados', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao criar fonte de dados (status ${response.status})`);
  return (await response.json()) as FonteDeDados;
}
