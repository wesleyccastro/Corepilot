import { ConectorController } from './conector.controller';
import type { ConectorService } from './conector.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContext } from '../auth/tenant-context';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

describe('ConectorController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        perfil: 'admin' as const,
      }),
    } as unknown as TenantContext;
  }

  function buildResponse(): Response {
    return { redirect: jest.fn() } as unknown as Response;
  }

  function buildDeps() {
    const conectorService = {
      iniciar: jest.fn(),
      processarCallback: jest.fn(),
      listar: jest.fn(),
      desconectar: jest.fn(),
    } as unknown as ConectorService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const config = {
      get: jest.fn().mockReturnValue('http://localhost:5173'),
    } as unknown as ConfigService;
    return { conectorService, audit, config };
  }

  it('listar devolve as conexões escopadas pelo tenant atual', async () => {
    const { conectorService, audit, config } = buildDeps();
    (conectorService.listar as jest.Mock).mockResolvedValue([{ id: 'c1' }]);
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );

    const resultado = await controller.listar();

    expect(conectorService.listar).toHaveBeenCalledWith(
      'usuario-1',
      'empresa-1',
    );
    expect(resultado).toEqual([{ id: 'c1' }]);
  });

  it('iniciar devolve a URL de autorização do provider', () => {
    const { conectorService, audit, config } = buildDeps();
    (conectorService.iniciar as jest.Mock).mockReturnValue(
      'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
    );
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );

    const resultado = controller.iniciar('google');

    expect(conectorService.iniciar).toHaveBeenCalledWith(
      'google',
      'usuario-1',
      'empresa-1',
    );
    expect(resultado).toEqual({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
    });
  });

  it('callback processa com sucesso, audita e redireciona pro frontend com status de sucesso', async () => {
    const { conectorService, audit, config } = buildDeps();
    (conectorService.processarCallback as jest.Mock).mockResolvedValue({
      usuarioId: 'usuario-1',
      empresaId: 'empresa-1',
    });
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );
    const res = buildResponse();

    await controller.callback('google', 'codigo', 'state', res);

    expect(conectorService.processarCallback).toHaveBeenCalledWith(
      'google',
      'codigo',
      'state',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'conector_conectado',
        dadosDepois: { provider: 'google' },
      }),
    );
    expect(res.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/?conectores=sucesso',
    );
  });

  it('callback nunca deixa o erro escapar — redireciona pro frontend com status de erro', async () => {
    const { conectorService, audit, config } = buildDeps();
    (conectorService.processarCallback as jest.Mock).mockRejectedValue(
      new Error('state inválido'),
    );
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );
    const res = buildResponse();

    await controller.callback('google', 'codigo', 'state-ruim', res);

    expect(audit.record).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/?conectores=erro',
    );
  });

  it('desconectar remove a conexão e audita', async () => {
    const { conectorService, audit, config } = buildDeps();
    const controller = new ConectorController(
      conectorService,
      audit,
      buildTenantContext(),
      config,
    );

    const resultado = await controller.desconectar('google');

    expect(conectorService.desconectar).toHaveBeenCalledWith(
      'google',
      'usuario-1',
      'empresa-1',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId: 'empresa-1',
        atorUsuarioId: 'usuario-1',
        acao: 'conector_desconectado',
        dadosDepois: { provider: 'google' },
      }),
    );
    expect(resultado).toEqual({ ok: true });
  });
});
