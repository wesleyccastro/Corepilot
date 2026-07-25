import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { dataSources } from '../../seedData';
import { card, colors, panel } from '../../styles';

const autonomyLabels: Record<string, string> = {
  consultar: 'Consultar — o agente apenas lê, analisa e recomenda.',
  confirmar: 'Confirmar — o agente prepara a ação e pede aprovação.',
  executar: 'Executar — o agente pode executar ações previamente autorizadas.',
};

export function Step6Review({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const isEditing = !!state.editingModule;
  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 18px' }}>Revisão e publicação</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Identidade</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{state.moduleForm.name}</div>
          <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}>Responsável: {state.moduleForm.owner}</div>
        </div>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Base de conhecimento</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{state.knowledgeSources.length} fontes documentais</div>
        </div>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Fontes transacionais</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{dataSources.length} conexões · somente leitura</div>
        </div>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Agente e skills</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{state.agentForm.name} · {state.skills.length} skills · {state.agentForm.model}</div>
        </div>
      </div>
      <div style={{ background: colors.bg, borderRadius: 10, padding: 14, fontSize: 12.5, color: colors.textMuted, marginBottom: 22 }}>
        Autonomia geral: <strong style={{ color: colors.navy }}>{autonomyLabels[state.autonomy]}</strong>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {isEditing ? (
          <button onClick={actions.publishModule} style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Salvar alterações</button>
        ) : (
          <>
            <button onClick={actions.publishModule} style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Publicar módulo</button>
            <button onClick={actions.saveDraft} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 9, padding: '12px 20px', fontSize: 14, fontWeight: 700, color: colors.navy, cursor: 'pointer' }}>Salvar rascunho</button>
          </>
        )}
      </div>
    </div>
  );
}
