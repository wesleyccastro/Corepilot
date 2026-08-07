import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase/client';
import { apiFetch } from '../api/apiFetch';
import { colors } from '../styles';
import { AlertCircleIcon, EyeIcon, EyeOffIcon, SpinnerIcon } from '../icons';
import { AuthHeroPanel } from './AuthHeroPanel';
import { fieldInputStyle, fieldLabelStyle } from './authStyles';
import { mascararCnpjCpf, mascararWhatsapp } from './mascaras';
import { ESTADOS_BRASIL } from './estadosBrasil';
import { SEGMENTOS_EMPRESA } from './segmentos';
import logo from '../../assets/logo.png';

const selectStyle = { ...fieldInputStyle, appearance: 'none' as const };

function traduzirErroSignUp(mensagem: string): string {
  return /already registered|already exists/i.test(mensagem)
    ? 'Este e-mail já está cadastrado. Tente entrar ou recuperar sua senha.'
    : mensagem;
}

interface SignupFormProps {
  onVoltarParaLogin: () => void;
  onCadastroConcluido: (razaoSocial: string) => void;
}

export function SignupForm({ onVoltarParaLogin, onCadastroConcluido }: SignupFormProps) {
  const [razaoSocial, setRazaoSocial] = useState('');
  const [cnpjCpf, setCnpjCpf] = useState('');
  const [segmento, setSegmento] = useState('');
  const [uf, setUf] = useState('');
  const [cidade, setCidade] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    let accessToken = (await supabase.auth.getSession()).data.session?.access_token;

    if (!accessToken) {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password: senha });

      if (signUpError) {
        setError(traduzirErroSignUp(signUpError.message));
        setSubmitting(false);
        return;
      }

      accessToken = data.session?.access_token;
      if (!accessToken) {
        setError('Não foi possível iniciar sua sessão. Tente novamente.');
        setSubmitting(false);
        return;
      }
    }

    const response = await apiFetch('/cadastro-empresa', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: nomeCompleto,
        razaoSocial,
        cnpjCpf,
        segmento,
        uf,
        cidade,
        whatsapp,
      }),
    });

    if (!response.ok) {
      const corpo = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(corpo?.message ?? 'Não foi possível concluir o cadastro. Tente novamente.');
      setSubmitting(false);
      return;
    }

    const resultado = (await response.json()) as { empresa: { razaoSocial: string | null; nome: string } };
    onCadastroConcluido(resultado.empresa.razaoSocial ?? resultado.empresa.nome);
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', background: colors.bg }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '60px 40px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
            <img src={logo} alt="CorePilot" style={{ height: 100, display: 'block' }} />
          </div>

          <h1 style={{ fontSize: 25, fontWeight: 800, color: colors.navy, margin: '0 0 6px' }}>Criar uma conta</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 28px' }}>
            Cadastre sua empresa e comece a usar a CorePilot.
          </p>

          <form onSubmit={handleSubmit}>
            <p style={{ fontSize: 12, fontWeight: 800, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.4px', margin: '0 0 12px' }}>
              Dados da empresa
            </p>

            <label style={fieldLabelStyle}>Razão Social</label>
            <input
              type="text"
              placeholder="Minha Empresa Ltda"
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
              required
              style={{ ...fieldInputStyle, marginBottom: 16 }}
            />

            <label style={fieldLabelStyle}>CNPJ ou CPF</label>
            <input
              type="text"
              placeholder="00.000.000/0000-00"
              value={cnpjCpf}
              onChange={(e) => setCnpjCpf(mascararCnpjCpf(e.target.value))}
              inputMode="numeric"
              required
              style={{ ...fieldInputStyle, marginBottom: 16 }}
            />

            <label style={fieldLabelStyle}>Segmento</label>
            <select
              value={segmento}
              onChange={(e) => setSegmento(e.target.value)}
              required
              style={{ ...selectStyle, marginBottom: 16 }}
            >
              <option value="" disabled>
                Selecione um segmento
              </option>
              {SEGMENTOS_EMPRESA.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 120 }}>
                <label style={fieldLabelStyle}>UF</label>
                <select value={uf} onChange={(e) => setUf(e.target.value)} required style={selectStyle}>
                  <option value="" disabled>
                    UF
                  </option>
                  {ESTADOS_BRASIL.map((estado) => (
                    <option key={estado.sigla} value={estado.sigla}>
                      {estado.sigla}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={fieldLabelStyle}>Cidade</label>
                <input
                  type="text"
                  placeholder="Sua cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  required
                  style={fieldInputStyle}
                />
              </div>
            </div>

            <label style={fieldLabelStyle}>WhatsApp</label>
            <input
              type="tel"
              placeholder="(11) 91234-5678"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararWhatsapp(e.target.value))}
              inputMode="numeric"
              required
              style={{ ...fieldInputStyle, marginBottom: 24 }}
            />

            <p style={{ fontSize: 12, fontWeight: 800, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '.4px', margin: '0 0 12px' }}>
              Seus dados de acesso
            </p>

            <label style={fieldLabelStyle}>Nome completo</label>
            <input
              type="text"
              placeholder="Seu nome"
              value={nomeCompleto}
              onChange={(e) => setNomeCompleto(e.target.value)}
              required
              style={{ ...fieldInputStyle, marginBottom: 16 }}
            />

            <label style={fieldLabelStyle}>E-mail corporativo</label>
            <input
              type="email"
              placeholder="seu.nome@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ ...fieldInputStyle, marginBottom: 16 }}
            />

            <label style={fieldLabelStyle}>Senha</label>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                minLength={6}
                style={{ ...fieldInputStyle, padding: '12px 42px 12px 14px' }}
              />
              <span
                onClick={() => setMostrarSenha((s) => !s)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', display: 'flex' }}
              >
                {mostrarSenha ? <EyeOffIcon /> : <EyeIcon />}
              </span>
            </div>
            <p style={{ fontSize: 11.5, color: colors.textFaint, margin: '0 0 16px' }}>Mínimo de 6 caracteres.</p>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: colors.dangerBg, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: colors.danger, fontWeight: 600, marginBottom: 16 }}>
                <AlertCircleIcon color={colors.danger} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{ width: '100%', background: colors.navy, color: '#fff', border: 'none', borderRadius: 9, padding: 13, fontSize: 14, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? 0.85 : 1 }}
            >
              {submitting ? (
                <>
                  <SpinnerIcon size={13} color="#fff" /> Criando conta…
                </>
              ) : (
                'Criar conta'
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 12.5, color: colors.textFaint, marginTop: 24 }}>
            Já tem uma conta?{' '}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onVoltarParaLogin();
              }}
              style={{ fontWeight: 700, textDecoration: 'none' }}
            >
              Entrar
            </a>
          </p>
        </div>
      </div>

      <AuthHeroPanel />
    </div>
  );
}
