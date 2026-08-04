import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { colors } from '../../styles';

export function AdminModulos({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span onClick={actions.backFromAdmin} style={{ fontSize: 13, color: colors.teal, fontWeight: 600, cursor: 'pointer' }}>← Voltar</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Módulos</h1>
      <p style={{ fontSize: 13.5, color: colors.textFaint, margin: '0 0 20px' }}>
        Módulos desativados saem da navegação principal, mas seus dados (conversas, agentes, consultas) continuam guardados e podem ser reativados a qualquer momento.
      </p>

      {state.modulosAdminLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando módulos…</div>}
      {!state.modulosAdminLoading && state.todosModulos.length === 0 && (
        <div style={{ fontSize: 13, color: colors.textFaint }}>Nenhum módulo criado ainda.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {state.todosModulos.map((modulo) => (
          <div key={modulo.id} style={{ display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '13px 16px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: modulo.ativo ? colors.success : colors.textFaint, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{modulo.nome}</div>
              <div style={{ fontSize: 12, color: colors.textFaint }}>{modulo.objetivo}</div>
            </div>
            <span
              style={{
                background: modulo.ativo ? colors.successBg : colors.chipBg,
                color: modulo.ativo ? colors.success : colors.textMuted,
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: 11.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {modulo.ativo ? 'Ativo' : 'Inativo'}
            </span>
            {modulo.ativo ? (
              <button
                onClick={() =>
                  actions.abrirConfirmacao({
                    titulo: 'Desativar módulo',
                    mensagem: `"${modulo.nome}" vai sair da navegação principal. As conversas, agentes e consultas dele continuam guardados, e você pode reativar por aqui quando quiser.`,
                    confirmarLabel: 'Desativar',
                    perigo: true,
                    onConfirmar: () => void actions.alternarStatusModulo(modulo.id, false),
                  })
                }
                style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.danger, cursor: 'pointer' }}
              >
                Desativar
              </button>
            ) : (
              <button
                onClick={() => void actions.alternarStatusModulo(modulo.id, true)}
                style={{ background: colors.teal, border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Ativar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
