import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { card, colors, panel } from '../../styles';

export function Step7Review({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const isEditing = !!state.editingModule;
  const agenteSelecionado = state.moduloAgentes.find((a) => a.id === state.selectedAgenteId);

  return (
    <div style={{ ...card, padding: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 18px' }}>Revisão e publicação</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Identidade</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{state.moduleForm.name}</div>
          <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}>Responsável: {state.moduleForm.owner || '—'}</div>
        </div>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Fontes de dados</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{state.moduloFontesDeDados.length} conexões · {state.moduloConsultas.length} consultas</div>
        </div>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Agentes</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{state.moduloAgentes.length} agente(s)</div>
        </div>
        <div style={{ ...panel, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Skills do agente selecionado</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{agenteSelecionado ? agenteSelecionado.nome : '—'} · {state.agenteSkills.length} skill(s)</div>
        </div>
      </div>
      {state.wizardError && (
        <div style={{ background: colors.dangerBg, color: colors.danger, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
          {state.wizardError}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => void actions.publishModule()}
          disabled={state.wizardSaving}
          style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 9, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {state.wizardSaving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Publicar módulo'}
        </button>
      </div>
    </div>
  );
}
