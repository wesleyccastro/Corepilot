import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { ToggleSwitch } from '../../../icons';
import { GerarRascunhoButton } from '../../../components/GerarRascunhoButton';
import { btnDark, btnSecondary, colors, input, inputSm, label } from '../../../styles';
import type { TipoCampoSaida } from '../../../agentes/types';

const TIPOS_CAMPO: TipoCampoSaida[] = ['string', 'number', 'boolean', 'string[]'];

export function AgentSkillEditorTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const consultasTestadas = state.moduloConsultas.filter((c) => c.testada);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span onClick={actions.cancelarEdicaoSkill} style={{ fontSize: 13, color: colors.teal, fontWeight: 600, cursor: 'pointer' }}>
          ← Skills
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 600 }}>
        <div>
          <label style={label}>Nome da skill</label>
          <input type="text" value={state.skillFormNome} onChange={actions.updateSkillFormNome} style={{ ...input, width: '100%' }} />
        </div>
        <div>
          <label style={label}>Objetivo</label>
          <textarea rows={2} value={state.skillFormObjetivo} onChange={actions.updateSkillFormObjetivo} style={{ ...input, width: '100%', resize: 'vertical' }} />
        </div>

        <GerarRascunhoButton
          onGerar={async (brief) => {
            if (!state.selectedAgenteId) return;
            const rascunho = await actions.gerarRascunhoSkill(state.selectedAgenteId, {
              skillNome: state.skillFormNome,
              skillObjetivo: state.skillFormObjetivo,
              brief,
            });
            actions.aplicarRascunhoCamposSaida(rascunho.camposSaida);
          }}
        />

        <div>
          <label style={{ ...label, marginBottom: 8 }}>Campos de saída</label>
          {state.skillFormCampos.map((campo, indice) => (
            <div key={indice} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input type="text" placeholder="nome do campo" value={campo.nome} onChange={(e) => actions.atualizarCampoSaida(indice, { nome: e.target.value })} style={{ ...inputSm, flex: 1 }} />
              <select value={campo.tipo} onChange={(e) => actions.atualizarCampoSaida(indice, { tipo: e.target.value as TipoCampoSaida })} style={inputSm}>
                {TIPOS_CAMPO.map((tipo) => (
                  <option key={tipo} value={tipo}>{tipo}</option>
                ))}
              </select>
              <input type="text" placeholder="descrição (opcional)" value={campo.descricao ?? ''} onChange={(e) => actions.atualizarCampoSaida(indice, { descricao: e.target.value })} style={{ ...inputSm, flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="checkbox" checked={campo.obrigatorio} onChange={(e) => actions.atualizarCampoSaida(indice, { obrigatorio: e.target.checked })} />
                obrigatório
              </label>
              <button type="button" onClick={() => actions.removerCampoSaida(indice)} disabled={state.skillFormCampos.length <= 1} style={{ background: 'none', border: 'none', color: colors.danger, cursor: 'pointer', fontSize: 12 }}>
                remover
              </button>
            </div>
          ))}
          <button type="button" onClick={actions.adicionarCampoSaida} style={{ background: 'none', border: 'none', color: colors.teal, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
            + Adicionar campo
          </button>
        </div>

        <div>
          <label style={{ ...label, marginBottom: 8 }}>Ferramentas de dados</label>
          {consultasTestadas.length === 0 && (
            <div style={{ fontSize: 12.5, color: colors.textFaint }}>Nenhuma consulta testada disponível neste módulo ainda.</div>
          )}
          {consultasTestadas.map((consulta) => (
            <div key={consulta.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: `1px solid ${colors.borderLight}` }}>
              <span style={{ fontSize: 13 }}>{consulta.nome}</span>
              <ToggleSwitch active={state.skillFerramentasSelecionadas.includes(consulta.id)} onClick={() => actions.toggleFerramentaSkill(consulta.id)} />
            </div>
          ))}
        </div>

        {state.wizardError && <div style={{ color: colors.danger, fontSize: 12.5 }}>{state.wizardError}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => void actions.salvarSkillReal()} disabled={state.wizardSaving || !state.skillFormNome.trim()} style={btnDark}>
            {state.wizardSaving ? 'Salvando…' : 'Salvar skill'}
          </button>
          <button onClick={actions.cancelarEdicaoSkill} style={btnSecondary}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
