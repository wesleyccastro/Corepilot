import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { ToggleSwitch } from '../../../icons';
import { colors } from '../../../styles';

export function AgentToolsTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {state.tools.map((tl, i) => (
        <div key={tl.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderTop: `1px solid ${colors.borderLight}` }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{tl.name}</div>
            <div style={{ fontSize: 12, color: colors.textFaint }}>{tl.scope}</div>
            {tl.name === 'Criar tarefa' && (
              <span onClick={() => actions.setAgentTab('tasks')} style={{ fontSize: 11.5, fontWeight: 700, color: colors.teal, cursor: 'pointer' }}>Configurar tarefas →</span>
            )}
          </div>
          <ToggleSwitch active={tl.active} onClick={() => actions.toggleTool(i)} />
        </div>
      ))}
    </div>
  );
}
