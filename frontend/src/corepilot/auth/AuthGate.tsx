import { useSession } from './useSession';
import { LoginForm } from './LoginForm';
import { CorePilotApp } from '../CorePilotApp';

export function AuthGate() {
  const { session, loading } = useSession();

  if (loading) return <div style={{ padding: 40 }}>Carregando…</div>;
  if (!session) return <LoginForm />;
  return <CorePilotApp accessToken={session.access_token} />;
}
