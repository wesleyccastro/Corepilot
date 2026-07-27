import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { colors } from '../../styles';
import { Step1Identity } from './Step1Identity';
import { Step2Knowledge } from './Step2Knowledge';
import { Step3DataSources } from './Step3DataSources';
import { Step4Agent } from './Step4Agent';
import { Step5Permissions } from './Step5Permissions';
import { Step6Review } from './Step6Review';

const stepDefs = [
  { n: 1, label: 'Identidade' },
  { n: 2, label: 'Base de conhecimento' },
  { n: 3, label: 'Fontes de dados' },
  { n: 4, label: 'Agente e instruções' },
  { n: 5, label: 'Permissões' },
  { n: 6, label: 'Revisão e publicação' },
];

export function Wizard({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const isEditing = !!state.editingModule;

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 24px 90px', display: 'grid', gridTemplateColumns: '220px 1fr', gap: 32 }}>
      <div>
        {isEditing && (
          <span onClick={actions.backFromWizardEdit} style={{ display: 'block', fontSize: 12.5, color: colors.teal, fontWeight: 600, cursor: 'pointer', marginBottom: 10 }}>← Voltar para o módulo</span>
        )}
        <div style={{ fontSize: 11.5, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{isEditing ? 'Editando módulo' : 'Rascunho'}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: colors.navy, marginBottom: 20 }}>{state.moduleForm.name}</div>
        {stepDefs.map((st) => {
          const done = st.n < state.wizardStep;
          const active = st.n === state.wizardStep;
          const ringColor = active ? colors.teal : '#C7CFCD';
          const textColor = active ? colors.navy : done ? colors.text : colors.textFaint;
          return (
            <div key={st.n} onClick={() => actions.goStep(st.n)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', cursor: 'pointer' }}>
              {done ? (
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: colors.teal, color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</span>
              ) : (
                <span style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${ringColor}`, color: ringColor, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700 }}>{st.n}</span>
              )}
              <span style={{ fontSize: 13.5, fontWeight: active ? 700 : 500, color: textColor }}>{st.label}</span>
            </div>
          );
        })}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 18 }}>
          <button
            onClick={() => {
              actions.goStep(4);
              actions.setAgentTab('test');
            }}
            style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 15px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}
          >
            Testar módulo
          </button>
        </div>

        {state.wizardStep === 1 && <Step1Identity state={state} actions={actions} />}
        {state.wizardStep === 2 && <Step2Knowledge state={state} actions={actions} />}
        {state.wizardStep === 3 && <Step3DataSources state={state} actions={actions} />}
        {state.wizardStep === 4 && <Step4Agent state={state} actions={actions} />}
        {state.wizardStep === 5 && <Step5Permissions state={state} actions={actions} />}
        {state.wizardStep === 6 && <Step6Review state={state} actions={actions} />}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
          {state.wizardStep > 1 ? (
            <button onClick={actions.prevStep} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Voltar</button>
          ) : <span />}
          {state.wizardStep < 6 && (
            <button onClick={actions.nextStep} disabled={state.wizardSaving} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
              {state.wizardSaving ? 'Salvando…' : 'Continuar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
