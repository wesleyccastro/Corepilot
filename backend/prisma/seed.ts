import { PrismaClient } from '@prisma/client';
import { createTestUser } from '../src/testing/supabase-admin.helper';
import { provisionUsuarioParaEmpresa } from '../src/testing/provision-usuario.helper';

const prisma = new PrismaClient();

async function encontrarOuCriarEmpresa(nome: string) {
  const existente = await prisma.empresa.findFirst({ where: { nome } });
  if (existente) return existente;
  return prisma.empresa.create({ data: { nome } });
}

async function seedEmpresaComAdmin(nomeEmpresa: string, email: string, password: string) {
  const empresa = await encontrarOuCriarEmpresa(nomeEmpresa);
  const authUser = await createTestUser(email, password);

  await provisionUsuarioParaEmpresa(prisma, {
    supabaseUserId: authUser.id,
    nome: email.split('@')[0],
    email,
    empresaId: empresa.id,
    perfil: 'admin',
  });

  console.log(`Seed OK: ${nomeEmpresa} <- ${email}`);
}

async function main() {
  await seedEmpresaComAdmin('Empresa Seed A', 'seed-a@corepilot.dev', 'Seed123!456');
  await seedEmpresaComAdmin('Empresa Seed B', 'seed-b@corepilot.dev', 'Seed123!456');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
