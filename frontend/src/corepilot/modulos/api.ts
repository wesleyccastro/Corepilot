import { apiFetch } from '../api/apiFetch';
import type { Modulo } from './types';

export interface CriarModuloDto {
  nome: string;
  objetivo: string;
  instrucoes?: string;
  descricao?: string;
  responsavel?: string;
  areas?: string;
  icone?: string;
  cor?: string;
}

export async function listarModulos(accessToken: string, incluirInativos = false): Promise<Modulo[]> {
  const response = await apiFetch(`/modulos${incluirInativos ? '?todos=true' : ''}`, accessToken);
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

export interface AtualizarModuloDto {
  nome?: string;
  objetivo?: string;
  instrucoes?: string;
  descricao?: string;
  responsavel?: string;
  areas?: string;
  icone?: string;
  cor?: string;
  ativo?: boolean;
}

export async function atualizarModulo(
  accessToken: string,
  moduloId: string,
  dto: AtualizarModuloDto,
): Promise<Modulo> {
  const response = await apiFetch(`/modulos/${moduloId}`, accessToken, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!response.ok) throw new Error(`Falha ao atualizar módulo (status ${response.status})`);
  return (await response.json()) as Modulo;
}
