import { SkillController } from './skill.controller';
import type { SkillService } from './skill.service';
import type { TenantContext } from '../auth/tenant-context';

describe('SkillController', () => {
  function buildTenantContext(): TenantContext {
    return {
      get: () => ({ usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' as const }),
    } as unknown as TenantContext;
  }

  const camposSaida = [{ nome: 'titulo', tipo: 'string' as const, obrigatorio: true }];

  it('cria uma skill no agente informado, na empresa do tenant atual', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'skill-1' }),
    } as unknown as SkillService;
    const controller = new SkillController(service, buildTenantContext());

    const resultado = await controller.criar('agente-1', {
      nome: 'Triagem',
      objetivo: 'Triar solicitações',
      camposSaida,
    });

    expect(service.create).toHaveBeenCalledWith('agente-1', 'empresa-1', {
      nome: 'Triagem',
      objetivo: 'Triar solicitações',
      camposSaida,
    });
    expect(resultado).toEqual({ id: 'skill-1' });
  });

  it('rejeita quando não há pelo menos um campo de saída', async () => {
    const service = { create: jest.fn() } as unknown as SkillService;
    const controller = new SkillController(service, buildTenantContext());

    await expect(
      controller.criar('agente-1', { nome: 'X', objetivo: 'Y', camposSaida: [] }),
    ).rejects.toThrow('nome, objetivo e ao menos um campo de saída são obrigatórios');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('lista skills do agente informado, na empresa do tenant atual', async () => {
    const service = {
      findAllByAgente: jest.fn().mockResolvedValue([{ id: 'skill-1' }]),
    } as unknown as SkillService;
    const controller = new SkillController(service, buildTenantContext());

    const resultado = await controller.listar('agente-1');

    expect(service.findAllByAgente).toHaveBeenCalledWith('agente-1', 'empresa-1');
    expect(resultado).toEqual([{ id: 'skill-1' }]);
  });
});
