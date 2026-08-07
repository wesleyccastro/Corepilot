import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestUser,
  deleteTestUser,
  signInTestUser,
} from '../src/testing/supabase-admin.helper';
import { provisionUsuarioParaEmpresa } from '../src/testing/provision-usuario.helper';

jest.setTimeout(30000);

describe('Fluxo de Agente/Skill (skill real + Anthropic real + isolamento entre tenants)', () => {
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
    try {
      await prisma.skillExecucao.deleteMany({
        where: {
          skill: { agente: { empresaId: { in: empresaIdsParaLimpar } } },
        },
      });
    } catch (erro) {
      console.warn('Falha ao limpar execuções de teste', erro);
    }
    try {
      await prisma.skill.deleteMany({
        where: { agente: { empresaId: { in: empresaIdsParaLimpar } } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar skills de teste', erro);
    }
    try {
      await prisma.agente.deleteMany({
        where: { empresaId: { in: empresaIdsParaLimpar } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar agentes de teste', erro);
    }
    try {
      await prisma.modulo.deleteMany({
        where: { empresaId: { in: empresaIdsParaLimpar } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar módulos de teste', erro);
    }
    try {
      await prisma.auditLog.deleteMany({
        where: { empresaId: { in: empresaIdsParaLimpar } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar audit logs de teste', erro);
    }
    try {
      await prisma.usuarioEmpresa.deleteMany({
        where: { empresaId: { in: empresaIdsParaLimpar } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar vínculos usuário-empresa de teste', erro);
    }
    try {
      await prisma.usuario.deleteMany({
        where: { supabaseUserId: { in: authUserIdsParaLimpar } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar usuários de teste', erro);
    }
    try {
      await prisma.empresa.deleteMany({
        where: { id: { in: empresaIdsParaLimpar } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar empresas de teste', erro);
    }

    await Promise.allSettled(
      authUserIdsParaLimpar.map((userId) => deleteTestUser(userId)),
    );
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

    const password = 'TesteFase3!23';
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

  it('cria agente/skill reais, executa a skill com saída estruturada real, persiste e audita — e nunca vaza entre empresas', async () => {
    const sufixo = Date.now();
    const empresaA = await criarEmpresaComUsuarioLogado(
      'E2E Skill Empresa A',
      `e2e-skill-a-${sufixo}@corepilot.dev`,
    );
    const empresaB = await criarEmpresaComUsuarioLogado(
      'E2E Skill Empresa B',
      `e2e-skill-b-${sufixo}@corepilot.dev`,
    );

    const moduloResposta = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ nome: 'Compras', objetivo: 'Ajudar o time de compras' })
      .expect(201);
    const moduloId = moduloResposta.body.id as string;

    const agenteResposta = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/agentes`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({
        nome: 'Comprador',
        funcao: 'Analisar pedidos',
        objetivo: 'Ajudar o time de compras',
      })
      .expect(201);
    const agenteId = agenteResposta.body.id as string;

    const skillResposta = await request(app.getHttpServer())
      .post(`/agentes/${agenteId}/skills`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({
        nome: 'Triagem',
        objetivo:
          'Extrair item e quantidade de um pedido de compra em texto livre',
        camposSaida: [
          { nome: 'item', tipo: 'string', obrigatorio: true },
          { nome: 'quantidade', tipo: 'number', obrigatorio: true },
        ],
      })
      .expect(201);
    const skillId = skillResposta.body.id as string;

    const execucaoResposta = await request(app.getHttpServer())
      .post(`/skills/${skillId}/execucoes`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ entrada: 'Preciso de 10 parafusos M6' })
      .expect(201);

    expect(typeof execucaoResposta.body.execucaoId).toBe('string');
    expect(typeof execucaoResposta.body.saida.item).toBe('string');
    expect(typeof execucaoResposta.body.saida.quantidade).toBe('number');

    const execucoesSalvas = await prisma.skillExecucao.findMany({
      where: { skillId },
    });
    expect(execucoesSalvas).toHaveLength(1);

    const auditLogs = await prisma.auditLog.findMany({
      where: { empresaId: empresaA.empresa.id },
    });
    expect(
      auditLogs.filter((log) => log.acao === 'skill_execucao'),
    ).toHaveLength(1);

    // Isolamento: o usuário da empresa B não consegue acessar agente/skill da empresa A
    await request(app.getHttpServer())
      .post(`/agentes/${agenteId}/skills`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({
        nome: 'X',
        objetivo: 'Y',
        camposSaida: [{ nome: 'a', tipo: 'string', obrigatorio: true }],
      })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/skills/${skillId}/execucoes`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({ entrada: 'qualquer coisa' })
      .expect(404);

    // A lista de agentes da empresa B nunca inclui o agente da empresa A
    const moduloRespostaB = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .send({ nome: 'Compras B', objetivo: 'Compras da empresa B' })
      .expect(201);
    const listaAgentesB = await request(app.getHttpServer())
      .get(`/modulos/${moduloRespostaB.body.id}/agentes`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(200);
    expect(
      (listaAgentesB.body as Array<{ id: string }>).some(
        (a) => a.id === agenteId,
      ),
    ).toBe(false);
  });
});
