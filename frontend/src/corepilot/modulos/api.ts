import { apiFetch } from '../api/apiFetch';
import type { Modulo } from './types';

export interface CriarModuloDto {
  nome: string;
  objetivo: string;
  instrucoes?: string;
}

export async function listarModulos(accessToken: string): Promise<Modulo[]> {
  const response = await apiFetch('/modulos', accessToken);
  if (!response.ok) {
    throw new Error(`Falha ao listar módulos (status ${response.status})`);
  }
  return (await response.json()) as Modulo[];
}

export async function criarModulo(accessToken: string, dto: CriarModuloDto): Promise<Modulo> {
  const response = await apiFetch('/modulos', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) {
    throw new Error(`Falha ao criar módulo (status ${response.status})`);
  }
  return (await response.json()) as Modulo;
}
