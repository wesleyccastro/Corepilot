import type { Perfil, PrismaClient, Usuario } from '@prisma/client';

export interface ProvisionarUsuarioParams {
  supabaseUserId: string;
  nome: string;
  email: string;
  empresaId: string;
  perfil: Perfil;
}

export async function provisionUsuarioParaEmpresa(
  prisma: PrismaClient,
  params: ProvisionarUsuarioParams,
): Promise<Usuario> {
  const usuario = await prisma.usuario.upsert({
    where: { supabaseUserId: params.supabaseUserId },
    update: {},
    create: {
      supabaseUserId: params.supabaseUserId,
      nome: params.nome,
      email: params.email,
    },
  });

  await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId: params.empresaId } },
    update: { perfil: params.perfil },
    create: { usuarioId: usuario.id, empresaId: params.empresaId, perfil: params.perfil },
  });

  return usuario;
}
