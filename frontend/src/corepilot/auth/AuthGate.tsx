import { useSession } from './useSession';
import { LoginForm } from './LoginForm';
import { FundacaoStatus } from './FundacaoStatus';

export function AuthGate() {
  const { session, loading } = useSession();

  if (loading) return <div style={{ padding: 40 }}>Carregando…</div>;
  if (!session) return <LoginForm />;
  return <FundacaoStatus session={session} />;
}
