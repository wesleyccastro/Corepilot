import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { colors } from '../../styles';
import { FieldRenderer } from './FieldRenderer';

export function TelaDeInteracao({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const detalhe = state.instanciaDetalhe;
  if (!state.comprasCard) return null;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,74,.35)', zIndex: 60 }} onClick={actions.fecharCardInstancia} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#fff', zIndex: 61, boxShadow: '-8px 0 30px rgba(7,54,74,.15)', overflowY: 'auto', padding: 26 }}>
        {state.instanciaDetalheLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando…</div>}

        {detalhe && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.teal }}>#{detalhe.instancia.id.slice(0, 8)}</div>
              <span style={{ cursor: 'pointer', fontSize: 18, color: colors.textFaint }} onClick={actions.fecharCardInstancia}>×</span>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: colors.navy, margin: '0 0 18px' }}>{detalhe.etapaAtual.nome}</h2>

            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 10 }}>Andamento do processo</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 22 }}>
              {detalhe.etapas.map((etapa) => {
                const execucao = [...detalhe.historico].reverse().find((h) => h.etapaId === etapa.id);
                const concluida = execucao?.status === 'done';
                const atual = etapa.id === detalhe.etapaAtual.id;
                return (
                  <div key={etapa.id} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: concluida ? colors.success : atual ? colors.teal : colors.borderLight, flexShrink: 0, marginTop: 4 }} />
                      <span style={{ width: 1, flex: 1, background: colors.border }} />
                    </div>
                    <div style={{ paddingBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: atual ? 700 : 500, color: atual ? colors.navy : colors.text }}>{etapa.nome}</div>
                      {execucao?.status === 'failed' && <div style={{ fontSize: 11.5, color: colors.danger, marginTop: 2 }}>Falha — {execucao.mensagemErro}</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {detalhe.instancia.status === 'erro' && (
              <div style={{ background: '#FDEDE9', color: '#B3452F', borderRadius: 10, padding: 14, fontSize: 12.5, marginBottom: 20 }}>
                Esta instância está em estado de erro numa das etapas automáticas — verifique o histórico acima.
              </div>
            )}

            <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 10 }}>Campos</div>
            {detalhe.etapaAtual.camposUsuario.map((campo) => (
              <FieldRenderer
                key={campo.id}
                field={campo}
                valor={(detalhe.instancia.dadosAcumulados[detalhe.etapaAtual.id] as Record<string, unknown> | undefined)?.[campo.id]}
                modo="leitura"
              />
            ))}
            {detalhe.etapaAtual.camposUsuario.length === 0 && (
              <div style={{ fontSize: 12, color: colors.textFaint, marginBottom: 20 }}>Nenhum campo pra preencher nesta etapa.</div>
            )}

            {detalhe.acoes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
                {detalhe.acoes.map((acao) => (
                  <button
                    key={acao.id}
                    onClick={() => actions.iniciarAcaoInstancia(acao)}
                    style={{
                      background: acao.estilo === 'primario' ? colors.teal : '#fff',
                      color: acao.estilo === 'primario' ? '#fff' : acao.estilo === 'perigo' ? colors.danger : colors.navy,
                      border: acao.estilo === 'primario' ? 'none' : `1px solid ${colors.border}`,
                      borderRadius: 9, padding: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {acao.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {state.cardActionPrompt && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,74,.5)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 22, width: 380 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: colors.navy, marginBottom: 12 }}>{state.cardActionPrompt.acao.exigeCampo?.label}</div>
              <textarea
                rows={3} placeholder="Descreva o motivo" value={state.cardActionPrompt.valor}
                onChange={actions.updateCardActionPromptValor}
                style={{ width: '100%', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', marginBottom: 14 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={actions.confirmarCardActionPrompt}
                  disabled={!!state.cardActionPrompt.acao.exigeCampo?.obrigatorio && !state.cardActionPrompt.valor.trim()}
                  style={{ flex: 1, background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Confirmar
                </button>
                <button onClick={actions.cancelarAcaoInstancia} style={{ flex: 1, background: '#fff', color: colors.navy, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
