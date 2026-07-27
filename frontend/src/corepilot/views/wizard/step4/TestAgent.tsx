import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { btnDark, colors, inputSm } from '../../../styles';

export function AgentTestTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <select
          value={state.skillTestSelecionadaId ?? ''}
          onChange={(e) => actions.selecionarSkillParaTeste(e.target.value)}
          style={inputSm}
        >
          <option value="">Selecione uma skill para testar</option>
          {state.agenteSkills.map((sk) => (
            <option key={sk.id} value={sk.id}>
              {sk.nome}
            </option>
          ))}
        </select>
      </div>
      <textarea
        placeholder="Entrada livre para a skill selecionada…"
        rows={3}
        value={state.skillTestEntrada}
        onChange={actions.updateSkillTestEntrada}
        style={{ width: '100%', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, fontSize: 13.5, resize: 'vertical', marginBottom: 10 }}
      />
      <button
        onClick={() => void actions.executarTesteSkillReal()}
        disabled={state.skillTestando || !state.skillTestSelecionadaId || !state.skillTestEntrada.trim()}
        style={btnDark}
      >
        {state.skillTestando ? 'Executando…' : 'Executar'}
      </button>

      {state.skillTestErro && <div style={{ color: colors.danger, fontSize: 12.5, marginTop: 10 }}>{state.skillTestErro}</div>}

      {state.skillTestResultado && (
        <div style={{ background: colors.bg, borderRadius: 12, padding: 18, marginTop: 14 }}>
          {Object.entries(state.skillTestResultado.saida).map(([campo, valor]) => (
            <div key={campo} style={{ fontSize: 13, marginBottom: 6 }}>
              <strong>{campo}:</strong> {JSON.stringify(valor)}
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 8 }}>
            Tokens: {state.skillTestResultado.tokensEntrada ?? '—'} entrada · {state.skillTestResultado.tokensSaida ?? '—'} saída
          </div>
        </div>
      )}
    </div>
  );
}
