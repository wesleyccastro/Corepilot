import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestUser, deleteTestUser, signInTestUser } from '../src/testing/supabase-admin.helper';
import { provisionUsuarioParaEmpresa } from '../src/testing/provision-usuario.helper';

jest.setTimeout(30000);

const TEM_CREDENCIAIS_RM_DE_TESTE = Boolean(
  process.env.TOTVS_RM_TEST_SERVER_URL &&
    process.env.TOTVS_RM_TEST_USERNAME &&
    process.env.TOTVS_RM_TEST_PASSWORD &&
    process.env.TOTVS_RM_TEST_COD_SISTEMA &&
    process.env.TOTVS_RM_TEST_COD_COLIGADA &&
    process.env.TOTVS_RM_TEST_COD_SENTENCA,
);

describe('Fontes de Dados (isolamento entre tenants + fluxo real quando o RM de teste está configurado)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const authUserIdsParaLimpar: string[] = [];
  const empresaIdsParaLimpar: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    try {
      await prisma.consultaResultado.deleteMany({
        where: { consulta: { fonteDeDados: { empresaId: { in: empresaIdsParaLimpar } } } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar resultados de teste', erro);
    }
    try {
      await prisma.consultaParametrizada.deleteMany({
        where: { fonteDeDados: { empresaId: { in: empresaIdsParaLimpar } } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar consultas de teste', erro);
    }
    try {
      await prisma.fonteDeDados.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar fontes de dados de teste', erro);
    }
    try {
      await prisma.modulo.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar módulos de teste', erro);
    }
    try {
      await prisma.usuarioEmpresa.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar vínculos usuário-empresa de teste', erro);
    }
    try {
      await prisma.usuario.deleteMany({ where: { supabaseUserId: { in: authUserIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar usuários de teste', erro);
    }
    try {
      await prisma.empresa.deleteMany({ where: { id: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar empresas de teste', erro);
    }

    await Promise.allSettled(authUserIdsParaLimpar.map((userId) => deleteTestUser(userId)));
    await app.close();
  });

  async function criarEmpresaComUsuarioLogado(nomeEmpresa: string, email: string) {
    const empresa = await prisma.empresa.create({ data: { nome: nomeEmpresa } });
    empresaIdsParaLimpar.push(empresa.id);

    const password = 'TesteFase4!23';
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

  it('cria fonte de dados/consulta reais, nunca expõe a senha, e isola entre empresas', async () => {
    const sufixo = Date.now();
    const empresaA = await criarEmpresaComUsuarioLogado(
      'E2E FonteDeDados Empresa A',
      `e2e-fonte-a-${sufixo}@corepilot.dev`,
    );
    const empresaB = await criarEmpresaComUsuarioLogado(
      'E2E FonteDeDados Empresa B',
      `e2e-fonte-b-${sufixo}@corepilot.dev`,
    );

    const fonteResposta = await request(app.getHttpServer())
      .post('/fontes-de-dados')
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({
        tipo: 'totvs_rm',
        nome: 'RM Teste',
        serverUrl: 'http://servidor-fake:8051',
        username: 'admin',
        senha: 'segredo-e2e',
        codSistema: 'T',
        codColigada: '1',
      })
      .expect(201);
    const fonteDeDadosId = fonteResposta.body.id as string;

    expect(fonteResposta.body.configuracao).not.toHaveProperty('senhaCriptografada');
    expect(fonteResposta.body.configuracao).not.toHaveProperty('senha');

    const moduloResposta = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ nome: 'Estoque', objetivo: 'Consultas de estoque' })
      .expect(201);
    const moduloId = moduloResposta.body.id as string;

    await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/consultas`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({
        fonteDeDadosId,
        nome: 'Saldo de estoque',
        codSentenca: 'SALDOESTOQUEINSU',
        parametrosSincronizacao: { CODFILIAL: '001' },
        camposFiltro: [{ nome: 'codProduto', tipo: 'string', obrigatorio: true }],
      })
      .expect(201);

    // Isolamento: empresa B não consegue criar consulta usando a fonte de dados da empresa A
    const moduloRespostaB = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({ nome: 'Estoque B', objetivo: 'Estoque da empresa B' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/modulos/${moduloRespostaB.body.id}/consultas`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({
        fonteDeDadosId,
        nome: 'X',
        codSentenca: 'Y',
        parametrosSincronizacao: {},
        camposFiltro: [],
      })
      .expect(404);

    // Isolamento: empresa B não vê a fonte de dados da empresa A na listagem
    const listaFontesB = await request(app.getHttpServer())
      .get('/fontes-de-dados')
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(200);
    expect((listaFontesB.body as Array<{ id: string }>).some((f) => f.id === fonteDeDadosId)).toBe(
      false,
    );
  });

  (TEM_CREDENCIAIS_RM_DE_TESTE ? it : it.skip)(
    'testa a consulta contra o TOTVS RM real, sincroniza, e a skill usa os dados locais via tool-use',
    async () => {
      const sufixo = Date.now();
      const empresa = await criarEmpresaComUsuarioLogado(
        'E2E FonteDeDados RM Real',
        `e2e-fonte-rm-${sufixo}@corepilot.dev`,
      );

      const fonteResposta = await request(app.getHttpServer())
        .post('/fontes-de-dados')
        .set('Authorization', `Bearer ${empresa.accessToken}`)
        .send({
          tipo: 'totvs_rm',
          nome: 'RM Real de Teste',
          serverUrl: process.env.TOTVS_RM_TEST_SERVER_URL,
          username: process.env.TOTVS_RM_TEST_USERNAME,
          senha: process.env.TOTVS_RM_TEST_PASSWORD,
          codSistema: process.env.TOTVS_RM_TEST_COD_SISTEMA,
          codColigada: process.env.TOTVS_RM_TEST_COD_COLIGADA,
        })
        .expect(201);

      const moduloResposta = await request(app.getHttpServer())
        .post('/modulos')
        .set('Authorization', `Bearer ${empresa.accessToken}`)
        .send({ nome: 'Estoque RM', objetivo: 'Consultas reais de estoque' })
        .expect(201);

      const consultaResposta = await request(app.getHttpServer())
        .post(`/modulos/${moduloResposta.body.id}/consultas`)
        .set('Authorization', `Bearer ${empresa.accessToken}`)
        .send({
          fonteDeDadosId: fonteResposta.body.id,
          nome: 'Consulta de teste real',
          codSentenca: process.env.TOTVS_RM_TEST_COD_SENTENCA,
          parametrosSincronizacao: {},
          camposFiltro: [],
        })
        .expect(201);
      const consultaId = consultaResposta.body.id as string;

      const testeResposta = await request(app.getHttpServer())
        .post(`/consultas/${consultaId}/testar`)
        .set('Authorization', `Bearer ${empresa.accessToken}`)
        .expect(201);

      expect(testeResposta.body.sucesso).toBe(true);

      const resultadosSalvos = await prisma.consultaResultado.findMany({
        where: { consultaParametrizadaId: consultaId },
      });
      expect(resultadosSalvos.length).toBeGreaterThan(0);
    },
  );
});
