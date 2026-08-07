import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import type { Etapa, ExecutorEtapa, TipoCampoEtapa, TipoEtapa } from '../../orquestrador/types';
import { btnDark, btnSecondary, card, chipStyle, colors, inputSm } from '../../styles';

const TYPE_EXECUTOR_MAP: Record<TipoEtapa, ExecutorEtapa[]> = {
  tarefa_agente: ['agente'],
  interacao_usuario: ['usuario'],
  aprovacao: ['usuario', 'agente_mais_usuario'],
  decisao_automatica: ['automatico'],
  integracao: ['integracao', 'agente_mais_integracao'],
  espera: ['automatico'],
};

const NODE_TYPE_META: Record<TipoEtapa, { label: string; color: string; bg: string }> = {
  tarefa_agente: { label: 'Tarefa do agente', color: '#0EA5A0', bg: '#E6F7F6' },
  interacao_usuario: { label: 'Interação do usuário', color: '#2F6FED', bg: '#EAF1FE' },
  aprovacao: { label: 'Aprovação', color: '#D97706', bg: '#FEF3E2' },
  decisao_automatica: { label: 'Decisão automática', color: '#7C4DFF', bg: '#F1ECFE' },
  integracao: { label: 'Integração', color: '#5B5FEF', bg: '#ECEDFE' },
  espera: { label: 'Espera / SLA', color: '#8A9598', bg: '#F0F2F1' },
};

const EXECUTOR_LABELS: Record<ExecutorEtapa, string> = {
  agente: 'Agente de IA',
  usuario: 'Usuário',
  agente_mais_usuario: 'Agente + usuário',
  integracao: 'Integração',
  agente_mais_integracao: 'Agente + integração',
  automatico: 'Automático',
};

const FIELD_TYPE_LABELS: Record<TipoCampoEtapa, string> = {
  text: 'Texto', number: 'Número', date: 'Data', select: 'Lista (select)', checkbox: 'Checkbox',
  attachment: 'Anexo', 'entity-reference': 'Referência a cadastro', table: 'Tabela',
  'reference-table': 'Tabela referenciada', summary: 'Resumo (calculado)',
};

function executorFieldMode(executor: ExecutorEtapa): 'free' | 'agent_plus_free' | 'agent_readonly' | 'none' {
  if (executor === 'usuario') return 'free';
  if (executor === 'agente_mais_usuario') return 'agent_plus_free';
  if (executor === 'agente') return 'agent_readonly';
  return 'none';
}

export function Step5Orchestrator({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const fluxo = state.moduloFluxo;
  const etapas = fluxo?.etapas ?? [];
  const macroetapas = fluxo?.macroetapas ?? [];
  const selecionada = etapas.find((e) => e.id === state.orchestratorSelectedEtapaId) ?? null;
  const indiceSelecionada = selecionada ? etapas.findIndex((e) => e.id === selecionada.id) : -1;
  const etapasAnteriores = indiceSelecionada > 0 ? etapas.slice(0, indiceSelecionada) : [];

  const atualizarSelecionada = (patch: Partial<Etapa>) => {
    if (!selecionada) return;
    void actions.atualizarEtapaOrquestradorReal(selecionada.id, patch);
  };

  // Nome e prazo são digitados livremente — salvar em cada tecla (como o
  // resto dos campos, que são seleções discretas) faz PATCHs concorrentes
  // chegarem fora de ordem e o valor exibido regredir/perder caractere no
  // meio da digitação. Buffer local + salva só no blur, mesmo padrão já
  // usado em step4/Instructions.tsx (updateInstructions/salvarInstrucoesReal).
  const [nomeDraft, setNomeDraft] = useState(selecionada?.nome ?? '');
  const [prazoDraft, setPrazoDraft] = useState(String(selecionada?.prazoDias ?? 0));
  // Depende só de selecionada?.id de propósito (oxlint acusa falta de
  // selecionada.nome/prazoDias no array de deps, mas incluí-los reintroduziria
  // o bug: o efeito resetaria o rascunho a cada patch salvo no blur, por
  // cima do que o usuário estiver digitando).
  useEffect(() => {
    setNomeDraft(selecionada?.nome ?? '');
    setPrazoDraft(String(selecionada?.prazoDias ?? 0));
  }, [selecionada?.id]);

  return (
    <div style={{ ...card, padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: '0 0 6px' }}>Orquestrador</h2>
          <p style={{ fontSize: 13, color: colors.textFaint, margin: 0, maxWidth: 540 }}>
            Desenhe o fluxo BPM do módulo: etapas executadas por agentes, interações do usuário, aprovações e
            integrações — em sequência, com desvios de correção quando necessário.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <span style={{ alignSelf: 'center', fontSize: 11.5, fontWeight: 700, color: fluxo?.publicado ? colors.success : colors.textFaint }}>
            {fluxo?.publicado ? `Publicado · v${fluxo.versao}` : 'Rascunho não publicado'}
          </span>
          <button onClick={() => void actions.publicarFluxoReal()} disabled={state.wizardSaving || etapas.length === 0} style={btnSecondary}>
            Publicar fluxo
          </button>
          <button onClick={() => void actions.criarEtapaOrquestradorReal()} style={btnDark}>+ Nova etapa</button>
        </div>
      </div>

      {state.wizardError && <div style={{ color: colors.danger, fontSize: 13, margin: '10px 0' }}>{state.wizardError}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '18px 0 22px', padding: '12px 14px', background: colors.bg, borderRadius: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Colunas do Kanban
        </span>
        {macroetapas.map((me) => (
          <span key={me.id} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600, color: colors.text }}>
            {me.nome}
          </span>
        ))}
        {state.orchestratorNovaMacroetapaAberta ? (
          <span style={{ display: 'flex', gap: 6 }}>
            <input
              type="text" placeholder="Nome da coluna" value={state.orchestratorNovaMacroetapaNome}
              onChange={actions.updateNovaMacroetapaNome} style={{ ...inputSm, width: 160 }}
            />
            <button onClick={() => void actions.criarMacroetapaReal()} style={btnDark}>Criar</button>
            <button onClick={actions.toggleNovaMacroetapaForm} style={btnSecondary}>Cancelar</button>
          </span>
        ) : (
          <span onClick={actions.toggleNovaMacroetapaForm} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: colors.teal }}>
            + Nova coluna
          </span>
        )}
      </div>

      {state.fluxoLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando fluxo…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selecionada ? '1fr 360px' : '1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E9F9F1', border: '2px solid #1E9E6B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#1E9E6B' }}>
            Início
          </div>
          <div style={{ width: 2, height: 20, background: colors.border }} />

          {etapas.map((etapa, i) => {
            const meta = NODE_TYPE_META[etapa.tipo];
            const macroetapa = macroetapas.find((me) => me.id === etapa.macroetapaId);
            const loopAlvo = etapa.loopParaEtapaId ? etapas.find((e) => e.id === etapa.loopParaEtapaId) : null;
            const selecionadaAtual = etapa.id === state.orchestratorSelectedEtapaId;
            return (
              <div key={etapa.id} style={{ width: '100%', maxWidth: 460 }}>
                <div
                  onClick={() => actions.selecionarEtapaOrquestrador(etapa.id)}
                  style={{ cursor: 'pointer', background: selecionadaAtual ? meta.bg : '#fff', border: `1.5px solid ${selecionadaAtual ? meta.color : colors.border}`, borderRadius: 12, padding: '14px 16px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>{etapa.nome}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        <span style={{ background: meta.bg, color: meta.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {meta.label} · {EXECUTOR_LABELS[etapa.executor]}
                        </span>
                        {macroetapa && (
                          <span style={{ background: colors.bg, color: colors.textMuted, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{macroetapa.nome}</span>
                        )}
                        {!!etapa.prazoDias && (
                          <span style={{ background: colors.bg, color: colors.textMuted, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{etapa.prazoDias}d de prazo</span>
                        )}
                      </div>
                    </div>
                    <span
                      onClick={(e) => { e.stopPropagation(); actions.selecionarEtapaOrquestrador(etapa.id); actions.excluirEtapaOrquestradorSelecionada(); }}
                      title="Excluir etapa" style={{ cursor: 'pointer', color: colors.borderLight, fontSize: 16 }}
                    >
                      ×
                    </span>
                  </div>
                  {etapa.tipo === 'aprovacao' && etapa.aprovadores.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${colors.borderLight}`, fontSize: 12, color: colors.textMuted }}>
                      Aprovadores: <b style={{ color: colors.text }}>{etapa.aprovadores.join(', ')}</b>
                    </div>
                  )}
                  {loopAlvo && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, background: '#FDEDE9', borderRadius: 8, padding: '8px 10px', fontSize: 11.5, color: '#B3452F', fontWeight: 600 }}>
                      ↺ Se reprovado, volta para &quot;{loopAlvo.nome}&quot;
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}><div style={{ width: 2, height: 20, background: colors.border }} /></div>
              </div>
            );
          })}

          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FDEDE9', border: '2px solid #E8604C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#E8604C' }}>
            Fim
          </div>
        </div>

        {selecionada && (
          <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 18, position: 'sticky', top: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: colors.navy }}>Editar etapa</div>
              <span onClick={actions.fecharPainelOrquestrador} style={{ cursor: 'pointer', color: colors.textFaint, fontSize: 18 }}>×</span>
            </div>

            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Nome da etapa</label>
            <input
              type="text"
              value={nomeDraft}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNomeDraft(e.target.value)}
              onBlur={() => { if (nomeDraft !== selecionada.nome) atualizarSelecionada({ nome: nomeDraft }); }}
              style={{ ...inputSm, width: '100%', marginBottom: 14 }}
            />

            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Tipo de etapa</label>
            <select
              value={selecionada.tipo} style={{ ...inputSm, width: '100%', marginBottom: 14 }}
              onChange={(e) => {
                const tipo = e.target.value as TipoEtapa;
                atualizarSelecionada({ tipo, executor: TYPE_EXECUTOR_MAP[tipo][0] });
              }}
            >
              {(Object.keys(NODE_TYPE_META) as TipoEtapa[]).map((tipo) => (
                <option key={tipo} value={tipo}>{NODE_TYPE_META[tipo].label}</option>
              ))}
            </select>

            <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Executor</label>
            <select
              value={selecionada.executor} disabled={TYPE_EXECUTOR_MAP[selecionada.tipo].length === 1}
              onChange={(e) => atualizarSelecionada({ executor: e.target.value as ExecutorEtapa })}
              style={{ ...inputSm, width: '100%', marginBottom: 14, background: TYPE_EXECUTOR_MAP[selecionada.tipo].length === 1 ? colors.bg : '#fff' }}
            >
              {TYPE_EXECUTOR_MAP[selecionada.tipo].map((ex) => (
                <option key={ex} value={ex}>{EXECUTOR_LABELS[ex]}</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Coluna do Kanban</label>
                <select value={selecionada.macroetapaId} onChange={(e) => atualizarSelecionada({ macroetapaId: e.target.value })} style={{ ...inputSm, width: '100%' }}>
                  {macroetapas.map((me) => <option key={me.id} value={me.id}>{me.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Prazo (dias)</label>
                <input
                  type="number"
                  min={0}
                  value={prazoDraft}
                  onChange={(e) => setPrazoDraft(e.target.value)}
                  onBlur={() => {
                    const novoPrazo = parseInt(prazoDraft, 10) || 0;
                    setPrazoDraft(String(novoPrazo));
                    if (novoPrazo !== (selecionada.prazoDias ?? 0)) atualizarSelecionada({ prazoDias: novoPrazo });
                  }}
                  style={{ ...inputSm, width: '100%' }}
                />
              </div>
            </div>

            {(selecionada.executor === 'agente' || selecionada.executor === 'agente_mais_usuario' || selecionada.executor === 'agente_mais_integracao') && (
              <>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Agente responsável</label>
                <select value={selecionada.agenteId ?? ''} onChange={(e) => atualizarSelecionada({ agenteId: e.target.value || null })} style={{ ...inputSm, width: '100%', marginBottom: 14 }}>
                  <option value="">Selecione…</option>
                  {state.moduloAgentes.map((ag) => <option key={ag.id} value={ag.id}>{ag.nome}</option>)}
                </select>
              </>
            )}

            {selecionada.executor === 'agente' && (
              <>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Skill</label>
                <select value={selecionada.skillId ?? ''} onChange={(e) => atualizarSelecionada({ skillId: e.target.value || null })} style={{ ...inputSm, width: '100%', marginBottom: 14 }}>
                  <option value="">Selecione…</option>
                  {state.agenteSkills.map((sk) => <option key={sk.id} value={sk.id}>{sk.nome}</option>)}
                </select>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Autonomia</label>
                <select value={selecionada.autonomia ?? 'Executar e notificar'} onChange={(e) => atualizarSelecionada({ autonomia: e.target.value })} style={{ ...inputSm, width: '100%', marginBottom: 14 }}>
                  {['Apenas notificar', 'Executar e notificar', 'Executar com aprovação'].map((op) => <option key={op} value={op}>{op}</option>)}
                </select>
              </>
            )}

            {selecionada.tipo === 'aprovacao' && (
              <>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Aprovadores</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {selecionada.aprovadores.map((nome) => (
                    <span key={nome} style={chipStyle(true)}>
                      {nome} <span onClick={() => actions.removerAprovadorSelecionado(nome)} style={{ cursor: 'pointer', fontWeight: 800, marginLeft: 4 }}>×</span>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                  <input type="text" placeholder="Nome do aprovador" value={state.orchestratorNewApprover} onChange={actions.updateOrchestratorNewApprover} style={{ ...inputSm, flex: 1 }} />
                  <button onClick={actions.adicionarAprovadorSelecionado} style={btnDark}>+</button>
                </div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: 5 }}>Se reprovado, voltar para</label>
                <select value={selecionada.loopParaEtapaId ?? ''} onChange={(e) => atualizarSelecionada({ loopParaEtapaId: e.target.value || null })} style={{ ...inputSm, width: '100%', marginBottom: 14 }}>
                  <option value="">Nenhum (segue em frente)</option>
                  {etapas.filter((e) => e.id !== selecionada.id).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </>
            )}

            <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: colors.navy, marginBottom: 10 }}>Campos da etapa</div>

              {executorFieldMode(selecionada.executor) === 'agent_readonly' || executorFieldMode(selecionada.executor) === 'agent_plus_free' ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Saída (schema da Skill) · somente leitura</div>
                  <div style={{ fontSize: 11, color: colors.textFaint, marginBottom: 14 }}>Gerado a partir da Skill selecionada acima — editar lá, não aqui.</div>
                  {etapasAnteriores.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 6 }}>Entrada · referência a etapas anteriores</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                        {etapasAnteriores.map((ea) => (
                          <label key={ea.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.text, cursor: 'pointer' }}>
                            <input type="checkbox" checked={selecionada.entradaRefs.includes(ea.id)} onChange={() => actions.toggleEntradaRefSelecionada(ea.id)} />
                            {ea.nome}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : null}

              {executorFieldMode(selecionada.executor) === 'free' || executorFieldMode(selecionada.executor) === 'agent_plus_free' ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {selecionada.camposUsuario.map((cf) => (
                      <div key={cf.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: colors.bg, borderRadius: 8, padding: '8px 10px' }}>
                        <div>
                          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{cf.label}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: colors.textMuted, background: colors.borderLight, borderRadius: 5, padding: '2px 6px', marginLeft: 6 }}>{FIELD_TYPE_LABELS[cf.tipo]}</span>
                          {cf.required && <span style={{ fontSize: 10.5, fontWeight: 700, color: colors.danger, marginLeft: 6 }}>obrigatório</span>}
                        </div>
                        <span onClick={() => actions.removerCampoUsuarioSelecionado(cf.id)} style={{ cursor: 'pointer', color: colors.borderLight, fontSize: 15 }}>×</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input type="text" placeholder="Nome do campo" value={state.orchestratorNewFieldLabel} onChange={actions.updateOrchestratorNewFieldLabel} style={{ ...inputSm, flex: 1 }} />
                    <select value={state.orchestratorNewFieldType} onChange={actions.updateOrchestratorNewFieldType} style={inputSm}>
                      {(Object.keys(FIELD_TYPE_LABELS) as TipoCampoEtapa[]).map((tipo) => <option key={tipo} value={tipo}>{FIELD_TYPE_LABELS[tipo]}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.textMuted, cursor: 'pointer' }}>
                      <input type="checkbox" checked={state.orchestratorNewFieldRequired} onChange={actions.toggleOrchestratorNewFieldRequired} /> Obrigatório
                    </label>
                    <button onClick={actions.adicionarCampoUsuarioSelecionado} style={btnDark}>+ Adicionar campo</button>
                  </div>
                </>
              ) : null}

              {executorFieldMode(selecionada.executor) === 'none' && (
                <div style={{ fontSize: 12, color: colors.textFaint }}>Sem builder de campo pra este executor.</div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={actions.excluirEtapaOrquestradorSelecionada} style={{ flex: 1, background: '#fff', color: colors.danger, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Excluir etapa</button>
              <button onClick={actions.fecharPainelOrquestrador} style={{ ...btnDark, flex: 1 }}>Concluir</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
