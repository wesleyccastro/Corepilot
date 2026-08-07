import { FonteDeDadosController } from './fonte-de-dados.controller';
import type { FonteDeDadosService } from './fonte-de-dados.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContext } from '../auth/tenant-context';

describe('FonteDeDadosController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  function buildAudit(): AuditService {
    return { record: jest.fn() } as unknown as AuditService;
  }

  const dtoValido = {
    tipo: 'totvs_rm',
    nome: 'RM Produção',
    serverUrl: 'http://servidor:8051',
    username: 'admin',
    senha: 'segredo',
    codSistema: 'T',
    codColigada: '1',
  };

  it('cria uma fonte de dados e nunca devolve a senha criptografada na resposta', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({
        id: 'fonte-1',
        configuracao: {
          serverUrl: 'http://servidor:8051',
          username: 'admin',
          senhaCriptografada: 'xxx',
          codSistema: 'T',
          codColigada: '1',
        },
      }),
    } as unknown as FonteDeDadosService;
    const controller = new FonteDeDadosController(
      service,
      buildAudit(),
      buildTenantContext(),
    );

    const resultado = await controller.criar(dtoValido);

    expect(service.create).toHaveBeenCalledWith('empresa-1', dtoValido);
    expect(resultado.configuracao).not.toHaveProperty('senhaCriptografada');
  });

  it('rejeita quando falta um campo obrigatório', async () => {
    const service = { create: jest.fn() } as unknown as FonteDeDadosService;
    const controller = new FonteDeDadosController(
      service,
      buildAudit(),
      buildTenantContext(),
    );

    await expect(controller.criar({ ...dtoValido, senha: '' })).rejects.toThrow(
      'tipo, nome, serverUrl, username, senha, codSistema e codColigada são obrigatórios',
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista fontes de dados sem expor a senha criptografada', async () => {
    const service = {
      findAllByEmpresa: jest.fn().mockResolvedValue([
        {
          id: 'fonte-1',
          configuracao: {
            serverUrl: 'x',
            username: 'y',
            senhaCriptografada: 'zzz',
            codSistema: 'T',
            codColigada: '1',
          },
        },
      ]),
    } as unknown as FonteDeDadosService;
    const controller = new FonteDeDadosController(
      service,
      buildAudit(),
      buildTenantContext(),
    );

    const resultado = await controller.listar();

    expect(resultado[0].configuracao).not.toHaveProperty('senhaCriptografada');
  });

  describe('atualizar', () => {
    it('atualiza e nunca devolve a senha criptografada, nem audita a senha em texto plano', async () => {
      const service = {
        update: jest.fn().mockResolvedValue({
          id: 'fonte-1',
          nome: 'RM Novo',
          configuracao: {
            serverUrl: 'http://novo:8051',
            username: 'admin',
            senhaCriptografada: 'xxx',
            codSistema: 'T',
            codColigada: '1',
          },
        }),
      } as unknown as FonteDeDadosService;
      const audit = buildAudit();
      const controller = new FonteDeDadosController(
        service,
        audit,
        buildTenantContext(),
      );

      const resultado = await controller.atualizar('fonte-1', {
        nome: 'RM Novo',
        senha: 'nova-senha',
      });

      expect(service.update).toHaveBeenCalledWith('fonte-1', 'empresa-1', {
        nome: 'RM Novo',
        senha: 'nova-senha',
      });
      expect(resultado.configuracao).not.toHaveProperty('senhaCriptografada');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          empresaId: 'empresa-1',
          atorUsuarioId: 'usuario-1',
          acao: 'fonte_de_dados_atualizada',
        }),
      );
      const dadosDepois = (audit.record as jest.Mock).mock.calls[0][0]
        .dadosDepois as Record<string, unknown>;
      expect(dadosDepois).not.toHaveProperty('senha');
      expect(JSON.stringify(dadosDepois)).not.toContain('nova-senha');
      expect(dadosDepois.senhaAlterada).toBe(true);
    });
  });
});
