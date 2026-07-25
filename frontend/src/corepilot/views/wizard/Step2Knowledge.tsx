import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { KnowledgeManager } from '../../components/KnowledgeManager';
import { card } from '../../styles';

export function Step2Knowledge({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div style={{ ...card, padding: 28 }}>
      <KnowledgeManager scope="module" state={state} actions={actions} />
    </div>
  );
}
