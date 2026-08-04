import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { criptografar } from './crypto';
import type { CreateFonteDeDadosDto } from './dto/create-fonte-de-dados.dto';
import type { UpdateFonteDeDadosDto } from './dto/update-fonte-de-dados.dto';

export interface ConfiguracaoFonteDeDados {
  serverUrl: string;
  username: string;
  senhaCriptografada: string;
  codSistema: string;
  codColigada: string;
}

@Injectable()
export class FonteDeDadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(empresaId: string, dto: CreateFonteDeDadosDto) {
    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');
    const configuracao: ConfiguracaoFonteDeDados = {
      serverUrl: dto.serverUrl,
      username: dto.username,
      senhaCriptografada: criptografar(dto.senha, chave),
      codSistema: dto.codSistema,
      codColigada: dto.codColigada,
    };

    return this.prisma.fonteDeDados.create({
      data: {
        empresaId,
        tipo: dto.tipo,
        nome: dto.nome,
        configuracao: configuracao as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findAllByEmpresa(empresaId: string) {
    return this.prisma.fonteDeDados.findMany({
      where: { empresaId },
      orderBy: { criadoEm: 'desc' },
    });
  }

  async findByIdInEmpresa(fonteDeDadosId: string, empresaId: string) {
    const fonte = await this.prisma.fonteDeDados.findFirst({
      where: { id: fonteDeDadosId, empresaId },
    });

    if (!fonte) {
      throw new NotFoundException('Fonte de dados não encontrada');
    }

    return fonte;
  }

  async update(fonteDeDadosId: string, empresaId: string, dto: UpdateFonteDeDadosDto) {
    const fonte = await this.findByIdInEmpresa(fonteDeDadosId, empresaId);
    const configuracaoAtual = fonte.configuracao as unknown as ConfiguracaoFonteDeDados;

    const configuracao: ConfiguracaoFonteDeDados = {
      serverUrl: dto.serverUrl ?? configuracaoAtual.serverUrl,
      username: dto.username ?? configuracaoAtual.username,
      senhaCriptografada: dto.senha
        ? criptografar(dto.senha, this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY'))
        : configuracaoAtual.senhaCriptografada,
      codSistema: dto.codSistema ?? configuracaoAtual.codSistema,
      codColigada: dto.codColigada ?? configuracaoAtual.codColigada,
    };

    return this.prisma.fonteDeDados.update({
      where: { id: fonteDeDadosId },
      data: {
        nome: dto.nome ?? fonte.nome,
        configuracao: configuracao as unknown as Prisma.InputJsonValue,
        ultimoTesteEm: null,
        ultimoTesteSucesso: null,
        ultimaMensagemErro: null,
      },
    });
  }
}
