import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CadastroEmpresaService } from './cadastro-empresa.service';
import { EmpresaService } from '../empresa/empresa.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CriarEmpresaDto } from './dto/criar-empresa.dto';

const DTO_VALIDO: CriarEmpresaDto = {
  nome: 'Maria Silva',
  razaoSocial: 'Acme Ltda',
  cnpjCpf: '11.222.333/0001-81',
  segmento: 'Tecnologia',
  uf: 'SP',
  cidade: 'São Paulo',
  whatsapp: '(11) 91234-5678',
};

const JWT_PAYLOAD = { sub: 'sub-1', email: 'maria@acme.com' };

interface DadosCriarEmpresa {
  nome: string;
  razaoSocial: string;
  cnpjCpf: string;
  segmento: string;
  uf: string;
  cidade: string;
  whatsapp: string;
}

interface EmpresaCriada {
  id: string;
  nome: string;
  razaoSocial: string;
  logoData: null;
  logoContentType: null;
}

describe('CadastroEmpresaService', () => {
  function buildTxMocks() {
    const criarEmpresa = jest
      .fn<Promise<EmpresaCriada>, [{ data: DadosCriarEmpresa }]>()
      .mockResolvedValue({
        id: 'empresa-1',
        nome: DTO_VALIDO.razaoSocial,
        razaoSocial: DTO_VALIDO.razaoSocial,
        logoData: null,
        logoContentType: null,
      });
    const criarUsuario = jest.fn().mockResolvedValue({
      id: 'usuario-1',
      nome: DTO_VALIDO.nome,
      email: JWT_PAYLOAD.email,
    });
    const criarUsuarioEmpresa = jest.fn().mockResolvedValue({});

    return { criarEmpresa, criarUsuario, criarUsuarioEmpresa };
  }

  function buildService(overrides?: {
    usuarioExistente?: unknown;
    empresaExistente?: unknown;
    transactionError?: Error;
  }) {
    const findUniqueUsuario = jest
      .fn()
      .mockResolvedValue(overrides?.usuarioExistente ?? null);
    const findUniqueEmpresa = jest
      .fn()
      .mockResolvedValue(overrides?.empresaExistente ?? null);
    const tx = buildTxMocks();

    type Tx = {
      empresa: { create: typeof tx.criarEmpresa };
      usuario: { create: typeof tx.criarUsuario };
      usuarioEmpresa: { create: typeof tx.criarUsuarioEmpresa };
    };

    const transaction = jest
      .fn()
      .mockImplementation((callback: (tx: Tx) => Promise<unknown>) => {
        if (overrides?.transactionError) {
          throw overrides.transactionError;
        }
        return callback({
          empresa: { create: tx.criarEmpresa },
          usuario: { create: tx.criarUsuario },
          usuarioEmpresa: { create: tx.criarUsuarioEmpresa },
        });
      });

    const prisma = {
      usuario: { findUnique: findUniqueUsuario },
      empresa: { findUnique: findUniqueEmpresa },
      $transaction: transaction,
    } as unknown as PrismaService;

    const empresaService = new EmpresaService(prisma);
    const service = new CadastroEmpresaService(prisma, empresaService);

    return { service, findUniqueUsuario, findUniqueEmpresa, transaction, tx };
  }

  it('cria empresa, usuário e vínculo admin quando tudo é válido', async () => {
    const { service, tx } = buildService();

    const resultado = await service.criarParaUsuarioLogado(
      JWT_PAYLOAD,
      DTO_VALIDO,
    );

    const dadosEmpresaCriada = tx.criarEmpresa.mock.calls[0][0].data;
    expect(dadosEmpresaCriada.cnpjCpf).toBe('11222333000181');
    expect(dadosEmpresaCriada.segmento).toBe('Tecnologia');
    expect(dadosEmpresaCriada.uf).toBe('SP');
    expect(dadosEmpresaCriada.cidade).toBe('São Paulo');
    expect(dadosEmpresaCriada.whatsapp).toBe('(11) 91234-5678');
    expect(tx.criarUsuario).toHaveBeenCalledWith({
      data: {
        supabaseUserId: 'sub-1',
        nome: 'Maria Silva',
        email: 'maria@acme.com',
      },
    });
    expect(tx.criarUsuarioEmpresa).toHaveBeenCalledWith({
      data: { usuarioId: 'usuario-1', empresaId: 'empresa-1', perfil: 'admin' },
    });
    expect(resultado.perfil).toBe('admin');
    expect(resultado.usuario).toEqual({
      id: 'usuario-1',
      nome: 'Maria Silva',
      email: 'maria@acme.com',
    });
  });

  it('rejeita quando falta campo obrigatório', async () => {
    const { service, transaction } = buildService();

    await expect(
      service.criarParaUsuarioLogado(JWT_PAYLOAD, {
        ...DTO_VALIDO,
        cidade: '  ',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejeita CNPJ/CPF com dígito verificador inválido', async () => {
    const { service, transaction } = buildService();

    await expect(
      service.criarParaUsuarioLogado(JWT_PAYLOAD, {
        ...DTO_VALIDO,
        cnpjCpf: '11.222.333/0001-00',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejeita token sem e-mail', async () => {
    const { service, transaction } = buildService();

    await expect(
      service.criarParaUsuarioLogado({ sub: 'sub-1' }, DTO_VALIDO),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejeita quando a conta já está associada a uma empresa', async () => {
    const { service, transaction } = buildService({
      usuarioExistente: { id: 'usuario-existente' },
    });

    await expect(
      service.criarParaUsuarioLogado(JWT_PAYLOAD, DTO_VALIDO),
    ).rejects.toThrow(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejeita quando o CNPJ/CPF já está cadastrado em outra empresa', async () => {
    const { service, transaction } = buildService({
      empresaExistente: { id: 'empresa-existente' },
    });

    await expect(
      service.criarParaUsuarioLogado(JWT_PAYLOAD, DTO_VALIDO),
    ).rejects.toThrow(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('converte violação de unicidade concorrente (P2002) em ConflictException', async () => {
    const erroPrisma = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.19.3' },
    );
    const { service } = buildService({ transactionError: erroPrisma });

    await expect(
      service.criarParaUsuarioLogado(JWT_PAYLOAD, DTO_VALIDO),
    ).rejects.toThrow(ConflictException);
  });
});
