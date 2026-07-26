import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestUser,
  deleteTestUser,
  signInTestUser,
} from '../src/testing/supabase-admin.helper';
import { provisionUsuarioParaEmpresa } from '../src/testing/provision-usuario.helper';

jest.setTimeout(30000);

interface MeResponseBody {
  usuario: { id: string; nome: string; email: string };
  empresa: { id: string; nome: string };
  perfil: string;
}

describe('GET /me (isolamento multi-tenant)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const authUserIdsParaLimpar: string[] = [];
  const empresaIdsParaLimpar: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { empresaId: { in: empresaIdsParaLimpar } },
    });
    await prisma.usuarioEmpresa.deleteMany({
      where: { empresaId: { in: empresaIdsParaLimpar } },
    });
    await prisma.usuario.deleteMany({
      where: { supabaseUserId: { in: authUserIdsParaLimpar } },
    });
    await prisma.empresa.deleteMany({
      where: { id: { in: empresaIdsParaLimpar } },
    });

    for (const userId of authUserIdsParaLimpar) {
      await deleteTestUser(userId);
    }

    await app.close();
  });

  async function criarEmpresaComUsuarioLogado(
    nomeEmpresa: string,
    email: string,
  ) {
    const empresa = await prisma.empresa.create({
      data: { nome: nomeEmpresa },
    });
    empresaIdsParaLimpar.push(empresa.id);

    const password = 'TestePhase1!23';
    const authUser = await createTestUser(email, password);
    authUserIdsParaLimpar.push(authUser.id);

    await provisionUsuarioParaEmpresa(prisma, {
      supabaseUserId: authUser.id,
      nome: email.split('@')[0],
      email,
      empresaId: empresa.id,
      perfil: 'admin',
    });

    const accessToken = await signInTestUser(email, password);

    return { empresa, accessToken };
  }

  it('retorna a empresa correta para cada usuário e nunca mistura dados entre tenants', async () => {
    const sufixo = Date.now();
    const empresaA = await criarEmpresaComUsuarioLogado(
      'E2E Empresa A',
      `e2e-a-${sufixo}@corepilot.dev`,
    );
    const empresaB = await criarEmpresaComUsuarioLogado(
      'E2E Empresa B',
      `e2e-b-${sufixo}@corepilot.dev`,
    );

    const respostaA = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .expect(200);

    const respostaB = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(200);

    const corpoA = respostaA.body as MeResponseBody;
    const corpoB = respostaB.body as MeResponseBody;

    expect(corpoA.empresa.id).toBe(empresaA.empresa.id);
    expect(corpoB.empresa.id).toBe(empresaB.empresa.id);
    expect(corpoA.empresa.id).not.toBe(corpoB.empresa.id);

    const logsA = await prisma.auditLog.findMany({
      where: { empresaId: empresaA.empresa.id },
    });
    const logsB = await prisma.auditLog.findMany({
      where: { empresaId: empresaB.empresa.id },
    });
    expect(logsA).toHaveLength(1);
    expect(logsB).toHaveLength(1);
    expect(logsA[0].acao).toBe('consultar_me');
  });

  it('rejeita requisição sem token', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });
});
