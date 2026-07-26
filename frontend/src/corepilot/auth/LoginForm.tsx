import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase/client';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
    }

    setSubmitting(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ maxWidth: 320, margin: '80px auto', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <h1>CorePilot</h1>
      <input
        type="email"
        placeholder="E-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Senha"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <div style={{ color: 'crimson', fontSize: 13 }}>{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
