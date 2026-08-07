import { colors } from '../styles';
import { AlertCircleIcon } from '../icons';
import type { CorePilotState } from '../initialState';
import type { CorePilotActions } from '../useCorePilotState';

export const FRASE_CONFIRMACAO_EXCLUSAO_MODULO = 'Quero Excluir este módulo';

export function ExcluirModuloDialog({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const modulo = state.excluirModuloAlvo;
  if (!modulo) return null;

  const textoValido = state.excluirModuloTexto === FRASE_CONFIRMACAO_EXCLUSAO_MODULO;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(7,54,74,.32)' }} onClick={actions.fecharExclusaoModulo} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: 14, padding: 24, width: 440, boxShadow: '0 20px 48px rgba(7,54,74,.28)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: colors.navy, margin: '0 0 8px' }}>
          Excluir &ldquo;{modulo.nome}&rdquo; definitivamente
        </h2>

        {modulo.ativo && (
          <div style={{ display: 'flex', gap: 8, background: colors.warnBg, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: colors.warnText, fontWeight: 600, marginBottom: 14 }}>
            <AlertCircleIcon color={colors.warnText} style={{ flexShrink: 0, marginTop: 1 }} />
            Esse módulo está ativo. Considere desativá-lo primeiro — desativar é reversível, excluir não é.
          </div>
        )}

        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 6px', lineHeight: 1.5 }}>
          Essa ação é <strong>irreversível</strong>. Todas as conversas, agentes, skills, consultas e o fluxo desse módulo serão apagados para sempre.
        </p>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px', lineHeight: 1.5 }}>
          Para confirmar, digite <strong>{FRASE_CONFIRMACAO_EXCLUSAO_MODULO}</strong> abaixo:
        </p>

        <input
          type="text"
          value={state.excluirModuloTexto}
          onChange={actions.updateExcluirModuloTexto}
          placeholder={FRASE_CONFIRMACAO_EXCLUSAO_MODULO}
          autoFocus
          style={{ width: '100%', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 12px', fontSize: 13.5, marginBottom: 20 }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={actions.fecharExclusaoModulo}
            style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => void actions.confirmarExclusaoModulo()}
            disabled={!textoValido || state.excluirModuloEnviando}
            style={{
              background: colors.danger,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: textoValido && !state.excluirModuloEnviando ? 'pointer' : 'not-allowed',
              opacity: textoValido ? 1 : 0.5,
            }}
          >
            {state.excluirModuloEnviando ? 'Excluindo…' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}
