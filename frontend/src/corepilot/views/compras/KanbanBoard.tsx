import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { colors } from '../../styles';

export function KanbanBoard({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 22, fontSize: 12, color: colors.textMuted, overflowX: 'auto' }}>
        <span>Solicitação recebida</span><span style={{ color: '#C7CFCD' }}>→</span>
        <span>IA confere e agrupa</span><span style={{ color: '#C7CFCD' }}>→</span>
        <span>Comprador valida</span><span style={{ color: '#C7CFCD' }}>→</span>
        <span>Fornecedores cotam</span><span style={{ color: '#C7CFCD' }}>→</span>
        <span>Comprador aprova</span><span style={{ color: '#C7CFCD' }}>→</span>
        <span style={{ fontWeight: 700, color: colors.navy }}>Pedido gerado</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
        {state.kanban.map((col) => (
          <div key={col.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>{col.title}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.cards.map((card) => (
                <div key={card.id} onClick={() => actions.selectCard(card.id)} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, cursor: 'pointer' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: colors.teal, marginBottom: 4 }}>{card.id}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.text, marginBottom: 2 }}>{card.title}</div>
                  <div style={{ fontSize: 12, color: colors.textFaint, marginBottom: 8 }}>{card.sub}</div>
                  <div style={{ fontSize: 11.5, color: colors.textMuted }}>{card.tag}</div>
                  {card.status && <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: colors.warn }}>{card.status}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
