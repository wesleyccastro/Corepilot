import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { colors, label } from '../../../styles';
import { GerarRascunhoButton } from '../../../components/GerarRascunhoButton';

export function AgentInstructionsTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <label style={{ ...label, marginBottom: 8 }}>Instruções do agente</label>
      <div style={{ marginBottom: 8 }}>
        <GerarRascunhoButton onGerar={actions.gerarRascunhoInstrucoesModulo} />
      </div>
      <textarea
        rows={7}
        value={state.instructions}
        onChange={actions.updateInstructions}
        onBlur={() => void actions.salvarInstrucoesReal()}
        style={{ width: '100%', maxWidth: 640, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 14, fontSize: 13.5, lineHeight: 1.6, resize: 'vertical' }}
      />
      <div style={{ fontSize: 12, color: colors.textFaint, marginTop: 10, maxWidth: 640 }}>Defina papel, forma de comunicação, o que priorizar, o que não pode fazer e quando encaminhar ao responsável.</div>
    </div>
  );
}
