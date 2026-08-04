import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { CorePilotState } from '../../initialState';
import type { CorePilotActions } from '../../useCorePilotState';
import { KnowledgeManager } from '../../components/KnowledgeManager';
import { colors, input, label } from '../../styles';
import type { MeResponse } from '../../useMe';
import { apiFetch } from '../../api/apiFetch';

const TIPOS_LOGO_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const TAMANHO_MAXIMO_LOGO_BYTES = 2 * 1024 * 1024;

interface AdminCompanyProps {
  state: CorePilotState;
  actions: CorePilotActions;
  accessToken: string;
  me: MeResponse | null;
  onEmpresaUpdated: () => Promise<void>;
}

function DadosEmpresaCard({ accessToken, me, onEmpresaUpdated }: Pick<AdminCompanyProps, 'accessToken' | 'me' | 'onEmpresaUpdated'>) {
  const [nome, setNome] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (!me) return;
    setNome(me.empresa.nome);
    setRazaoSocial(me.empresa.razaoSocial ?? '');
  }, [me?.empresa.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = () => {
    if (!nome.trim()) {
      setErro('O nome não pode ficar vazio.');
      return;
    }
    setErro(null);
    setSalvo(false);
    setSalvando(true);

    apiFetch('/empresa', accessToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim(), razaoSocial: razaoSocial.trim() }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Atualização falhou com status ${response.status}`);
        await onEmpresaUpdated();
        setSalvo(true);
      })
      .catch((err: Error) => setErro(err.message))
      .finally(() => setSalvando(false));
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, marginBottom: 18 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: colors.navy, marginBottom: 14 }}>Dados da empresa</div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={label}>Nome</label>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} style={{ ...input, width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>Razão social</label>
          <input type="text" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} style={{ ...input, width: '100%' }} placeholder="Opcional" />
        </div>
      </div>
      <button onClick={salvar} disabled={salvando} style={{ background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', fontSize: 13, fontWeight: 700, cursor: salvando ? 'default' : 'pointer', opacity: salvando ? 0.7 : 1 }}>
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>
      {erro && <div style={{ fontSize: 12, color: colors.danger, marginTop: 8, fontWeight: 600 }}>{erro}</div>}
      {salvo && !erro && <div style={{ fontSize: 12, color: colors.success, marginTop: 8, fontWeight: 600 }}>Dados atualizados.</div>}
    </div>
  );
}

function LogomarcaCard({ accessToken, me, onEmpresaUpdated }: Pick<AdminCompanyProps, 'accessToken' | 'me' | 'onEmpresaUpdated'>) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;

    if (!TIPOS_LOGO_PERMITIDOS.includes(arquivo.type)) {
      setErro('Tipo de arquivo não suportado. Use PNG, JPEG, WebP ou SVG.');
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_LOGO_BYTES) {
      setErro('Arquivo excede o tamanho máximo de 2MB.');
      return;
    }

    setErro(null);
    setEnviando(true);
    const formData = new FormData();
    formData.append('logo', arquivo);

    apiFetch('/empresa/logo', accessToken, { method: 'POST', body: formData })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Upload falhou com status ${response.status}`);
        await onEmpresaUpdated();
      })
      .catch((err: Error) => setErro(err.message))
      .finally(() => setEnviando(false));
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${colors.border}`, borderRadius: 14, padding: 20, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ width: 96, height: 96, flexShrink: 0, borderRadius: 12, background: '#EAF1EF', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {me?.empresa.logoDataUrl ? (
          <img src={me.empresa.logoDataUrl} alt={me.empresa.nome} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: 11.5, color: colors.textFaint, fontWeight: 600, textAlign: 'center', padding: '0 8px' }}>Sem logomarca</span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: colors.navy, marginBottom: 4 }}>Logomarca da empresa</div>
        <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 10 }}>Exibida na barra superior e na Visão Geral. PNG, JPEG, WebP ou SVG · até 2MB.</div>
        <label style={{ display: 'inline-block', background: colors.teal, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 15px', fontSize: 13, fontWeight: 700, cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.7 : 1 }}>
          <input type="file" accept={TIPOS_LOGO_PERMITIDOS.join(',')} onChange={onFileChange} disabled={enviando} style={{ display: 'none' }} />
          {enviando ? 'Enviando…' : 'Alterar logomarca'}
        </label>
        {erro && <div style={{ fontSize: 12, color: colors.danger, marginTop: 8, fontWeight: 600 }}>{erro}</div>}
      </div>
    </div>
  );
}

export function AdminCompany({ state, actions, accessToken, me, onEmpresaUpdated }: AdminCompanyProps) {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px 90px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span onClick={actions.backFromAdmin} style={{ fontSize: 13, color: colors.teal, fontWeight: 600, cursor: 'pointer' }}>← Voltar</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.navy, margin: '0 0 4px' }}>Configurações da empresa</h1>
      <p style={{ fontSize: 13.5, color: colors.textFaint, margin: '0 0 20px' }}>Base de conhecimento consultada por todos os agentes, de todos os módulos, antes de tomar decisões.</p>

      <DadosEmpresaCard accessToken={accessToken} me={me} onEmpresaUpdated={onEmpresaUpdated} />
      <LogomarcaCard accessToken={accessToken} me={me} onEmpresaUpdated={onEmpresaUpdated} />

      <div style={{ background: colors.warnBg, borderRadius: 10, padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: colors.warnText, marginBottom: 18 }}>
        Todos os agentes de todos os módulos consultam esta base antes de tomar decisões, além do conhecimento específico de cada módulo.
      </div>

      <KnowledgeManager scope="general" state={state} actions={actions} />
    </div>
  );
}
