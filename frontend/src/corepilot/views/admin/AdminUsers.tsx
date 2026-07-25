import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { btnPrimary, colors, inputSm } from '../../styles';

export function AdminUsers({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const adminProfiles = state.profiles.map((p) => ({ ...p, userCount: state.users.filter((u) => u.profileIds.includes(p.id)).length }));
  const profileById = Object.fromEntries(state.profiles.map((p) => [p.id, p]));

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span onClick={actions.backFromAdmin} style={{ fontSize: 13, color: colors.teal, fontWeight: 600, cursor: 'pointer' }}>← Voltar</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Usuários e perfis</h1>
      <p style={{ fontSize: 13.5, color: colors.textFaint, margin: '0 0 20px' }}>Perfis cadastrados aqui ficam disponíveis para vincular permissões em qualquer módulo.</p>

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${colors.border}`, marginBottom: 20 }}>
        {[{ key: 'profiles' as const, label: 'Perfis' }, { key: 'users' as const, label: 'Usuários' }].map((t) => {
          const active = t.key === state.adminTab;
          return (
            <div key={t.key} onClick={() => actions.setAdminTab(t.key)} style={{ padding: '9px 14px', cursor: 'pointer', position: 'relative' }}>
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? colors.teal : colors.textMuted }}>{t.label}</span>
              {active && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: colors.teal }} />}
            </div>
          );
        })}
      </div>

      {state.adminTab === 'profiles' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={actions.toggleNewProfileForm} style={btnPrimary}>+ Novo perfil</button>
          </div>
          {state.showNewProfile && (
            <div style={{ background: colors.bg, borderRadius: 10, padding: 14, display: 'flex', gap: 10, marginBottom: 14 }}>
              <input type="text" placeholder="Nome do perfil" value={state.newProfileName} onChange={actions.updateNewProfileName} style={{ ...inputSm, flex: 1 }} />
              <button onClick={actions.saveNewProfile} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Salvar</button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {adminProfiles.map((pf) => (
              <div key={pf.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${colors.border}`, borderRadius: 10, padding: '13px 16px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: pf.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13.5, fontWeight: 700, flex: 1 }}>{pf.name}</span>
                <span style={{ fontSize: 12, color: colors.textFaint }}>{pf.userCount} usuários</span>
              </div>
            ))}
          </div>
        </>
      )}

      {state.adminTab === 'users' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button onClick={actions.toggleNewUserForm} style={btnPrimary}>+ Novo usuário</button>
          </div>
          {state.showNewUser && (
            <div style={{ background: colors.bg, borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="text" placeholder="Nome" value={state.newUserForm.name} onChange={actions.updateNewUserField('name')} style={inputSm} />
                <input type="text" placeholder="E-mail" value={state.newUserForm.email} onChange={actions.updateNewUserField('email')} style={inputSm} />
              </div>
              <input type="text" placeholder="Empresa ou fazenda" value={state.newUserForm.company} onChange={actions.updateNewUserField('company')} style={inputSm} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {state.profiles.map((p) => {
                  const active = state.newUserForm.profileIds.includes(p.id);
                  return (
                    <span key={p.id} onClick={() => actions.toggleNewUserProfile(p.id)} style={{ border: `1.5px solid ${active ? p.color : colors.border}`, background: active ? p.color : '#fff', color: active ? '#fff' : colors.textMuted, borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {p.name}
                    </span>
                  );
                })}
              </div>
              <button onClick={actions.saveNewUser} style={{ alignSelf: 'flex-start', background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Salvar usuário</button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {state.users.map((us) => (
              <div key={us.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: '13px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{us.name}</div>
                    <div style={{ fontSize: 12, color: colors.textFaint }}>{us.email} · {us.company}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 280 }}>
                    {us.profileIds.map((pid) => (
                      <span key={pid} style={{ background: profileById[pid]?.color || colors.textMuted, color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                        {profileById[pid]?.name || pid}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
