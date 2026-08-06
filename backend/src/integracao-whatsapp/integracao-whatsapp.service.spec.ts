import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { IntegracaoWhatsAppService } from './integracao-whatsapp.service';
import { criptografar, descriptografar } from '../fonte-de-dados/crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { EvolutionApiAdapterService } from './evolution-api-adapter.service';

describe('IntegracaoWhatsAppService', () => {
  const CHAVE = 'a'.repeat(64);

  function buildDeps() {
    const prisma = {
      integracaoWhatsApp: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;
    const config = { getOrThrow: jest.fn().mockReturnValue(CHAVE) } as unknown as ConfigService;
    const evolutionApi = { testarConexao: jest.fn() } as unknown as EvolutionApiAdapterService;
    return { prisma, config, evolutionApi };
  }

  it('salva a integração com a apiKey criptografada, nunca em texto plano', async () => {
    const { prisma, config, evolutionApi } = buildDeps();
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.integracaoWhatsApp.upsert as jest.Mock).mockImplementation(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve({ id: 'wa-1', ...create }),
    );
    const service = new IntegracaoWhatsAppService(prisma, config, evolutionApi);

    const resultado = await service.salvar('empresa-1', { apiUrl: 'https://x.com', instanceName: 'corepilot', apiKey: 'segredo' });

    expect(resultado.apiKeyCriptografada).not.toBe('segredo');
    expect(descriptografar(resultado.apiKeyCriptografada as string, CHAVE)).toBe('segredo');
  });

  it('reaproveita a apiKeyCriptografada existente ao atualizar sem enviar apiKey', async () => {
    const { prisma, config, evolutionApi } = buildDeps();
    const apiKeyCriptografadaExistente = criptografar('chave-atual', CHAVE);
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue({
      empresaId: 'empresa-1',
      apiUrl: 'https://x.com',
      instanceName: 'corepilot',
      apiKeyCriptografada: apiKeyCriptografadaExistente,
    });
    (prisma.integracaoWhatsApp.upsert as jest.Mock).mockImplementation(({ update }: { update: Record<string, unknown> }) =>
      Promise.resolve({ id: 'wa-1', ...update }),
    );
    const service = new IntegracaoWhatsAppService(prisma, config, evolutionApi);

    await service.salvar('empresa-1', { apiUrl: 'https://novo.com', instanceName: 'corepilot' });

    expect(prisma.integracaoWhatsApp.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ apiKeyCriptografada: apiKeyCriptografadaExistente }),
      }),
    );
  });

  it('rejeita salvar sem apiKey quando ainda não existe configuração', async () => {
    const { prisma, config, evolutionApi } = buildDeps();
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new IntegracaoWhatsAppService(prisma, config, evolutionApi);

    await expect(service.salvar('empresa-1', { apiUrl: 'https://x.com', instanceName: 'corepilot' })).rejects.toThrow(BadRequestException);
  });

  it('testar lança NotFoundException se a integração ainda não foi configurada', async () => {
    const { prisma, config, evolutionApi } = buildDeps();
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue(null);
    const service = new IntegracaoWhatsAppService(prisma, config, evolutionApi);

    await expect(service.testar('empresa-1')).rejects.toThrow(NotFoundException);
  });

  it('testar grava sucesso quando a Evolution API confirma conexão', async () => {
    const { prisma, config, evolutionApi } = buildDeps();
    (prisma.integracaoWhatsApp.findUnique as jest.Mock).mockResolvedValue({ empresaId: 'empresa-1', apiUrl: 'https://x.com', instanceName: 'corepilot', apiKeyCriptografada: criptografar('chave-123', CHAVE) });
    (evolutionApi.testarConexao as jest.Mock).mockResolvedValue({ conectado: true, estado: 'open' });
    (prisma.integracaoWhatsApp.update as jest.Mock).mockResolvedValue({ ultimoTesteSucesso: true });
    const service = new IntegracaoWhatsAppService(prisma, config, evolutionApi);

    await service.testar('empresa-1');

    expect(prisma.integracaoWhatsApp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ultimoTesteSucesso: true, ultimaMensagemErro: null }) }),
    );
  });
});
