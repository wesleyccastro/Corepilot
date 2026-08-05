import type { ExecutorEtapa, TipoEtapa } from '@prisma/client';

export const EXECUTORES_POR_TIPO: Record<TipoEtapa, ExecutorEtapa[]> = {
  tarefa_agente: ['agente'],
  interacao_usuario: ['usuario'],
  aprovacao: ['usuario', 'agente_mais_usuario'],
  decisao_automatica: ['automatico'],
  integracao: ['integracao', 'agente_mais_integracao'],
  espera: ['automatico'],
};

export function executorPadrao(tipo: TipoEtapa): ExecutorEtapa {
  return EXECUTORES_POR_TIPO[tipo][0];
}

export function executorValido(
  tipo: TipoEtapa,
  executor: ExecutorEtapa,
): boolean {
  return EXECUTORES_POR_TIPO[tipo].includes(executor);
}
