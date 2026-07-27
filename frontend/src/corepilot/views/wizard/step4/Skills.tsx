import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { btnPrimary, colors, panel } from '../../../styles';

export function AgentSkillsTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13.5, color: colors.textMuted }}>Skills combinam objetivo, campos de saída e ferramentas de dados.</span>
        <button onClick={actions.abrirNovaSkill} style={btnPrimary}>+ Nova skill</button>
      </div>
      {state.skillsLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando skills…</div>}
      {!state.skillsLoading && state.agenteSkills.length === 0 && <div style={{ fontSize: 13, color: colors.textFaint }}>Nenhuma skill ainda.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.agenteSkills.map((sk) => (
          <div key={sk.id} style={{ ...panel, borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.navy }}>{sk.nome}</div>
              <button onClick={() => actions.abrirEdicaoSkill(sk)} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '6px 11px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>
                Editar
              </button>
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, margin: '8px 0' }}>{sk.objetivo}</div>
            <div style={{ fontSize: 11.5, color: colors.textFaint }}>{sk.camposSaida.length} campo(s) de saída</div>
          </div>
        ))}
      </div>
    </div>
  );
}
