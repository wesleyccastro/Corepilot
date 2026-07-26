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
    // Cada passo de limpeza é isolado: uma falha em um passo (por exemplo,
    // deleteTestUser agora lança erro quando a Admin API falha) não pode
    // impedir os passos seguintes de rodar — senão dados de teste reais
    // vazam para o projeto Supabase compartilhado. app.close() roda sempre,
    // no finally, independente do que aconteceu na limpeza acima.
    try {
      try {
        await prisma.auditLog.deleteMany({
          where: { empresaId: { in: empresaIdsParaLimpar } },
        });
      } catch (err) {
        console.warn('Falha ao limpar AuditLog de teste:', err);
      }

      try {
        await prisma.usuarioEmpresa.deleteMany({
          where: { empresaId: { in: empresaIdsParaLimpar } },
        });
      } catch (err) {
        console.warn('Falha ao limpar UsuarioEmpresa de teste:', err);
      }

      try {
        await prisma.usuario.deleteMany({
          where: { supabaseUserId: { in: authUserIdsParaLimpar } },
        });
      } catch (err) {
        console.warn('Falha ao limpar Usuario de teste:', err);
      }

      try {
        await prisma.empresa.deleteMany({
          where: { id: { in: empresaIdsParaLimpar } },
        });
      } catch (err) {
        console.warn('Falha ao limpar Empresa de teste:', err);
      }

      // Promise.allSettled em vez de um for+await sequencial: se deleteTestUser
      // lançar para o primeiro usuário, o segundo ainda é tentado.
      const resultadosSupabase = await Promise.allSettled(
        authUserIdsParaLimpar.map((userId) => deleteTestUser(userId)),
      );
      resultadosSupabase.forEach((resultado, index) => {
        if (resultado.status === 'rejected') {
          console.warn(
            `Falha ao deletar usuário Supabase de teste ${authUserIdsParaLimpar[index]}:`,
            resultado.reason,
          );
        }
      });
    } finally {
      await app.close();
    }
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

    return { empresa, email, accessToken };
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

    expect(corpoA.usuario.email).toBe(empresaA.email);
    expect(corpoB.usuario.email).toBe(empresaB.email);
    expect(corpoA.perfil).toBe('admin');
    expect(corpoB.perfil).toBe('admin');

    const logsA = await prisma.auditLog.findMany({
      where: { empresaId: empresaA.empresa.id },
    });
    const logsB = await prisma.auditLog.findMany({
      where: { empresaId: empresaB.empresa.id },
    });
    expect(logsA).toHaveLength(1);
    expect(logsB).toHaveLength(1);
    expect(logsA[0].acao).toBe('consultar_me');
    expect(logsB[0].acao).toBe('consultar_me');
  });

  it('rejeita requisição sem token', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });
});
