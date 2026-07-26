import { FonteDeDadosController } from './fonte-de-dados.controller';
import type { FonteDeDadosService } from './fonte-de-dados.service';
import type { TenantContext } from '../auth/tenant-context';

describe('FonteDeDadosController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
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
    const controller = new FonteDeDadosController(service, buildTenantContext());

    const resultado = await controller.criar(dtoValido);

    expect(service.create).toHaveBeenCalledWith('empresa-1', dtoValido);
    expect(resultado.configuracao).not.toHaveProperty('senhaCriptografada');
  });

  it('rejeita quando falta um campo obrigatório', async () => {
    const service = { create: jest.fn() } as unknown as FonteDeDadosService;
    const controller = new FonteDeDadosController(service, buildTenantContext());

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
    const controller = new FonteDeDadosController(service, buildTenantContext());

    const resultado = await controller.listar();

    expect(resultado[0].configuracao).not.toHaveProperty('senhaCriptografada');
  });
});
