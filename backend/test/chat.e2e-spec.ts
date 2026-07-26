import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestUser, deleteTestUser, signInTestUser } from '../src/testing/supabase-admin.helper';
import { provisionUsuarioParaEmpresa } from '../src/testing/provision-usuario.helper';

jest.setTimeout(30000);

describe('Fluxo de chat (módulo real + Anthropic real + isolamento entre tenants)', () => {
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
      await prisma.mensagem.deleteMany({ where: { conversa: { empresaId: { in: empresaIdsParaLimpar } } } });
    } catch (erro) {
      console.warn('Falha ao limpar mensagens de teste', erro);
    }
    try {
      await prisma.conversa.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar conversas de teste', erro);
    }
    try {
      await prisma.modulo.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar módulos de teste', erro);
    }
    try {
      await prisma.auditLog.deleteMany({ where: { empresaId: { in: empresaIdsParaLimpar } } });
    } catch (erro) {
      console.warn('Falha ao limpar audit logs de teste', erro);
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

    const password = 'TesteFase2!23';
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

  function parseNdjson(texto: string): Array<Record<string, unknown>> {
    return texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter((linha) => linha.length > 0)
      .map((linha) => JSON.parse(linha) as Record<string, unknown>);
  }

  it('cria módulo/conversa reais, envia mensagem real à Anthropic, persiste e audita — e nunca vaza entre empresas', async () => {
    const sufixo = Date.now();
    const empresaA = await criarEmpresaComUsuarioLogado('E2E Chat Empresa A', `e2e-chat-a-${sufixo}@corepilot.dev`);
    const empresaB = await criarEmpresaComUsuarioLogado('E2E Chat Empresa B', `e2e-chat-b-${sufixo}@corepilot.dev`);

    const moduloRespostaA = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ nome: 'Compras', objetivo: 'Ajudar o time de compras' })
      .expect(201);
    const moduloId = moduloRespostaA.body.id as string;

    const conversaResposta = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/conversas`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .expect(201);
    const conversaId = conversaResposta.body.id as string;

    const envioResposta = await request(app.getHttpServer())
      .post(`/conversas/${conversaId}/mensagens`)
      .set('Authorization', `Bearer ${empresaA.accessToken}`)
      .send({ conteudo: 'Responda apenas com a palavra OK, nada mais.' })
      .expect(200);

    const eventos = parseNdjson(envioResposta.text);
    expect(eventos.some((evento) => evento.type === 'delta')).toBe(true);
    const eventoFinal = eventos.find((evento) => evento.type === 'done');
    expect(eventoFinal).toBeDefined();
    expect(typeof eventoFinal?.mensagemId).toBe('string');

    const mensagensSalvas = await prisma.mensagem.findMany({ where: { conversaId } });
    expect(mensagensSalvas).toHaveLength(2);
    expect(mensagensSalvas.some((m) => m.papel === 'usuario')).toBe(true);
    expect(mensagensSalvas.some((m) => m.papel === 'agente')).toBe(true);

    const auditLogs = await prisma.auditLog.findMany({ where: { empresaId: empresaA.empresa.id } });
    expect(auditLogs.filter((log) => log.acao === 'chat_mensagem')).toHaveLength(1);

    // Isolamento: o usuário da empresa B não consegue acessar o módulo/conversa da empresa A
    await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/conversas`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/conversas/${conversaId}/mensagens`)
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(404);

    // A lista de módulos da empresa B nunca inclui o módulo da empresa A
    const listaModulosB = await request(app.getHttpServer())
      .get('/modulos')
      .set('Authorization', `Bearer ${empresaB.accessToken}`)
      .expect(200);
    expect((listaModulosB.body as Array<{ id: string }>).some((m) => m.id === moduloId)).toBe(false);
  });
});
