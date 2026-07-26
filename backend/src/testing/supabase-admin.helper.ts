import { createClient, type User } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não configurada`);
  }
  return value;
}

function createSupabaseAdminClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createSupabaseAnonClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_PUBLISHABLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestUser(email: string, password: string): Promise<User> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`Falha ao criar usuário de teste ${email}: ${error?.message}`);
  }

  return data.user;
}

export async function deleteTestUser(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.auth.admin.deleteUser(userId);
}

export async function signInTestUser(email: string, password: string): Promise<string> {
  const anon = createSupabaseAnonClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    throw new Error(`Falha ao logar usuário de teste ${email}: ${error?.message}`);
  }

  return data.session.access_token;
}
