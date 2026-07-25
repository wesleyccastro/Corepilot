import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { card, colors } from '../../styles';
import type { WizardAgentTab } from '../../types';
import { AgentIdentityTab } from './step4/Identity';
import { AgentInstructionsTab } from './step4/Instructions';
import { AgentSkillsTab } from './step4/Skills';
import { AgentSkillEditorTab } from './step4/SkillEditor';
import { AgentToolsTab } from './step4/Tools';
import { AgentTasksTab } from './step4/Tasks';
import { AgentAutonomyTab } from './step4/Autonomy';
import { AgentTestTab } from './step4/TestAgent';

const tabDefs: { key: WizardAgentTab; label: string }[] = [
  { key: 'identity', label: 'Identidade' },
  { key: 'instructions', label: 'Instruções' },
  { key: 'skills', label: 'Skills' },
  { key: 'tools', label: 'Ferramentas' },
  { key: 'tasks', label: 'Tarefas' },
  { key: 'autonomy', label: 'Autonomia' },
  { key: 'test', label: 'Testar agente' },
];

export function Step4Agent({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 16px' }}>Agente e instruções</h2>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${colors.border}`, marginBottom: 22, flexWrap: 'wrap' }}>
        {tabDefs.map((at) => {
          const active = at.key === state.agentTab || (at.key === 'skills' && state.agentTab === 'skill-editor');
          return (
            <div key={at.key} onClick={() => actions.setAgentTab(at.key)} style={{ padding: '9px 14px', cursor: 'pointer', position: 'relative' }}>
              <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? colors.teal : colors.textMuted }}>{at.label}</span>
              {active && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: colors.teal }} />}
            </div>
          );
        })}
      </div>

      {state.agentTab === 'identity' && <AgentIdentityTab state={state} actions={actions} />}
      {state.agentTab === 'instructions' && <AgentInstructionsTab state={state} actions={actions} />}
      {state.agentTab === 'skills' && <AgentSkillsTab state={state} actions={actions} />}
      {state.agentTab === 'skill-editor' && <AgentSkillEditorTab state={state} actions={actions} />}
      {state.agentTab === 'tools' && <AgentToolsTab state={state} actions={actions} />}
      {state.agentTab === 'tasks' && <AgentTasksTab state={state} actions={actions} />}
      {state.agentTab === 'autonomy' && <AgentAutonomyTab state={state} actions={actions} />}
      {state.agentTab === 'test' && <AgentTestTab state={state} actions={actions} />}
    </div>
  );
}
