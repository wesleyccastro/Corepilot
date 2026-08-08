import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ConectorService } from './conector.service';
import { criptografar, descriptografar } from '../fonte-de-dados/crypto';
import type { PrismaService } from '../prisma/prisma.service';
import type { GoogleConectorProvider } from './providers/google-conector.provider';

describe('ConectorService', () => {
  const CHAVE_CRIPTO = 'a'.repeat(64);
  const SEGREDO_STATE = 'segredo-de-teste';

  function buildDeps() {
    const prisma = {
      conectorConexao: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
    } as unknown as PrismaService;
    const config = {
      getOrThrow: jest.fn((chave: string) =>
        chave === 'CONECTOR_STATE_SECRET' ? SEGREDO_STATE : CHAVE_CRIPTO,
      ),
    } as unknown as ConfigService;
    const googleProvider = {
      montarUrlAutorizacao: jest.fn(
        (state: string) =>
          `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
      ),
      trocarCodigoPorToken: jest.fn(),
      renovarToken: jest.fn(),
      revogarToken: jest.fn(),
    } as unknown as GoogleConectorProvider;
    return { prisma, config, googleProvider };
  }

  function extrairStateDaUrl(url: string): string {
    return new URL(url).searchParams.get('state') ?? '';
  }

  describe('iniciar', () => {
    it('lança NotFoundException para um provider não suportado', () => {
      const { prisma, config, googleProvider } = buildDeps();
      const service = new ConectorService(prisma, config, googleProvider);

      expect(() =>
        service.iniciar('provider-inexistente', 'usuario-1', 'empresa-1'),
      ).toThrow(NotFoundException);
    });

    it('devolve a URL de autorização do provider com um state assinado', () => {
      const { prisma, config, googleProvider } = buildDeps();
      const service = new ConectorService(prisma, config, googleProvider);

      const url = service.iniciar('google', 'usuario-1', 'empresa-1');

      expect(googleProvider.montarUrlAutorizacao).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    });
  });

  describe('processarCallback', () => {
    it('rejeita um state cujo provider não bate com o provider da rota', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      const service = new ConectorService(prisma, config, googleProvider);
      const url = service.iniciar('google', 'usuario-1', 'empresa-1');
      const state = extrairStateDaUrl(url);

      await expect(
        service.processarCallback('outro-provider', 'codigo', state),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejeita um state adulterado', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      const service = new ConectorService(prisma, config, googleProvider);
      const url = service.iniciar('google', 'usuario-1', 'empresa-1');
      const state = extrairStateDaUrl(url);

      await expect(
        service.processarCallback('google', 'codigo', `${state}adulterado`),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('troca o código por token, criptografa e faz upsert da conexão', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (googleProvider.trocarCodigoPorToken as jest.Mock).mockResolvedValue({
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        expiraEm: new Date('2026-01-01T00:00:00Z'),
        escopos: ['drive.readonly'],
        contaExterna: 'fulano@gmail.com',
      });
      const service = new ConectorService(prisma, config, googleProvider);
      const url = service.iniciar('google', 'usuario-1', 'empresa-1');
      const state = extrairStateDaUrl(url);

      const resultado = await service.processarCallback(
        'google',
        'codigo-de-autorizacao',
        state,
      );

      expect(resultado).toEqual({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
      });
      expect(googleProvider.trocarCodigoPorToken).toHaveBeenCalledWith(
        'codigo-de-autorizacao',
      );
      expect(prisma.conectorConexao.upsert).toHaveBeenCalledTimes(1);
      const chamada = (prisma.conectorConexao.upsert as jest.Mock).mock
        .calls[0][0] as {
        where: { usuarioId_empresaId_provider: Record<string, string> };
        create: Record<string, unknown>;
      };
      expect(chamada.where.usuarioId_empresaId_provider).toEqual({
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        provider: 'google',
      });
      expect(chamada.create.contaExterna).toBe('fulano@gmail.com');
      expect(
        descriptografar(
          chamada.create.accessTokenCriptografado as string,
          CHAVE_CRIPTO,
        ),
      ).toBe('access-123');
      expect(
        descriptografar(
          chamada.create.refreshTokenCriptografado as string,
          CHAVE_CRIPTO,
        ),
      ).toBe('refresh-123');
    });

    it('mantém o refresh token antigo quando o provider não devolve um novo na atualização', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (googleProvider.trocarCodigoPorToken as jest.Mock).mockResolvedValue({
        accessToken: 'access-novo',
        refreshToken: undefined,
        escopos: ['drive.readonly'],
      });
      const service = new ConectorService(prisma, config, googleProvider);
      const url = service.iniciar('google', 'usuario-1', 'empresa-1');
      const state = extrairStateDaUrl(url);

      await service.processarCallback('google', 'codigo', state);

      const chamada = (prisma.conectorConexao.upsert as jest.Mock).mock
        .calls[0][0] as { update: Record<string, unknown> };
      expect(chamada.update.refreshTokenCriptografado).toBeUndefined();
    });

    it('rejeita a reutilização do mesmo state (replay)', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (googleProvider.trocarCodigoPorToken as jest.Mock).mockResolvedValue({
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        expiraEm: new Date('2026-01-01T00:00:00Z'),
        escopos: ['drive.readonly'],
        contaExterna: 'fulano@gmail.com',
      });
      const service = new ConectorService(prisma, config, googleProvider);
      const url = service.iniciar('google', 'usuario-1', 'empresa-1');
      const state = extrairStateDaUrl(url);

      await service.processarCallback('google', 'codigo', state);

      await expect(
        service.processarCallback('google', 'codigo', state),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('listar', () => {
    it('lista as conexões do usuário na empresa, sem devolver os tokens', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (prisma.conectorConexao.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'conexao-1',
          usuarioId: 'usuario-1',
          empresaId: 'empresa-1',
          provider: 'google',
          contaExterna: 'fulano@gmail.com',
          accessTokenCriptografado: 'iv:tag:cifrado',
          refreshTokenCriptografado: 'iv:tag:cifrado',
          escopos: ['drive.readonly'],
        },
      ]);
      const service = new ConectorService(prisma, config, googleProvider);

      const resultado = await service.listar('usuario-1', 'empresa-1');

      expect(prisma.conectorConexao.findMany).toHaveBeenCalledWith({
        where: { usuarioId: 'usuario-1', empresaId: 'empresa-1' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(resultado[0]).not.toHaveProperty('accessTokenCriptografado');
      expect(resultado[0]).not.toHaveProperty('refreshTokenCriptografado');
      expect(resultado[0]).toMatchObject({
        id: 'conexao-1',
        provider: 'google',
        contaExterna: 'fulano@gmail.com',
      });
    });
  });

  describe('desconectar', () => {
    it('apaga a conexão escopada por usuário, empresa e provider', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (prisma.conectorConexao.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new ConectorService(prisma, config, googleProvider);

      await service.desconectar('google', 'usuario-1', 'empresa-1');

      expect(prisma.conectorConexao.deleteMany).toHaveBeenCalledWith({
        where: {
          usuarioId: 'usuario-1',
          empresaId: 'empresa-1',
          provider: 'google',
        },
      });
    });

    it('revoga o refresh token (descriptografado) no provider quando a conexão tem um', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (prisma.conectorConexao.findUnique as jest.Mock).mockResolvedValue({
        id: 'conexao-1',
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        provider: 'google',
        accessTokenCriptografado: criptografar('access-123', CHAVE_CRIPTO),
        refreshTokenCriptografado: criptografar('refresh-123', CHAVE_CRIPTO),
      });
      const service = new ConectorService(prisma, config, googleProvider);

      await service.desconectar('google', 'usuario-1', 'empresa-1');

      expect(googleProvider.revogarToken).toHaveBeenCalledWith('refresh-123');
      expect(prisma.conectorConexao.deleteMany).toHaveBeenCalledWith({
        where: {
          usuarioId: 'usuario-1',
          empresaId: 'empresa-1',
          provider: 'google',
        },
      });
    });

    it('revoga o access token (descriptografado) quando não há refresh token', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (prisma.conectorConexao.findUnique as jest.Mock).mockResolvedValue({
        id: 'conexao-1',
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        provider: 'google',
        accessTokenCriptografado: criptografar('access-123', CHAVE_CRIPTO),
        refreshTokenCriptografado: null,
      });
      const service = new ConectorService(prisma, config, googleProvider);

      await service.desconectar('google', 'usuario-1', 'empresa-1');

      expect(googleProvider.revogarToken).toHaveBeenCalledWith('access-123');
      expect(prisma.conectorConexao.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('ainda apaga a conexão local mesmo quando a revogação no provider falha (best-effort)', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (prisma.conectorConexao.findUnique as jest.Mock).mockResolvedValue({
        id: 'conexao-1',
        usuarioId: 'usuario-1',
        empresaId: 'empresa-1',
        provider: 'google',
        accessTokenCriptografado: criptografar('access-123', CHAVE_CRIPTO),
        refreshTokenCriptografado: criptografar('refresh-123', CHAVE_CRIPTO),
      });
      (googleProvider.revogarToken as jest.Mock).mockRejectedValue(
        new Error('Google indisponível'),
      );
      const service = new ConectorService(prisma, config, googleProvider);

      await expect(
        service.desconectar('google', 'usuario-1', 'empresa-1'),
      ).resolves.not.toThrow();

      expect(prisma.conectorConexao.deleteMany).toHaveBeenCalledWith({
        where: {
          usuarioId: 'usuario-1',
          empresaId: 'empresa-1',
          provider: 'google',
        },
      });
    });

    it('não tenta revogar quando não existe conexão, mas ainda assim apaga', async () => {
      const { prisma, config, googleProvider } = buildDeps();
      (prisma.conectorConexao.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new ConectorService(prisma, config, googleProvider);

      await service.desconectar('google', 'usuario-1', 'empresa-1');

      expect(googleProvider.revogarToken).not.toHaveBeenCalled();
      expect(prisma.conectorConexao.deleteMany).toHaveBeenCalledWith({
        where: {
          usuarioId: 'usuario-1',
          empresaId: 'empresa-1',
          provider: 'google',
        },
      });
    });
  });
});
