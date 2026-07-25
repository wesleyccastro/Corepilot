import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { colors, input, label } from '../../../styles';
import type { SkillAutonomy } from '../../../types';

const autonomyOptions: SkillAutonomy[] = ['Consultar', 'Confirmar', 'Executar'];

export function AgentSkillEditorTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const skill = state.editingSkill || { id: 0, name: '', objective: '', trigger: '', autonomy: 'Consultar' as SkillAutonomy };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span onClick={actions.cancelSkillEdit} style={{ fontSize: 13, color: colors.teal, fontWeight: 600, cursor: 'pointer' }}>← Skills</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600 }}>
        <div>
          <label style={label}>Nome da skill</label>
          <input type="text" value={skill.name} onChange={actions.updateSkillField('name')} style={{ ...input, width: '100%' }} />
        </div>
        <div>
          <label style={label}>Objetivo</label>
          <textarea rows={2} value={skill.objective} onChange={actions.updateSkillField('objective')} style={{ ...input, width: '100%', resize: 'vertical' }} />
        </div>
        <div>
          <label style={label}>Frases que podem acionar esta skill</label>
          <input type="text" value={skill.trigger} onChange={actions.updateSkillField('trigger')} style={{ ...input, width: '100%' }} />
        </div>
        <div>
          <label style={{ ...label, marginBottom: 8 }}>Nível de autonomia</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {autonomyOptions.map((level) => {
              const active = skill.autonomy === level;
              return (
                <div key={level} onClick={() => actions.setSkillAutonomy(level)} style={{ border: `1.5px solid ${active ? colors.teal : colors.border}`, background: active ? colors.successBg : '#fff', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: active ? colors.navy : colors.textMuted }}>{level}</span>
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={actions.saveSkill} style={{ alignSelf: 'flex-start', background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', marginTop: 6 }}>Salvar skill</button>
      </div>
    </div>
  );
}
