import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { cardDetails } from '../../seedData';
import { XIcon } from '../../icons';
import { colors } from '../../styles';

export function CardDetailDrawer({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  if (!state.comprasCard) return null;
  const raw = state.kanban.flatMap((c) => c.cards).find((c) => c.id === state.comprasCard);
  if (!raw) return null;
  const extra = cardDetails[state.comprasCard] || { equipment: '', timeline: [], quotes: [] };
  const detail = { ...raw, ...extra };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,54,74,.35)', zIndex: 60 }} onClick={actions.closeCard} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, background: '#fff', zIndex: 61, boxShadow: '-8px 0 30px rgba(7,54,74,.15)', overflowY: 'auto', padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.teal }}>{detail.id}</div>
          <span style={{ cursor: 'pointer' }} onClick={actions.closeCard}><XIcon /></span>
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>{detail.title}</h2>
        <p style={{ fontSize: 13, color: colors.textFaint, margin: '0 0 20px' }}>{detail.equipment}</p>

        <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 10 }}>Linha do tempo do agente</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 22 }}>
          {detail.timeline.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: step.dotColor, flexShrink: 0, marginTop: 4 }} />
                <span style={{ width: 1, flex: 1, background: colors.border }} />
              </div>
              <div style={{ paddingBottom: 16 }}>
                <div style={{ fontSize: 11.5, color: colors.textFaint }}>{step.t}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>{step.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy, marginBottom: 10 }}>Cotações recebidas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
          {detail.quotes.map((q, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: colors.bg, borderRadius: 9, padding: '10px 14px', border: `1px solid ${q.borderColor}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{q.supplier}</div>
                <div style={{ fontSize: 11.5, color: colors.textFaint }}>Prazo: {q.days}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: colors.navy }}>{q.value}</div>
                {q.best && <div style={{ fontSize: 11, fontWeight: 700, color: colors.success }}>Melhor proposta</div>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: colors.warnBg, borderRadius: 10, padding: 14, fontSize: 12.5, color: colors.warnText, marginBottom: 20 }}>
          Autonomia atual: <strong>Confirmar.</strong> O agente preparou a cotação; a aprovação final é do comprador.
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={actions.approveCard} style={{ flex: 1, background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Aprovar compra</button>
          <button onClick={actions.requestChanges} style={{ flex: 1, background: '#fff', color: colors.navy, border: `1px solid ${colors.border}`, borderRadius: 9, padding: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Solicitar ajuste</button>
        </div>
        <button onClick={actions.rejectCard} style={{ width: '100%', marginTop: 8, background: 'transparent', color: colors.danger, border: 'none', padding: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Rejeitar cotação</button>
      </div>
    </>
  );
}
