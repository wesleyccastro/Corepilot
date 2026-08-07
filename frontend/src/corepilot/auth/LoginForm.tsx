import { useState, type FormEvent } from 'react';
import { supabase, setRememberSession } from '../../lib/supabase/client';
import { colors } from '../styles';
import { AlertCircleIcon, CheckCircleIcon, EyeIcon, EyeOffIcon, SpinnerIcon } from '../icons';
import { AuthHeroPanel } from './AuthHeroPanel';
import { fieldInputStyle, fieldLabelStyle } from './authStyles';
import logo from '../../assets/logo.png';

function invalidCredentialsMessage(message: string): string {
  return /invalid login credentials/i.test(message)
    ? 'Credenciais inválidas. Verifique seu e-mail e senha.'
    : message;
}

interface LoginFormProps {
  onCriarConta: () => void;
}

export function LoginForm({ onCriarConta }: LoginFormProps) {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    setRememberSession(remember);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(invalidCredentialsMessage(signInError.message));
    }

    setSubmitting(false);
  }

  async function handleForgotSubmit(event: FormEvent) {
    event.preventDefault();
    setForgotSubmitting(true);
    setForgotError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail);

    if (resetError) {
      setForgotError(resetError.message);
    } else {
      setForgotSent(true);
    }

    setForgotSubmitting(false);
  }

  function backToLogin() {
    setMode('login');
    setForgotEmail('');
    setForgotError(null);
    setForgotSent(false);
  }

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', background: colors.bg }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '60px 40px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 40 }}>
            <img src={logo} alt="CorePilot" style={{ height: 156, display: 'block' }} />
          </div>

          {mode === 'login' ? (
            <>
              <h1 style={{ fontSize: 25, fontWeight: 800, color: colors.navy, margin: '0 0 6px' }}>Bem-vindo de volta</h1>
              <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 32px' }}>Entre com sua conta para acessar seus módulos.</p>

              <form onSubmit={handleSubmit}>
                <label style={fieldLabelStyle}>E-mail corporativo</label>
                <input
                  type="email"
                  placeholder="seu.nome@empresa.com.br"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  required
                  style={{ ...fieldInputStyle, marginBottom: 16 }}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>Senha</label>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setMode('forgot');
                    }}
                    style={{ fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
                  >
                    Esqueceu a senha?
                  </a>
                </div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    required
                    style={{ ...fieldInputStyle, padding: '12px 42px 12px 14px' }}
                  />
                  <span
                    onClick={() => setShowPassword((s) => !s)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', display: 'flex' }}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </span>
                </div>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: colors.dangerBg, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: colors.danger, fontWeight: 600, marginBottom: 16 }}>
                    <AlertCircleIcon color={colors.danger} style={{ flexShrink: 0 }} />
                    {error}
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: colors.textMuted, cursor: 'pointer', marginBottom: 24 }}>
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Manter conectado por 30 dias
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  style={{ width: '100%', background: colors.navy, color: '#fff', border: 'none', borderRadius: 9, padding: 13, fontSize: 14, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? 0.85 : 1 }}
                >
                  {submitting ? (
                    <>
                      <SpinnerIcon size={13} color="#fff" /> Entrando…
                    </>
                  ) : (
                    'Entrar'
                  )}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0' }}>
                <div style={{ flex: 1, height: 1, background: colors.border }} />
                <span style={{ fontSize: 11.5, color: colors.textFaint, fontWeight: 600 }}>ou continue com</span>
                <div style={{ flex: 1, height: 1, background: colors.border }} />
              </div>

              <button
                type="button"
                disabled
                title="Disponível em breve"
                style={{ width: '100%', background: '#fff', color: colors.textBody, border: `1px solid ${colors.border}`, borderRadius: 9, padding: 12, fontSize: 13.5, fontWeight: 700, cursor: 'not-allowed', opacity: 0.55, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google Workspace
              </button>

              <p style={{ textAlign: 'center', fontSize: 12.5, color: colors.textFaint, marginTop: 28 }}>
                Não tem acesso? <a href="#" style={{ fontWeight: 700, textDecoration: 'none' }}>Fale com o administrador</a>
              </p>
              <p style={{ textAlign: 'center', fontSize: 12.5, color: colors.textFaint, marginTop: 8 }}>
                Primeira vez aqui?{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    onCriarConta();
                  }}
                  style={{ fontWeight: 700, textDecoration: 'none' }}
                >
                  Criar uma conta
                </a>
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 25, fontWeight: 800, color: colors.navy, margin: '0 0 6px' }}>Redefinir senha</h1>
              <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 32px' }}>
                Informe seu e-mail corporativo e enviaremos um link para você criar uma nova senha.
              </p>

              {forgotSent ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: colors.successBg, borderRadius: 8, padding: '12px', fontSize: 12.5, color: colors.success, fontWeight: 600, marginBottom: 20 }}>
                  <CheckCircleIcon color={colors.success} style={{ flexShrink: 0, marginTop: 1 }} />
                  Se {forgotEmail} tiver uma conta, enviamos um link de redefinição para essa caixa de entrada.
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit}>
                  <label style={fieldLabelStyle}>E-mail corporativo</label>
                  <input
                    type="email"
                    placeholder="seu.nome@empresa.com.br"
                    value={forgotEmail}
                    onChange={(e) => {
                      setForgotEmail(e.target.value);
                      setForgotError(null);
                    }}
                    required
                    style={{ ...fieldInputStyle, marginBottom: 16 }}
                  />

                  {forgotError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: colors.dangerBg, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: colors.danger, fontWeight: 600, marginBottom: 16 }}>
                      <AlertCircleIcon color={colors.danger} style={{ flexShrink: 0 }} />
                      {forgotError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={forgotSubmitting}
                    style={{ width: '100%', background: colors.navy, color: '#fff', border: 'none', borderRadius: 9, padding: 13, fontSize: 14, fontWeight: 700, cursor: forgotSubmitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: forgotSubmitting ? 0.85 : 1, marginBottom: 20 }}
                  >
                    {forgotSubmitting ? (
                      <>
                        <SpinnerIcon size={13} color="#fff" /> Enviando…
                      </>
                    ) : (
                      'Enviar link de redefinição'
                    )}
                  </button>
                </form>
              )}

              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  backToLogin();
                }}
                style={{ fontSize: 12.5, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}
              >
                ← Voltar para o login
              </a>
            </>
          )}
        </div>
      </div>

      <AuthHeroPanel />
    </div>
  );
}
