import type { CorePilotState } from '../../../initialState';
import type { CorePilotActions } from '../../../useCorePilotState';
import { colors, input, label } from '../../../styles';
import { GerarRascunhoButton } from '../../../components/GerarRascunhoButton';

export function AgentIdentityTab({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const agente = state.moduloAgentes.find((a) => a.id === state.selectedAgenteId);
  const form = state.agentIdentityForm;

  if (!agente) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div>
        <label style={label}>Nome do agente</label>
        <input
          type="text"
          value={form.nome}
          onChange={actions.updateAgentIdentityField('nome')}
          style={{ ...input, width: '100%' }}
        />
      </div>
      <div>
        <label style={label}>Função</label>
        <textarea
          rows={2}
          value={form.funcao}
          onChange={actions.updateAgentIdentityField('funcao')}
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <label style={label}>Objetivo</label>
        <textarea
          rows={2}
          value={form.objetivo}
          onChange={actions.updateAgentIdentityField('objetivo')}
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <GerarRascunhoButton
          onGerar={async (brief) => {
            const rascunho = await actions.gerarRascunhoGuardrailsAgente(agente.id, brief);
            actions.setAgentIdentityField('guardrails', rascunho.guardrails);
            actions.setAgentIdentityField('regraEscalonamento', rascunho.regraEscalonamento);
          }}
        />
      </div>
      <div>
        <label style={label}>Restrições (o que este agente NUNCA deve fazer)</label>
        <textarea
          rows={3}
          value={form.guardrails}
          onChange={actions.updateAgentIdentityField('guardrails')}
          placeholder="Ex.: nunca aprovar ou fechar uma compra sozinho; nunca inventar preço sem fonte."
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <label style={label}>Quando escalar para um humano</label>
        <textarea
          rows={3}
          value={form.regraEscalonamento}
          onChange={actions.updateAgentIdentityField('regraEscalonamento')}
          placeholder="Ex.: se não encontrar 3 fornecedores confiáveis, ou se o preço variar mais de 40% entre fontes."
          style={{ ...input, width: '100%', resize: 'vertical' }}
        />
      </div>
      <div>
        <label style={{ ...label, marginBottom: 8 }}>Modelo de IA</label>
        <div style={{ border: `1.5px solid ${colors.teal}`, background: colors.successBg, borderRadius: 9, padding: '10px 16px', display: 'inline-block' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>Claude</div>
          <div style={{ fontSize: 10.5, color: colors.teal, fontWeight: 700 }}>Único suportado nesta versão</div>
        </div>
        <div style={{ fontSize: 12, color: colors.textFaint, marginTop: 8 }}>O CorePilot é otimizado e roda exclusivamente com Claude.</div>
      </div>
    </div>
  );
}
