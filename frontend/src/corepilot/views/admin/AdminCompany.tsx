import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { KnowledgeManager } from '../../components/KnowledgeManager';
import { colors } from '../../styles';

export function AdminCompany({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span onClick={actions.backFromAdmin} style={{ fontSize: 13, color: colors.teal, fontWeight: 600, cursor: 'pointer' }}>← Voltar</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Configurações da empresa</h1>
      <p style={{ fontSize: 13.5, color: colors.textFaint, margin: '0 0 20px' }}>Base de conhecimento consultada por todos os agentes, de todos os módulos, antes de tomar decisões.</p>

      <div style={{ background: colors.warnBg, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: colors.warnText, marginBottom: 18 }}>
        Todos os agentes de todos os módulos consultam esta base antes de tomar decisões, além do conhecimento específico de cada módulo.
      </div>

      <KnowledgeManager scope="general" state={state} actions={actions} />
    </div>
  );
}
