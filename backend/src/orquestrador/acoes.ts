import type { TipoEtapa } from '@prisma/client';

export interface AcaoEtapa {
  id: string;
  label: string;
  etapaDestinoId: string | null;
  exigeCampo?: { key: string; label: string; obrigatorio: boolean };
  estilo: 'primario' | 'secundario' | 'perigo';
}

export interface EtapaParaAcoes {
  tipo: TipoEtapa;
  loopParaEtapaId: string | null;
}

export function calcularAcoes(etapa: EtapaParaAcoes, proximaEtapaId: string | null): AcaoEtapa[] {
  if (etapa.tipo === 'aprovacao') {
    const acoes: AcaoEtapa[] = [{ id: 'aprovar', label: 'Aprovar', etapaDestinoId: proximaEtapaId, estilo: 'primario' }];
    if (etapa.loopParaEtapaId) {
      acoes.push({
        id: 'solicitar_ajustes',
        label: 'Solicitar ajustes',
        etapaDestinoId: etapa.loopParaEtapaId,
        exigeCampo: { key: 'motivo_correcao', label: 'Motivo da correção', obrigatorio: true },
        estilo: 'secundario',
      });
    }
    return acoes;
  }
  if (etapa.tipo === 'interacao_usuario') {
    return [{ id: 'concluir', label: 'Concluir', etapaDestinoId: proximaEtapaId, estilo: 'primario' }];
  }
  return [];
}
