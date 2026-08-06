import { useEffect } from 'react';
import type { ChangeEvent } from 'react';
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { ChevronDownIcon, DatabaseIcon, MessageSquareIcon, SpinnerIcon, ToggleSwitch } from '../../icons';
import { colors, inputSm, label } from '../../styles';

export function AdminSettings({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  useEffect(() => {
    actions.carregarFontesDeDados();
    void actions.carregarIntegracaoWhatsApp();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.integracaoWhatsApp) {
      actions.updateWaField('apiUrl')({ target: { value: state.integracaoWhatsApp.apiUrl } } as ChangeEvent<HTMLInputElement>);
      actions.updateWaField('instanceName')({ target: { value: state.integracaoWhatsApp.instanceName } } as ChangeEvent<HTMLInputElement>);
      actions.updateWaField('phone')({ target: { value: state.integracaoWhatsApp.phone ?? '' } } as ChangeEvent<HTMLInputElement>);
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [state.integracaoWhatsApp]);

  const isTesting = state.waConnectionState === 'testing';
  const badge = state.waConnectionState === 'connected'
    ? { label: 'Conectado', bg: colors.successBg, color: colors.success }
    : state.waConnectionState === 'testing'
      ? { label: 'Testando…', bg: colors.warnBg, color: colors.warn }
      : { label: 'Desconectado', bg: colors.chipBg, color: colors.textMuted };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span onClick={actions.backFromAdmin} style={{ fontSize: 13, color: colors.teal, fontWeight: 600, cursor: 'pointer' }}>← Voltar</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Configurações Gerais</h1>
      <p style={{ fontSize: 13.5, color: colors.textFaint, margin: '0 0 20px' }}>Integrações e canais compartilhados por todos os módulos.</p>

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'visible', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
          <DatabaseIcon style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>Fontes de dados · TOTVS RM</div>
            <div style={{ fontSize: 12, color: colors.textFaint }}>Conexões somente leitura, compartilhadas por todos os módulos. Só admin configura.</div>
          </div>
          <button onClick={actions.toggleNovaFonteForm} style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            + Conectar nova fonte
          </button>
        </div>

        <div style={{ borderTop: `1px solid ${colors.border}`, padding: 18, background: colors.bgAlt }}>
          <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 14 }}>
            Somente leitura · consultas parametrizadas · nenhum acesso livre ao banco. INSERT, UPDATE, DELETE e DROP são
            bloqueados nesta camada. Credenciais nunca trafegam nem ficam salvas no navegador.
          </div>

          {state.wizardError && (
            <div style={{ background: colors.dangerBg, color: colors.danger, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
              {state.wizardError}
            </div>
          )}

          {state.showNovaFonteForm && (
            <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
              <select value={state.novaFonteForm.tipo} onChange={actions.updateNovaFonteField('tipo')} style={inputSm}>
                <option value="">Selecione o tipo de fonte</option>
                <option value="totvs_rm">TOTVS RM</option>
              </select>
              {state.novaFonteForm.tipo && (
                <>
                  <input type="text" placeholder="Nome da conexão" value={state.novaFonteForm.nome} onChange={actions.updateNovaFonteField('nome')} style={inputSm} />
                  <input type="text" placeholder="Servidor (ex: http://servidor:8051)" value={state.novaFonteForm.serverUrl} onChange={actions.updateNovaFonteField('serverUrl')} style={inputSm} />
                  <input type="text" placeholder="Usuário" value={state.novaFonteForm.username} onChange={actions.updateNovaFonteField('username')} style={inputSm} />
                  <input type="password" placeholder="Senha" value={state.novaFonteForm.senha} onChange={actions.updateNovaFonteField('senha')} style={inputSm} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <input type="text" placeholder="Cód. sistema" value={state.novaFonteForm.codSistema} onChange={actions.updateNovaFonteField('codSistema')} style={inputSm} />
                    <input type="text" placeholder="Cód. coligada" value={state.novaFonteForm.codColigada} onChange={actions.updateNovaFonteField('codColigada')} style={inputSm} />
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => void actions.salvarNovaFonteReal()} disabled={state.wizardSaving || !state.novaFonteForm.tipo} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {state.wizardSaving ? 'Salvando…' : 'Conectar'}
                </button>
                <button onClick={actions.toggleNovaFonteForm} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {state.fontesLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando fontes de dados…</div>}
          {!state.fontesLoading && state.moduloFontesDeDados.length === 0 && (
            <div style={{ fontSize: 13, color: colors.textFaint }}>Nenhuma fonte de dados conectada ainda.</div>
          )}

          {state.moduloFontesDeDados.map((fonte) => {
            const editando = state.editingFonteId === fonte.id;
            return (
              <div key={fonte.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, background: '#fff', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{fonte.nome}</div>
                    <div style={{ fontSize: 12, color: colors.textFaint }}>{fonte.tipo}</div>
                  </div>
                  <span
                    style={{
                      background: fonte.ultimoTesteSucesso === true ? colors.successBg : fonte.ultimoTesteSucesso === false ? colors.dangerBg : colors.warnBg,
                      color: fonte.ultimoTesteSucesso === true ? colors.success : fonte.ultimoTesteSucesso === false ? colors.danger : colors.warnText,
                      borderRadius: 20,
                      padding: '4px 12px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fonte.ultimoTesteSucesso === true
                      ? `Conectada · ${fonte.ultimoTesteEm}`
                      : fonte.ultimoTesteSucesso === false
                        ? `Erro: ${fonte.ultimaMensagemErro}`
                        : 'Salva, não testada'}
                  </span>
                  <button
                    onClick={() => (editando ? actions.cancelarEdicaoFonte() : actions.editarFonte(fonte.id))}
                    style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}
                  >
                    {editando ? 'Cancelar' : 'Editar'}
                  </button>
                </div>

                {editando && (
                  <div style={{ borderTop: `1px solid ${colors.border}`, padding: 16, background: colors.bgAlt, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
                    <input type="text" placeholder="Nome da conexão" value={state.editFonteForm.nome} onChange={actions.updateEditFonteField('nome')} style={inputSm} />
                    <input type="text" placeholder="Servidor (ex: http://servidor:8051)" value={state.editFonteForm.serverUrl} onChange={actions.updateEditFonteField('serverUrl')} style={inputSm} />
                    <input type="text" placeholder="Usuário" value={state.editFonteForm.username} onChange={actions.updateEditFonteField('username')} style={inputSm} />
                    <div>
                      <input type="password" placeholder="Nova senha (deixe em branco para manter a atual)" value={state.editFonteForm.senha} onChange={actions.updateEditFonteField('senha')} style={{ ...inputSm, width: '100%' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input type="text" placeholder="Cód. sistema" value={state.editFonteForm.codSistema} onChange={actions.updateEditFonteField('codSistema')} style={inputSm} />
                      <input type="text" placeholder="Cód. coligada" value={state.editFonteForm.codColigada} onChange={actions.updateEditFonteField('codColigada')} style={inputSm} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => void actions.salvarEdicaoFonte()} disabled={state.wizardSaving} style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        {state.wizardSaving ? 'Salvando…' : 'Salvar'}
                      </button>
                      <button onClick={actions.cancelarEdicaoFonte} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ fontSize: 11.5, color: colors.textFaint, marginTop: 4 }}>
            Testar de verdade (rodar uma consulta contra o RM) acontece dentro de um módulo, na aba "Fontes de dados" do
            Wizard — lá você escolhe esta conexão e informa o nome de uma consulta já cadastrada no RM.
          </div>
        </div>
      </div>

      <div style={{ border: `1px solid ${colors.border}`, borderRadius: 12, overflow: 'visible' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
          <MessageSquareIcon style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>WhatsApp · Evolution API</div>
            <div style={{ fontSize: 12, color: colors.textFaint }}>Usado para enviar mensagens e notificações de tarefas pelo WhatsApp</div>
          </div>
          {isTesting && <SpinnerIcon />}
          <span style={{ background: badge.bg, color: badge.color, borderRadius: 20, padding: '4px 12px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{badge.label}</span>
          <button onClick={() => void actions.testWaConnection()} disabled={isTesting} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>Testar</button>
          <span onClick={actions.toggleWaExpanded} style={{ cursor: 'pointer', padding: 4, color: colors.textFaint }}>
            <ChevronDownIcon color={colors.textFaint} style={{ transform: state.waExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }} />
          </span>
        </div>

        {state.waExpanded && (
          <div style={{ borderTop: `1px solid ${colors.border}`, padding: 18, background: colors.bgAlt }}>
            <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 12 }}>{state.waLastTestMsg}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
              <div>
                <label style={label}>URL da instância</label>
                <input type="text" value={state.waForm.apiUrl} onChange={actions.updateWaField('apiUrl')} placeholder="https://evolution.suaempresa.com" style={{ ...inputSm, width: '100%' }} />
              </div>
              <div>
                <label style={label}>Nome da instância</label>
                <input type="text" value={state.waForm.instanceName} onChange={actions.updateWaField('instanceName')} placeholder="lfgagro-corepilot" style={{ ...inputSm, width: '100%' }} />
              </div>
              <div>
                <label style={label}>Chave de API</label>
                {!state.waChangingKey ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="password" value="••••••••••••" disabled style={{ ...inputSm, flex: 1, background: colors.chipBg, color: colors.textFaint }} />
                    <span onClick={actions.toggleChangeWaKey} style={{ fontSize: 12, fontWeight: 600, color: colors.teal, cursor: 'pointer', whiteSpace: 'nowrap' }}>Trocar chave</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="password" value={state.waNewKey} onChange={actions.updateWaNewKey} placeholder="Nova chave de API" style={{ ...inputSm, flex: 1 }} />
                    <span onClick={actions.toggleChangeWaKey} style={{ fontSize: 12, fontWeight: 600, color: colors.textFaint, cursor: 'pointer', whiteSpace: 'nowrap' }}>Cancelar</span>
                  </div>
                )}
              </div>
              <div>
                <label style={label}>Número conectado</label>
                <input type="text" value={state.waForm.phone} onChange={actions.updateWaField('phone')} placeholder="+55 11 90000-0000" style={{ ...inputSm, width: '100%' }} />
              </div>
              <button onClick={() => void actions.testWaConnection()} style={{ alignSelf: 'flex-start', background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Salvar e testar conexão</button>
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${colors.border}`, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>Usar WhatsApp para notificações de tarefas</div>
            <div style={{ fontSize: 12, color: colors.textFaint }}>Tarefas agendadas com destinatário por telefone enviam pelo WhatsApp em vez de e-mail/chat.</div>
          </div>
          <ToggleSwitch active={state.waNotifyTasks} onClick={actions.toggleWaNotifyTasks} />
        </div>
      </div>
    </div>
  );
}
