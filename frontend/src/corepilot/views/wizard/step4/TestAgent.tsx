import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { suggestedQuestionsBase } from '../../../seedData';
import { chipStyle, colors } from '../../../styles';

const resultChoices = [
  { key: 'correct', label: 'Correto' },
  { key: 'partial', label: 'Parcial' },
  { key: 'incorrect', label: 'Incorreto' },
  { key: 'adjust', label: 'Precisa de ajuste' },
];

export function AgentTestTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {suggestedQuestionsBase.map((q) => (
          <button key={q} onClick={() => actions.askSuggested(q)} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 20, padding: '8px 14px', fontSize: 12.5, color: colors.navy, fontWeight: 600, cursor: 'pointer' }}>
            {q}
          </button>
        ))}
      </div>
      <div style={{ background: colors.bg, borderRadius: 12, padding: 18, minHeight: 120 }}>
        {state.testMessages.length > 0 ? (
          <>
            {state.testMessages.map((tm, i) =>
              tm.role === 'user' ? (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <div style={{ background: colors.navy, color: '#fff', borderRadius: '12px 12px 2px 12px', padding: '10px 15px', fontSize: 13, maxWidth: '80%' }}>{tm.text}</div>
                </div>
              ) : (
                <div key={i} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 12, padding: 14, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, color: colors.text, marginBottom: 10 }}>{tm.text}</div>
                  <div style={{ fontSize: 11.5, color: colors.textFaint }}>Skill: {tm.skill} · Fontes: {tm.sources} · {tm.time}</div>
                </div>
              ),
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {resultChoices.map((r) => (
                <button key={r.key} onClick={() => actions.setTestResult(r.key)} style={{ ...chipStyle(state.testResult === r.key), padding: '6px 13px', fontSize: 12 }}>{r.label}</button>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: colors.textFaint, textAlign: 'center', padding: '30px 0' }}>Escolha uma pergunta sugerida para simular o teste do agente.</div>
        )}
      </div>
    </div>
  );
}
