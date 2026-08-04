import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';
import { colors } from '../styles';

export function ConfirmDialog({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const dialog = state.confirmDialog;
  if (!dialog) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,54,74,.32)' }} onClick={actions.fecharConfirmacao} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 14, padding: 24, width: 380, boxShadow: '0 20px 48px rgba(7,54,74,.28)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: colors.navy, margin: '0 0 8px' }}>{dialog.titulo}</h2>
        <p style={{ fontSize: 13.5, color: colors.textMuted, margin: '0 0 20px', lineHeight: 1.5 }}>{dialog.mensagem}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={actions.fecharConfirmacao}
            style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={actions.confirmarAcaoPendente}
            style={{
              background: dialog.perigo ? colors.danger : colors.teal,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {dialog.confirmarLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
