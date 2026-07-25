import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { btnPrimary, colors, panel } from '../../../styles';

export function AgentSkillsTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 13.5, color: colors.textMuted }}>Skills combinam objetivo, fontes, ferramentas e formato de saída.</span>
        <button onClick={actions.openNewSkill} style={btnPrimary}>+ Nova skill</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state.skills.map((sk) => (
          <div key={sk.id} style={{ ...panel, borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.navy }}>{sk.name}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ background: colors.successBg, color: colors.success, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>{sk.autonomy}</span>
                <button onClick={() => actions.editSkill(sk)} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '6px 11px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Editar</button>
                <button onClick={() => actions.duplicateSkill(sk)} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '6px 11px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Duplicar</button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: colors.textMuted, margin: '8px 0' }}>{sk.objective}</div>
            <div style={{ fontSize: 11.5, color: colors.textFaint }}>Aciona com: {sk.trigger}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
