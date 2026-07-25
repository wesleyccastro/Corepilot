import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { card, colors } from '../../styles';

export function Step5Permissions({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 6px' }}>Permissões</h2>
      <p style={{ fontSize: 13, color: colors.textFaint, margin: '0 0 18px' }}>Vincule cada ação a perfis cadastrados. Clique em um perfil para conceder ou remover o acesso. Para cadastrar novos perfis ou usuários, acesse o menu do seu perfil no topo.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 18 }}>
        {state.permissionRows.map((row) => (
          <div key={row.id} style={{ padding: '14px 0', borderTop: `1px solid ${colors.borderLight}` }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 8 }}>{row.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {state.profiles.map((p) => {
                const active = row.profileIds.includes(p.id);
                return (
                  <span
                    key={p.id}
                    onClick={() => actions.togglePermissionProfile(row.id, p.id)}
                    style={{ border: `1.5px solid ${active ? p.color : colors.border}`, background: active ? p.color : '#fff', color: active ? '#fff' : colors.textMuted, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {p.name}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ background: colors.bg, borderRadius: 10, padding: 14, fontSize: 12.5, color: colors.textMuted }}>Empresas autorizadas: Fazenda Santa Rita, Fazenda São José, Fazenda Bela Vista (LFG Agro)</div>
    </div>
  );
}
