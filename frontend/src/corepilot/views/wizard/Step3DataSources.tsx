import { useEffect } from 'react';
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { SpinnerIcon, UploadIcon } from '../../icons';
import { colors, inputSm, panel } from '../../styles';
import type { CampoSaida } from '../../agentes/types';

export function Step3DataSources({ state, actions }: { state: CorePilotState; actions: CorePilotActions }) {
  useEffect(() => {
    actions.carregarFontesDeDados();
    if (state.currentModuloId) actions.carregarConsultasDoModulo(state.currentModuloId);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ ...panel, borderRadius: 14, padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: colors.navy, margin: 0 }}>Fontes de dados</h2>
        <button onClick={actions.toggleNovaFonteForm} style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + Conectar nova fonte
        </button>
      </div>
      <div style={{ background: colors.warnBg, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: colors.warnText, marginBottom: 6 }}>
        Somente leitura · consultas parametrizadas · nenhum acesso livre ao banco
      </div>
      <div style={{ fontSize: 11.5, color: colors.textFaint, marginBottom: 18 }}>
        INSERT, UPDATE, DELETE e DROP são bloqueados nesta camada. Credenciais nunca trafegam nem ficam salvas no navegador.
      </div>

      {state.wizardError && (
        <div style={{ background: colors.dangerBg, color: colors.danger, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
          {state.wizardError}
        </div>
      )}

      {state.showNovaFonteForm && (
        <div style={{ background: colors.bg, borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
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
        <div style={{ fontSize: 13, color: colors.textFaint, marginBottom: 14 }}>Nenhuma fonte de dados conectada ainda.</div>
      )}

      {state.moduloFontesDeDados.map((fonte) => (
        <div key={fonte.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
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
          </div>
        </div>
      ))}

      <div style={{ borderTop: `1px solid ${colors.border}`, padding: '18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: colors.navy }}>Consultas cadastradas</span>
          <button onClick={actions.toggleNovaConsultaForm} style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            + Nova consulta
          </button>
        </div>
        <p style={{ fontSize: 12, color: colors.textFaint, margin: '0 0 14px' }}>
          Cada consulta é parametrizada e somente leitura. Skills reutilizam estas consultas em vez de acessar o banco diretamente.
        </p>

        {state.showNovaConsultaForm && (
          <div style={{ background: colors.bg, borderRadius: 10, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <select value={state.novaConsultaForm.fonteDeDadosId} onChange={actions.updateNovaConsultaField('fonteDeDadosId')} style={inputSm}>
              <option value="">Selecione a fonte de dados</option>
              {state.moduloFontesDeDados.map((fonte) => (
                <option key={fonte.id} value={fonte.id}>
                  {fonte.nome}
                </option>
              ))}
            </select>
            <input type="text" placeholder="Nome de exibição" value={state.novaConsultaForm.nome} onChange={actions.updateNovaConsultaField('nome')} style={inputSm} />
            <div style={{ fontSize: 12, color: colors.textMuted }}>
              O CorePilot não permite digitar SQL livre. Informe o nome de uma consulta já criada e autorizada no TOTVS RM (módulo Consulta SQL) — ela será apenas referenciada, nunca reescrita aqui.
            </div>
            <input
              type="text"
              placeholder="Nome da consulta no RM · ex.: SOLICCOMPRAS_COPILOT"
              value={state.novaConsultaForm.codSentenca}
              onChange={actions.updateNovaConsultaField('codSentenca')}
              style={{ ...inputSm, fontFamily: "'SF Mono',Menlo,monospace" }}
            />

            <div style={{ fontWeight: 700, fontSize: 12.5, color: colors.navy, marginTop: 6 }}>Parâmetros de sincronização (fixos)</div>
            {state.novaConsultaForm.parametros.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input type="text" placeholder="chave (ex: CODFILIAL)" value={p.chave} onChange={(e) => actions.atualizarParametroConsulta(i, { chave: e.target.value })} style={{ ...inputSm, flex: 1 }} />
                <input type="text" placeholder="valor" value={p.valor} onChange={(e) => actions.atualizarParametroConsulta(i, { valor: e.target.value })} style={{ ...inputSm, flex: 1 }} />
              </div>
            ))}
            <button onClick={actions.adicionarParametroConsulta} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: colors.teal, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              + Adicionar parâmetro
            </button>

            <div style={{ fontWeight: 700, fontSize: 12.5, color: colors.navy, marginTop: 6 }}>Campos de filtro (o que o agente pode informar)</div>
            {state.novaConsultaForm.camposFiltro.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="text" placeholder="nome do campo" value={c.nome} onChange={(e) => actions.atualizarCampoFiltroConsulta(i, { nome: e.target.value })} style={{ ...inputSm, flex: 1 }} />
                <select value={c.tipo} onChange={(e) => actions.atualizarCampoFiltroConsulta(i, { tipo: e.target.value as CampoSaida['tipo'] })} style={inputSm}>
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="string[]">string[]</option>
                </select>
              </div>
            ))}
            <button onClick={actions.adicionarCampoFiltroConsulta} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: colors.teal, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              + Adicionar campo de filtro
            </button>

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                onClick={() => void actions.salvarNovaConsultaReal()}
                disabled={state.wizardSaving || !state.novaConsultaForm.fonteDeDadosId}
                style={{ background: colors.navy, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {state.wizardSaving ? 'Salvando…' : 'Salvar consulta'}
              </button>
              <button onClick={actions.toggleNovaConsultaForm} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {state.consultasLoading && <div style={{ fontSize: 13, color: colors.textFaint }}>Carregando consultas…</div>}
        {!state.consultasLoading && state.moduloConsultas.length === 0 && <div style={{ fontSize: 13, color: colors.textFaint }}>Nenhuma consulta ainda.</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state.moduloConsultas.map((consulta) => {
            const testando = state.testandoConsultaId === consulta.id;
            const resultado = state.resultadosTesteConsulta[consulta.id];
            return (
              <div key={consulta.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                  <UploadIcon size={16} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>{consulta.nome}</div>
                    <div style={{ fontSize: 12, color: colors.textFaint, fontFamily: "'SF Mono',Menlo,monospace" }}>{consulta.codSentenca}</div>
                  </div>
                  {testando && <SpinnerIcon />}
                  <span
                    style={{
                      background: consulta.testada ? colors.successBg : colors.warnBg,
                      color: consulta.testada ? colors.success : colors.warnText,
                      borderRadius: 20,
                      padding: '4px 12px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {consulta.testada ? 'Testada' : 'Pendente de teste'}
                  </span>
                  <button onClick={() => void actions.testarConsultaReal(consulta.id)} disabled={testando} style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: colors.navy, cursor: 'pointer' }}>
                    Testar consulta
                  </button>
                </div>
                {resultado && (
                  <div style={{ padding: '0 16px 12px', fontSize: 12, color: resultado.sucesso ? colors.success : colors.danger }}>
                    {resultado.sucesso ? `${resultado.linhasLidas} linhas lidas` : resultado.erro}
                  </div>
                )}
                {consulta.colunas && consulta.colunas.length > 0 && (
                  <div style={{ padding: '0 16px 12px' }}>
                    {consulta.colunas.map((coluna) => (
                      <div key={coluna.nomeTecnico} style={{ fontSize: 12 }}>
                        <code>{coluna.nomeTecnico}</code> — {coluna.descricao ?? 'sem descrição'}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px 12px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={consulta.sincronizacaoAtiva}
                      disabled={!consulta.testada}
                      onChange={() => void actions.toggleSincronizacaoConsultaReal(consulta)}
                    />
                    Sincronização ativa
                    {consulta.ultimaSincronizacaoEm && ` (última: ${consulta.ultimaSincronizacaoEm})`}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.textMuted }}>
                    A cada
                    <select
                      value={consulta.intervaloSincronizacaoMinutos ?? 60}
                      disabled={!consulta.testada}
                      onChange={(e) => void actions.atualizarIntervaloConsultaReal(consulta, Number(e.target.value))}
                      style={{ ...inputSm, padding: '4px 8px', fontSize: 12 }}
                    >
                      <option value={5}>5 minutos</option>
                      <option value={15}>15 minutos</option>
                      <option value={30}>30 minutos</option>
                      <option value={60}>1 hora</option>
                      <option value={180}>3 horas</option>
                      <option value={360}>6 horas</option>
                      <option value={720}>12 horas</option>
                      <option value={1440}>24 horas</option>
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
