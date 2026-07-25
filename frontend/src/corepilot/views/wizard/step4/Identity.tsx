import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { colors, input, label } from '../../../styles';

const modelChoices = [
  { name: 'Claude', recommended: true },
  { name: 'GPT', recommended: false },
  { name: 'Outro', recommended: false },
];

export function AgentIdentityTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const f = state.agentForm;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div>
        <label style={label}>Nome do agente</label>
        <input type="text" value={f.name} onChange={actions.updateAgentField('name')} style={{ ...input, width: '100%' }} />
      </div>
      <div>
        <label style={label}>Função</label>
        <textarea rows={2} value={f.role} onChange={actions.updateAgentField('role')} style={{ ...input, width: '100%', resize: 'vertical' }} />
      </div>
      <div>
        <label style={label}>Objetivo</label>
        <textarea rows={2} value={f.objective} onChange={actions.updateAgentField('objective')} style={{ ...input, width: '100%', resize: 'vertical' }} />
      </div>
      <div>
        <label style={{ ...label, marginBottom: 8 }}>Modelo de IA</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {modelChoices.map((m) => {
            const active = f.model === m.name;
            return (
              <div key={m.name} onClick={() => actions.selectModel(m.name)} style={{ border: `1.5px solid ${active ? colors.teal : colors.border}`, background: active ? colors.successBg : '#fff', borderRadius: 9, padding: '10px 16px', cursor: 'pointer', position: 'relative' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: active ? colors.navy : colors.textMuted }}>{m.name}</div>
                {m.recommended && <div style={{ fontSize: 10.5, color: colors.teal, fontWeight: 700 }}>Recomendado</div>}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: colors.textFaint, marginTop: 8 }}>O administrador pode conectar o modelo de sua preferência; o CorePilot é otimizado para uso com Claude.</div>
      </div>
    </div>
  );
}
