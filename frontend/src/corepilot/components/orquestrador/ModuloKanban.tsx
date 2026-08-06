import { useEffect } from 'react';
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { colors } from '../../styles';

export function ModuloKanban({ moduloId, state, actions }: { moduloId: string; state: CorePilotState; actions: CorePilotActions }) {
  useEffect(() => {
    void actions.carregarInstanciasDoModulo(moduloId);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [moduloId]);

  const colunas: { nome: string; instancias: typeof state.moduloInstancias }[] = [];
  for (const instancia of state.moduloInstancias) {
    if (instancia.status !== 'em_andamento') continue;
    let coluna = colunas.find((c) => c.nome === instancia.macroetapaAtualNome);
    if (!coluna) {
      coluna = { nome: instancia.macroetapaAtualNome, instancias: [] };
      colunas.push(coluna);
    }
    coluna.instancias.push(instancia);
  }

  if (state.instanciasLoading) {
    return <div style={{ fontSize: 13, color: colors.textFaint, padding: 24 }}>Carregando instâncias…</div>;
  }
  if (colunas.length === 0) {
    return <div style={{ fontSize: 13, color: colors.textFaint, padding: 24 }}>Nenhuma instância de processo em andamento neste módulo.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colunas.length}, 1fr)`, gap: 14, padding: 24, overflowX: 'auto' }}>
      {colunas.map((coluna) => (
        <div key={coluna.nome}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.navy, marginBottom: 10 }}>{coluna.nome}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {coluna.instancias.map((instancia) => (
              <div
                key={instancia.id} onClick={() => actions.abrirCardInstancia(instancia.id)}
                style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, cursor: 'pointer' }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: colors.teal, marginBottom: 4 }}>#{instancia.id.slice(0, 8)}</div>
                <div style={{ fontSize: 13, color: colors.textMuted }}>{instancia.etapaAtualNome}</div>
                {instancia.status === 'erro' && <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, color: colors.danger }}>Falha — reenviar</div>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
