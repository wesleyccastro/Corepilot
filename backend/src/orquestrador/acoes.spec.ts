import { calcularAcoes } from './acoes';

describe('calcularAcoes', () => {
  it('etapa de aprovação sem loop tem só a ação Aprovar', () => {
    const acoes = calcularAcoes({ tipo: 'aprovacao', loopParaEtapaId: null }, 'etapa-2');
    expect(acoes).toEqual([{ id: 'aprovar', label: 'Aprovar', etapaDestinoId: 'etapa-2', estilo: 'primario' }]);
  });

  it('etapa de aprovação com loop ganha a ação Solicitar ajustes, exigindo motivo_correcao', () => {
    const acoes = calcularAcoes({ tipo: 'aprovacao', loopParaEtapaId: 'etapa-1' }, 'etapa-2');
    expect(acoes).toHaveLength(2);
    expect(acoes[1]).toEqual({
      id: 'solicitar_ajustes',
      label: 'Solicitar ajustes',
      etapaDestinoId: 'etapa-1',
      exigeCampo: { key: 'motivo_correcao', label: 'Motivo da correção', obrigatorio: true },
      estilo: 'secundario',
    });
  });

  it('etapa de interação do usuário tem só a ação Concluir', () => {
    const acoes = calcularAcoes({ tipo: 'interacao_usuario', loopParaEtapaId: null }, 'etapa-3');
    expect(acoes).toEqual([{ id: 'concluir', label: 'Concluir', etapaDestinoId: 'etapa-3', estilo: 'primario' }]);
  });

  it('etapas automáticas/de agente/integração não têm ações (avançam sozinhas)', () => {
    expect(calcularAcoes({ tipo: 'tarefa_agente', loopParaEtapaId: null }, 'etapa-x')).toEqual([]);
    expect(calcularAcoes({ tipo: 'decisao_automatica', loopParaEtapaId: null }, 'etapa-x')).toEqual([]);
    expect(calcularAcoes({ tipo: 'integracao', loopParaEtapaId: null }, 'etapa-x')).toEqual([]);
  });

  it('última etapa (sem próxima) gera ação com etapaDestinoId null (conclui a instância)', () => {
    const acoes = calcularAcoes({ tipo: 'interacao_usuario', loopParaEtapaId: null }, null);
    expect(acoes[0].etapaDestinoId).toBeNull();
  });
});
