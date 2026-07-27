import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { btnDark, btnSecondary, card, chipStyle, colors, inputSm } from '../../styles';
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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {state.agentesLoading && <span style={{ fontSize: 12.5, color: colors.textFaint }}>Carregando agentes…</span>}
        {state.moduloAgentes.map((agente) => (
          <span key={agente.id} onClick={() => actions.selecionarAgente(agente.id)} style={chipStyle(agente.id === state.selectedAgenteId)}>
            {agente.nome}
          </span>
        ))}
        <button onClick={actions.toggleNovoAgenteForm} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 20, padding: '6px 14px', fontSize: 12.5, fontWeight: 700, color: colors.teal, cursor: 'pointer' }}>
          + Novo agente
        </button>
      </div>

      {state.showNovoAgenteForm && (
        <div style={{ background: colors.bg, borderRadius: 10, padding: 16, marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
          <input type="text" placeholder="Nome do agente" value={state.novoAgenteForm.nome} onChange={actions.updateNovoAgenteField('nome')} style={inputSm} />
          <textarea placeholder="Função" rows={2} value={state.novoAgenteForm.funcao} onChange={actions.updateNovoAgenteField('funcao')} style={{ ...inputSm, fontFamily: 'inherit', resize: 'vertical' }} />
          <textarea placeholder="Objetivo" rows={2} value={state.novoAgenteForm.objetivo} onChange={actions.updateNovoAgenteField('objetivo')} style={{ ...inputSm, fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => void actions.criarNovoAgenteReal()} disabled={state.wizardSaving || !state.novoAgenteForm.nome.trim()} style={btnDark}>
              {state.wizardSaving ? 'Criando…' : 'Criar agente'}
            </button>
            <button onClick={actions.toggleNovoAgenteForm} style={btnSecondary}>Cancelar</button>
          </div>
        </div>
      )}

      {!state.agentesLoading && state.moduloAgentes.length === 0 && !state.showNovoAgenteForm && (
        <div style={{ fontSize: 13, color: colors.textFaint, marginBottom: 18 }}>
          Nenhum agente ainda. Crie o primeiro para configurar identidade, skills e instruções.
        </div>
      )}

      {state.selectedAgenteId && (
        <>
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
        </>
      )}
    </div>
  );
}
