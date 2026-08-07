import { BadRequestException } from '@nestjs/common';
import { EmpresaService } from './empresa.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('EmpresaService', () => {
  function buildArquivo(
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File {
    return {
      buffer: Buffer.from('fake-image-bytes'),
      mimetype: 'image/png',
      size: 16,
      ...overrides,
    } as Express.Multer.File;
  }

  it('converte logoData/logoContentType em data URL', () => {
    const service = new EmpresaService({} as PrismaService);

    const resultado = service.toEmpresaResumo({
      id: 'empresa-1',
      nome: 'Empresa A',
      razaoSocial: 'Empresa A Ltda',
      logoData: Buffer.from('abc'),
      logoContentType: 'image/png',
    });

    expect(resultado).toEqual({
      id: 'empresa-1',
      nome: 'Empresa A',
      razaoSocial: 'Empresa A Ltda',
      logoDataUrl: `data:image/png;base64,${Buffer.from('abc').toString('base64')}`,
    });
  });

  it('retorna logoDataUrl nulo quando a empresa não tem logo', () => {
    const service = new EmpresaService({} as PrismaService);

    const resultado = service.toEmpresaResumo({
      id: 'empresa-1',
      nome: 'Empresa A',
      razaoSocial: null,
      logoData: null,
      logoContentType: null,
    });

    expect(resultado.logoDataUrl).toBeNull();
  });

  it('rejeita quando nenhum arquivo é enviado', async () => {
    const service = new EmpresaService({} as PrismaService);

    await expect(service.atualizarLogo('empresa-1', undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejeita tipo de arquivo não suportado', async () => {
    const service = new EmpresaService({} as PrismaService);

    await expect(
      service.atualizarLogo(
        'empresa-1',
        buildArquivo({ mimetype: 'application/pdf' }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita arquivo acima de 2MB', async () => {
    const service = new EmpresaService({} as PrismaService);

    await expect(
      service.atualizarLogo(
        'empresa-1',
        buildArquivo({ size: 3 * 1024 * 1024 }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('grava logoData/logoContentType e retorna a empresa atualizada', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'empresa-1',
      nome: 'Empresa A',
      razaoSocial: null,
      logoData: Buffer.from('fake-image-bytes'),
      logoContentType: 'image/png',
    });
    const prisma = { empresa: { update } } as unknown as PrismaService;
    const service = new EmpresaService(prisma);

    const resultado = await service.atualizarLogo('empresa-1', buildArquivo());

    expect(update).toHaveBeenCalledWith({
      where: { id: 'empresa-1' },
      data: {
        logoData: Buffer.from('fake-image-bytes'),
        logoContentType: 'image/png',
      },
    });
    expect(resultado.logoDataUrl).toBe(
      `data:image/png;base64,${Buffer.from('fake-image-bytes').toString('base64')}`,
    );
  });

  it('atualiza nome e razão social', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'empresa-1',
      nome: 'Grupo LFG Agro',
      razaoSocial: 'LFG Agronegócios Ltda',
      logoData: null,
      logoContentType: null,
    });
    const prisma = { empresa: { update } } as unknown as PrismaService;
    const service = new EmpresaService(prisma);

    const resultado = await service.atualizarDados('empresa-1', {
      nome: 'Grupo LFG Agro',
      razaoSocial: 'LFG Agronegócios Ltda',
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'empresa-1' },
      data: { nome: 'Grupo LFG Agro', razaoSocial: 'LFG Agronegócios Ltda' },
    });
    expect(resultado).toEqual({
      id: 'empresa-1',
      nome: 'Grupo LFG Agro',
      razaoSocial: 'LFG Agronegócios Ltda',
      logoDataUrl: null,
    });
  });

  it('permite limpar a razão social enviando string vazia', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'empresa-1',
      nome: 'Empresa A',
      razaoSocial: null,
      logoData: null,
      logoContentType: null,
    });
    const prisma = { empresa: { update } } as unknown as PrismaService;
    const service = new EmpresaService(prisma);

    await service.atualizarDados('empresa-1', { razaoSocial: '  ' });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'empresa-1' },
      data: { nome: undefined, razaoSocial: null },
    });
  });

  it('rejeita nome vazio', async () => {
    const service = new EmpresaService({} as PrismaService);

    await expect(
      service.atualizarDados('empresa-1', { nome: '   ' }),
    ).rejects.toThrow(BadRequestException);
  });
});
