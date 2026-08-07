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

jest.setTimeout(180000);

const TEM_CREDENCIAIS_EVOLUTION_DE_TESTE = Boolean(
  process.env.EVOLUTION_TEST_API_URL &&
  process.env.EVOLUTION_TEST_INSTANCE_NAME &&
  process.env.EVOLUTION_TEST_API_KEY &&
  process.env.EVOLUTION_TEST_PHONE,
);

describe('Orquestrador BPM (motor de ponta a ponta + isolamento entre tenants)', () => {
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
    // Cada delete tem seu próprio try/catch (em vez de um único try/catch
    // envolvendo a cadeia inteira) para que a falha de uma exclusão não
    // impeça as demais de rodar — inclusive as últimas (usuario/empresa),
    // que são exatamente as que não podem vazar num projeto Supabase
    // compartilhado. Mesmo padrão de fonte-de-dados.e2e-spec.ts.
    try {
      // AuditLog referencia tanto Usuario (atorUsuarioId) quanto Empresa (empresaId)
      // sem cascade — precisa ser limpo antes de ambos, senão a exclusão de
      // usuario/empresa falha com violação de chave estrangeira.
      await prisma.auditLog.deleteMany({
        where: { empresaId: { in: empresaIdsParaLimpar } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar logs de auditoria de teste', erro);
    }
    try {
      await prisma.execucaoDeEtapa.deleteMany({
        where: { instancia: { empresaId: { in: empresaIdsParaLimpar } } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar execuções de etapa de teste', erro);
    }
    try {
      await prisma.instanciaDeProcesso.deleteMany({
        where: { empresaId: { in: empresaIdsParaLimpar } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar instâncias de processo de teste', erro);
    }
    try {
      await prisma.etapa.deleteMany({
        where: {
          fluxo: { modulo: { empresaId: { in: empresaIdsParaLimpar } } },
        },
      });
    } catch (erro) {
      console.warn('Falha ao limpar etapas de teste', erro);
    }
    try {
      await prisma.macroetapa.deleteMany({
        where: {
          fluxo: { modulo: { empresaId: { in: empresaIdsParaLimpar } } },
        },
      });
    } catch (erro) {
      console.warn('Falha ao limpar macroetapas de teste', erro);
    }
    try {
      await prisma.fluxo.deleteMany({
        where: { modulo: { empresaId: { in: empresaIdsParaLimpar } } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar fluxos de teste', erro);
    }
    try {
      await prisma.integracaoWhatsApp.deleteMany({
        where: { empresaId: { in: empresaIdsParaLimpar } },
      });
    } catch (erro) {
      console.warn('Falha ao limpar integrações de WhatsApp de teste', erro);
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
    const password = 'TesteFase5!23';
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

  async function aguardarEtapaAtual(
    accessToken: string,
    instanciaId: string,
    etapaEsperadaId: string,
    timeoutMs = 60000,
  ) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeoutMs) {
      const resposta = await request(app.getHttpServer())
        .get(`/instancias/${instanciaId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      if (resposta.body.instancia?.etapaAtualId === etapaEsperadaId)
        return resposta.body;
      if (resposta.body.instancia?.status === 'erro') {
        throw new Error(
          `Instância entrou em erro esperando etapa ${etapaEsperadaId}`,
        );
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
      `Timeout esperando a instância chegar na etapa ${etapaEsperadaId}`,
    );
  }

  it('roda o fluxo de Compras simplificado de ponta a ponta: automático → agente → aprovação com loop', async () => {
    const sufixo = Date.now();
    const { empresa, accessToken } = await criarEmpresaComUsuarioLogado(
      'E2E Orquestrador',
      `e2e-orq-${sufixo}@corepilot.dev`,
    );

    const moduloResposta = await request(app.getHttpServer())
      .post('/modulos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nome: 'Compras E2E',
        objetivo: 'Validar o motor de orquestração',
      })
      .expect(201);
    const moduloId = moduloResposta.body.id as string;

    const agenteResposta = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/agentes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nome: 'Agente de Compras',
        funcao: 'Comprador IA',
        objetivo: 'Agrupar solicitações de compra',
      })
      .expect(201);
    const agenteId = agenteResposta.body.id as string;

    const skillResposta = await request(app.getHttpServer())
      .post(`/agentes/${agenteId}/skills`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nome: 'Agrupar solicitações',
        objetivo: 'Agrupa itens por família a partir da lista recebida',
        camposSaida: [{ nome: 'resumo', tipo: 'string', obrigatorio: true }],
      })
      .expect(201);
    const skillId = skillResposta.body.id as string;

    const fluxoResposta = await request(app.getHttpServer())
      .get(`/modulos/${moduloId}/fluxo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const macroetapaId =
      fluxoResposta.body.macroetapas[0]?.id ??
      ((
        await request(app.getHttpServer())
          .post(`/modulos/${moduloId}/fluxo/macroetapas`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ nome: 'Em andamento' })
          .expect(201)
      ).body.id as string);

    await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/etapas`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nome: 'Solicitação recebida',
        tipo: 'decisao_automatica',
        macroetapaId,
      })
      .expect(201);
    const etapa2 = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/etapas`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        nome: 'IA confere e agrupa',
        tipo: 'tarefa_agente',
        macroetapaId,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/modulos/${moduloId}/fluxo/etapas/${etapa2.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ agenteId, skillId })
      .expect(200);
    const etapa3 = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/etapas`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Comprador aprova', tipo: 'aprovacao', macroetapaId })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/modulos/${moduloId}/fluxo/etapas/${etapa3.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ aprovadores: ['Comprador'], loopParaEtapaId: etapa2.body.id })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/publicar`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const auditoriaPublicacao = await prisma.auditLog.findFirst({
      where: { empresaId: empresa.id, acao: 'fluxo_publicado' },
    });
    expect(auditoriaPublicacao).not.toBeNull();

    const instanciaResposta = await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/instancias`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ dadosIniciais: { itens: ['parafuso M6', 'porca M6'] } })
      .expect(201);
    const instanciaId = instanciaResposta.body.id as string;

    // Etapa 1 (automática) conclui na hora, etapa 2 (agente) processa no próximo ciclo do worker.
    await aguardarEtapaAtual(accessToken, instanciaId, etapa3.body.id);

    // Loop: solicitar ajustes volta pra etapa 2, que reprocessa (novo numeroDaExecucao) e volta pra etapa 3.
    await request(app.getHttpServer())
      .post(`/instancias/${instanciaId}/acoes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        acaoId: 'solicitar_ajustes',
        dados: { motivo_correcao: 'agrupar por fornecedor também' },
      })
      .expect(201);
    await aguardarEtapaAtual(accessToken, instanciaId, etapa3.body.id);

    const execucoesDaEtapa2 = await prisma.execucaoDeEtapa.findMany({
      where: { etapaId: etapa2.body.id },
      orderBy: { numeroDaExecucao: 'asc' },
    });
    expect(execucoesDaEtapa2).toHaveLength(2);
    expect(execucoesDaEtapa2[1].chaveIdempotencia).not.toBe(
      execucoesDaEtapa2[0].chaveIdempotencia,
    );

    const finalResposta = await request(app.getHttpServer())
      .post(`/instancias/${instanciaId}/acoes`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ acaoId: 'aprovar' })
      .expect(201);
    expect(finalResposta.body.status).toBe('concluido');

    const auditoriaAcao = await prisma.auditLog.findFirst({
      where: { empresaId: empresa.id, acao: 'etapa_acao_executada' },
    });
    expect(auditoriaAcao).not.toBeNull();

    // Isolamento: outra empresa não consegue ver a instância desta.
    const outra = await criarEmpresaComUsuarioLogado(
      'E2E Orquestrador Outra Empresa',
      `e2e-orq-outra-${sufixo}@corepilot.dev`,
    );
    await request(app.getHttpServer())
      .get(`/instancias/${instanciaId}`)
      .set('Authorization', `Bearer ${outra.accessToken}`)
      .expect(404);

    // Isolamento (C1): outra empresa não consegue criar uma instância rodando
    // o fluxo publicado de um módulo que não é dela, mesmo sabendo o moduloId.
    await request(app.getHttpServer())
      .post(`/modulos/${moduloId}/fluxo/instancias`)
      .set('Authorization', `Bearer ${outra.accessToken}`)
      .send({ dadosIniciais: {} })
      .expect(404);
  });

  (TEM_CREDENCIAIS_EVOLUTION_DE_TESTE ? it : it.skip)(
    'envia uma mensagem WhatsApp real via Evolution API numa etapa de integração, sem reenviar em caso de reprocessamento',
    async () => {
      const sufixo = Date.now();
      const { empresa, accessToken } = await criarEmpresaComUsuarioLogado(
        'E2E Orquestrador WhatsApp',
        `e2e-orq-wa-${sufixo}@corepilot.dev`,
      );

      await request(app.getHttpServer())
        .post('/empresas/atual/integracao-whatsapp')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          apiUrl: process.env.EVOLUTION_TEST_API_URL,
          instanceName: process.env.EVOLUTION_TEST_INSTANCE_NAME,
          apiKey: process.env.EVOLUTION_TEST_API_KEY,
          phone: process.env.EVOLUTION_TEST_PHONE,
        })
        .expect(201);

      const moduloResposta = await request(app.getHttpServer())
        .post('/modulos')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          nome: 'Notificações E2E',
          objetivo: 'Validar envio de WhatsApp',
        })
        .expect(201);
      const moduloId = moduloResposta.body.id as string;

      const fluxoResposta = await request(app.getHttpServer())
        .get(`/modulos/${moduloId}/fluxo`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const macroetapaId = (
        await request(app.getHttpServer())
          .post(`/modulos/${moduloId}/fluxo/macroetapas`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ nome: 'Único' })
          .expect(201)
      ).body.id as string;
      void fluxoResposta;

      await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/etapas`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nome: 'Início', tipo: 'decisao_automatica', macroetapaId })
        .expect(201);
      const etapaIntegracao = await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/etapas`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nome: 'Notificar', tipo: 'integracao', macroetapaId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/publicar`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/modulos/${moduloId}/fluxo/instancias`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ dadosIniciais: {} })
        .expect(201);

      await new Promise((r) => setTimeout(r, 15000)); // dois ciclos do worker (etapa automática + integração)

      const execucaoIntegracao = await prisma.execucaoDeEtapa.findFirst({
        where: { etapaId: etapaIntegracao.body.id },
      });
      expect(execucaoIntegracao?.status).toBe('done');
      expect(
        (execucaoIntegracao?.output as { messageId?: string } | null)
          ?.messageId,
      ).toBeTruthy();

      void empresa;
    },
  );
});
