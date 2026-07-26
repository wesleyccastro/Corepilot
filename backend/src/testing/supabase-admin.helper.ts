import { createClient, type User } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ${name} não configurada`);
  }
  return value;
}

function createSupabaseAdminClient() {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

function createSupabaseAnonClient() {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_PUBLISHABLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

export async function createTestUser(
  email: string,
  password: string,
): Promise<User> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(
      `Falha ao criar usuário de teste ${email}: ${error?.message}`,
    );
  }

  return data.user;
}

function isEmailJaRegistrado(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === 'email_exists' ||
    /already.*(registered|been registered)/i.test(error.message ?? '')
  );
}

/**
 * Procura um usuário do Auth pelo e-mail. A Admin API instalada
 * (@supabase/supabase-js 2.x) não expõe um `getUserByEmail`, então
 * paginamos `listUsers`. O projeto tem poucos usuários (seed + fixtures de
 * teste), então isso é barato.
 */
async function encontrarUsuarioPorEmail(email: string): Promise<User | null> {
  const admin = createSupabaseAdminClient();
  const perPage = 1000;
  const alvo = email.toLowerCase();

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(
        `Falha ao listar usuários do Supabase Auth: ${error.message}`,
      );
    }

    const encontrado = data.users.find(
      (user) => user.email?.toLowerCase() === alvo,
    );
    if (encontrado) {
      return encontrado;
    }

    if (data.users.length < perPage) {
      return null;
    }
  }
}

/**
 * Idempotente: cria o usuário no Supabase Auth se ele não existir, ou
 * apenas redefine a senha dele para `password` se já existir. É o que torna
 * `npm run db:seed` re-executável (e o que faz a rotação de senha do seed
 * valer também para as contas já criadas por execuções anteriores).
 */
export async function ensureTestUser(
  email: string,
  password: string,
): Promise<{ user: User; criado: boolean }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error && data.user) {
    return { user: data.user, criado: true };
  }

  if (!error || !isEmailJaRegistrado(error)) {
    throw new Error(
      `Falha ao criar usuário ${email}: ${error?.message ?? 'resposta sem usuário'}`,
    );
  }

  const existente = await encontrarUsuarioPorEmail(email);
  if (!existente) {
    throw new Error(
      `Supabase respondeu "e-mail já registrado" para ${email}, mas o usuário não foi encontrado via listUsers`,
    );
  }

  const { data: atualizado, error: updateError } =
    await admin.auth.admin.updateUserById(existente.id, {
      password,
      email_confirm: true,
    });

  if (updateError || !atualizado.user) {
    throw new Error(
      `Falha ao atualizar a senha do usuário ${email}: ${updateError?.message ?? 'resposta sem usuário'}`,
    );
  }

  return { user: atualizado.user, criado: false };
}

export async function deleteTestUser(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(
      `Falha ao deletar usuário de teste ${userId}: ${error.message}`,
    );
  }
}

export async function signInTestUser(
  email: string,
  password: string,
): Promise<string> {
  const anon = createSupabaseAnonClient();
  const { data, error } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(
      `Falha ao logar usuário de teste ${email}: ${error?.message}`,
    );
  }

  return data.session.access_token;
}
