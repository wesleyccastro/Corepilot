import { useEffect, useState } from 'react';
import { useSession } from './useSession';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { WelcomeScreen } from './WelcomeScreen';
import { CorePilotApp } from '../CorePilotApp';

export function AuthGate() {
  const { session, loading } = useSession();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [boasVindas, setBoasVindas] = useState<string | null>(null);
  const [recemCadastrado, setRecemCadastrado] = useState(false);

  // Some junto com a sessão: sem isso, um logout seguido de login como outra
  // conta (na mesma aba) reabriria o wizard indevidamente pra quem não
  // acabou de se cadastrar agora.
  useEffect(() => {
    if (!session) setRecemCadastrado(false);
  }, [session]);

  // A ordem importa: `signUp` já deixa `session` preenchida antes do POST
  // /cadastro-empresa terminar, então checar `mode === 'signup'` antes de
  // `!session` evita montar o CorePilotApp (e disparar /me) num usuário que
  // ainda não tem Empresa/Usuario no banco.
  if (boasVindas) {
    return (
      <WelcomeScreen
        razaoSocial={boasVindas}
        onContinuar={() => {
          setBoasVindas(null);
          setMode('login');
          setRecemCadastrado(true);
        }}
      />
    );
  }

  if (mode === 'signup') {
    return (
      <SignupForm
        onVoltarParaLogin={() => setMode('login')}
        onCadastroConcluido={(razaoSocial) => setBoasVindas(razaoSocial)}
      />
    );
  }

  if (loading) return <div style={{ padding: 40 }}>Carregando…</div>;
  if (!session) return <LoginForm onCriarConta={() => setMode('signup')} />;
  return <CorePilotApp accessToken={session.access_token} abrirWizardAoEntrar={recemCadastrado} />;
}
