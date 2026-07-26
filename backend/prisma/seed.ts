import { PrismaClient } from '@prisma/client';
import { ensureTestUser } from '../src/testing/supabase-admin.helper';
import { provisionUsuarioParaEmpresa } from '../src/testing/provision-usuario.helper';

const prisma = new PrismaClient();

/**
 * A senha das contas de seed nunca é hardcoded: elas são contas reais e
 * e-mail-confirmadas no projeto Supabase, então um literal no código seria
 * uma credencial viva commitada. Falha alto e claro se não estiver setada —
 * sem default.
 */
function lerSenhaDeSeed(): string {
  const senha = process.env.SEED_USER_PASSWORD;

  if (!senha) {
    throw new Error(
      'SEED_USER_PASSWORD não configurada. Defina-a em backend/.env.local ' +
        '(veja backend/.env.example) antes de rodar o seed.',
    );
  }

  return senha;
}

async function encontrarOuCriarEmpresa(nome: string) {
  const existente = await prisma.empresa.findFirst({ where: { nome } });
  if (existente) return existente;
  return prisma.empresa.create({ data: { nome } });
}

async function seedEmpresaComAdmin(
  nomeEmpresa: string,
  email: string,
  password: string,
) {
  const empresa = await encontrarOuCriarEmpresa(nomeEmpresa);
  const { user: authUser, criado } = await ensureTestUser(email, password);

  await provisionUsuarioParaEmpresa(prisma, {
    supabaseUserId: authUser.id,
    nome: email.split('@')[0],
    email,
    empresaId: empresa.id,
    perfil: 'admin',
  });

  const acao = criado ? 'criado' : 'atualizado (senha redefinida)';
  console.log(`Seed OK: ${nomeEmpresa} <- ${email} [${acao}]`);
}

async function main() {
  const password = lerSenhaDeSeed();

  await seedEmpresaComAdmin('Empresa Seed A', 'seed-a@corepilot.dev', password);
  await seedEmpresaComAdmin('Empresa Seed B', 'seed-b@corepilot.dev', password);
}

// try/finally de verdade: o `process.exit(1)` dentro de um `.catch()`
// encadeado preemptava o `.finally(() => prisma.$disconnect())`, e a conexão
// nunca era fechada no caminho de erro.
async function run() {
  let exitCode = 0;

  try {
    await main();
  } catch (err) {
    console.error(err);
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }

  process.exitCode = exitCode;
}

void run();
