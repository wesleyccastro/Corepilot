import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { ChevronRightIcon, DotsIcon, SpinnerIcon, UploadIcon, WifiIcon } from '../../icons';
import { colors, dropdownMenu, dropdownMenuItem, inputSm, label, overlayFixed, panel } from '../../styles';
import type { DsConnectionState } from '../../types';

const dsBadgeByState: Record<DsConnectionState, { label: string; bg: string; color: string }> = {
  unconfigured: { label: 'Conectar', bg: colors.chipBg, color: colors.textMuted },
  saved_untested: { label: 'Salva, não testada', bg: colors.warnBg, color: '#B36B00' },
  testing: { label: 'Testando…', bg: colors.warnBg, color: '#B36B00' },
  connected: { label: 'Conectada', bg: colors.successBg, color: colors.success },
  error: { label: 'Erro de conexão', bg: colors.dangerBg, color: colors.danger },
};

export function Step3DataSources({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  const badge = dsBadgeByState[state.dsConnectionState];
  const badgeLabel = state.dsConnectionState === 'connected' ? `Conectada · ${state.dsLastTestTime}` : badge.label;
  const isTesting = state.dsConnectionState === 'testing';

  return (
    <div style={{ ...panel, borderRadius: 14, padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: 0 }}>Fontes de dados</h2>
        <button style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Conectar nova fonte</button>
      </div>
      <div style={{ background: colors.warnBg, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: colors.warnText, marginBottom: 6 }}>
        Somente leitura · consultas parametrizadas · nenhum acesso livre ao banco
      </div>
      <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 18 }}>INSERT, UPDATE, DELETE e DROP são bloqueados nesta camada. Credenciais nunca trafegam nem ficam salvas no navegador.</div>

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 14, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.teal} strokeWidth={1.6} style={{ flexShrink: 0 }}>
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>TOTVS RM · Produção e Custos</div>
            <div style={{ fontSize: 12, color: colors.textFaint }}>SQL Server · atualiza a cada 30 minutos</div>
          </div>
          {isTesting && <SpinnerIcon />}
          <span style={{ background: badge.bg, color: badge.color, borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{badgeLabel}</span>
          <button onClick={actions.testConnection} disabled={isTesting} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Testar</button>
          <div style={{ position: 'relative' }}>
            <span onClick={actions.toggleDsMenu}><DotsIcon size={16} /></span>
            {state.dsMenuOpen && (
              <>
                <div style={overlayFixed} onClick={actions.toggleDsMenu} />
                <div style={{ ...dropdownMenu, minWidth: 190 }}>
                  <div onClick={actions.editConnectionFromMenu} style={dropdownMenuItem}>Editar conexão</div>
                  <div style={{ ...dropdownMenuItem, borderTop: `1px solid ${colors.borderLight}` }}>Ver histórico de consultas</div>
                  <div style={{ ...dropdownMenuItem, color: colors.danger, borderTop: `1px solid ${colors.borderLight}` }}>Remover fonte</div>
                </div>
              </>
            )}
          </div>
        </div>

        {state.dsExpanded && (
          <div style={{ borderTop: `1px solid ${colors.border}`, padding: '18px 16px', background: colors.bgAlt }}>
            <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 12 }}>{state.dsLastTestMsg}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
              <div>
                <label style={label}>Servidor</label>
                <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: 8 }}>
                  <input type="text" value={state.dsForm.host} onChange={actions.updateDsField('host')} placeholder="http://servidor:8051" style={inputSm} />
                  <input type="text" value={state.dsForm.port} onChange={actions.updateDsField('port')} placeholder="Porta" style={inputSm} />
                </div>
              </div>
              <div>
                <label style={label}>Credenciais</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input type="text" value={state.dsForm.user} onChange={actions.updateDsField('user')} placeholder="Usuário" style={inputSm} />
                  {!state.dsChangingPassword ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="password" value="••••••••" disabled style={{ ...inputSm, flex: 1, background: colors.chipBg, color: colors.textFaint }} />
                      <span onClick={actions.toggleChangePassword} style={{ fontSize: 12, fontWeight: 600, color: colors.teal, cursor: 'pointer', whiteSpace: 'nowrap' }}>Trocar senha</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="password" value={state.dsNewPassword} onChange={actions.updateDsNewPassword} placeholder="Nova senha" style={{ ...inputSm, flex: 1 }} />
                      <span onClick={actions.toggleChangePassword} style={{ fontSize: 12, fontWeight: 600, color: colors.textFaint, cursor: 'pointer', whiteSpace: 'nowrap' }}>Cancelar</span>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label style={label}>Parâmetros da coligada</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <input type="text" value={state.dsForm.systemCode} onChange={actions.updateDsField('systemCode')} title="Onde encontro isso no RM: Configurador > Sistemas" placeholder="Cód. sistema" style={inputSm} />
                  <input type="text" value={state.dsForm.companyCode} onChange={actions.updateDsField('companyCode')} title="Onde encontro isso no RM: Configurador > Coligadas" placeholder="Cód. coligada" style={inputSm} />
                  <input type="text" value={state.dsForm.branch} onChange={actions.updateDsField('branch')} title="Onde encontro isso no RM: Configurador > Filiais" placeholder="Filial" style={inputSm} />
                </div>
              </div>
              <div>
                <label style={label}>Escopo de leitura (view liberada)</label>
                <input type="text" value={state.dsForm.scope} onChange={actions.updateDsField('scope')} style={{ ...inputSm, width: '100%', fontFamily: "'SF Mono',Menlo,monospace" }} />
              </div>
              <button onClick={actions.testConnection} style={{ alignSelf: 'flex-start', background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Salvar e testar conexão</button>
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${colors.border}`, padding: '18px 16px' }}>
          <div onClick={actions.toggleQueriesSection} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ChevronRightIcon strokeWidth={2.2} style={{ transform: state.queriesExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: colors.navy }}>Consultas cadastradas</span>
            </div>
            <button onClick={(e) => { e.stopPropagation(); actions.toggleNewQueryForm(); }} style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>+ Nova consulta</button>
          </div>

          {state.queriesExpanded && (
            <>
              <p style={{ fontSize: 12, color: colors.textFaint, margin: '0 0 14px' }}>Cada consulta é parametrizada e somente leitura. Skills reutilizam estas consultas em vez de acessar o banco diretamente.</p>

              {state.showNewQuery && (
                <div style={{ background: colors.bg, borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>O CorePilot não permite digitar SQL livre. Informe o nome de uma consulta já criada e autorizada no TOTVS RM (módulo Consulta SQL) — ela será apenas referenciada, nunca reescrita aqui.</div>
                  <input type="text" placeholder="Nome da consulta no RM · ex.: SOLICCOMPRAS_COPILOT" value={state.newQueryForm.rmName} onChange={actions.updateNewQueryField('rmName')} style={{ ...inputSm, fontFamily: "'SF Mono',Menlo,monospace" }} />
                  <input type="text" placeholder="Descrição (para que serve, quais skills podem usar)" value={state.newQueryForm.description} onChange={actions.updateNewQueryField('description')} style={inputSm} />
                  <button onClick={actions.saveNewQuery} style={{ alignSelf: 'flex-start', background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Salvar consulta</button>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                {state.dsQueries.map((q) => {
                  const ready = q.status === 'ready';
                  const usedByText = q.usedBy.length ? `Usada por ${q.usedBy.length} skill${q.usedBy.length > 1 ? 's' : ''}` : 'Ainda não usada por skills';
                  return (
                    <div key={q.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                        <UploadIcon size={16} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "'SF Mono',Menlo,monospace" }}>{q.rmName}</div>
                          <div style={{ fontSize: 12, color: colors.textFaint }}>{q.description} · {usedByText}</div>
                        </div>
                        <span style={{ background: ready ? colors.successBg : colors.warnBg, color: ready ? colors.success : '#B36B00', borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {ready ? 'Testada' : 'Pendente de teste'}
                        </span>
                        <div style={{ position: 'relative' }}>
                          <span onClick={(e) => { e.stopPropagation(); actions.toggleQueryMenu(q.id); }}><DotsIcon size={16} /></span>
                          {state.queryMenuOpenId === q.id && (
                            <>
                              <div style={overlayFixed} onClick={actions.closeQueryMenu} />
                              <div style={{ ...dropdownMenu, minWidth: 170 }}>
                                <div onClick={() => actions.testQuery(q.id)} style={dropdownMenuItem}>Testar consulta</div>
                                <div onClick={() => actions.removeQuery(q.id)} style={{ ...dropdownMenuItem, color: colors.danger, borderTop: `1px solid ${colors.borderLight}` }}>Remover</div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ background: colors.bg, borderRadius: 10, padding: 16 }}>
                <div onClick={actions.toggleSemanticSection} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ChevronRightIcon size={13} style={{ transform: state.semanticExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: colors.navy }}>O que a IA entende destas consultas</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); actions.describeWithAI(); }} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '6px 10px', fontSize: 11.5, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Descrever com IA</button>
                </div>
                {state.semanticExpanded && (
                  <div>
                    {state.semanticFields.map((f) => (
                      <div key={f.field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 0', borderTop: `1px solid ${colors.border}` }}>
                        <span style={{ fontWeight: 700, color: colors.navy }}>{f.field}</span>
                        {!f.pending ? <span style={{ color: colors.textMuted }}>{f.meaning}</span> : <span style={{ color: colors.warn, fontWeight: 600 }}>Sem descrição</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <WifiIcon />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Clima e operações de campo</div>
            <div style={{ fontSize: 12, color: colors.textFaint }}>API REST · última consulta há 12 min</div>
          </div>
          <span style={{ background: colors.successBg, color: colors.success, borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 700 }}>Ativa</span>
          <button style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Testar</button>
        </div>
      </div>
    </div>
  );
}
