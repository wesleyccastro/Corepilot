import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { criptografar, descriptografar } from '../fonte-de-dados/crypto';
import { EvolutionApiAdapterService } from './evolution-api-adapter.service';
import type { SalvarIntegracaoWhatsAppDto } from './dto/salvar-integracao-whatsapp.dto';

@Injectable()
export class IntegracaoWhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly evolutionApi: EvolutionApiAdapterService,
  ) {}

  async buscar(empresaId: string) {
    return this.prisma.integracaoWhatsApp.findUnique({ where: { empresaId } });
  }

  async salvar(empresaId: string, dto: SalvarIntegracaoWhatsAppDto) {
    const existente = await this.prisma.integracaoWhatsApp.findUnique({
      where: { empresaId },
    });
    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');
    const apiKeyCriptografada = dto.apiKey
      ? criptografar(dto.apiKey, chave)
      : existente?.apiKeyCriptografada;
    if (!apiKeyCriptografada) {
      throw new BadRequestException(
        'apiKey é obrigatória na primeira configuração',
      );
    }

    return this.prisma.integracaoWhatsApp.upsert({
      where: { empresaId },
      create: {
        empresaId,
        apiUrl: dto.apiUrl,
        instanceName: dto.instanceName,
        apiKeyCriptografada,
        phone: dto.phone ?? null,
      },
      update: {
        apiUrl: dto.apiUrl,
        instanceName: dto.instanceName,
        apiKeyCriptografada,
        phone: dto.phone ?? null,
        ultimoTesteEm: null,
        ultimoTesteSucesso: null,
        ultimaMensagemErro: null,
      },
    });
  }

  async testar(empresaId: string) {
    const integracao = await this.prisma.integracaoWhatsApp.findUnique({
      where: { empresaId },
    });
    if (!integracao)
      throw new NotFoundException(
        'Integração de WhatsApp ainda não configurada',
      );

    const chave = this.config.getOrThrow<string>('ERP_ENCRYPTION_KEY');
    try {
      const resultado = await this.evolutionApi.testarConexao({
        apiUrl: integracao.apiUrl,
        instanceName: integracao.instanceName,
        apiKey: descriptografar(integracao.apiKeyCriptografada, chave),
      });
      return this.prisma.integracaoWhatsApp.update({
        where: { empresaId },
        data: {
          ultimoTesteEm: new Date(),
          ultimoTesteSucesso: resultado.conectado,
          ultimaMensagemErro: resultado.conectado
            ? null
            : `Instância não está conectada (estado: ${resultado.estado})`,
        },
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      await this.prisma.integracaoWhatsApp.update({
        where: { empresaId },
        data: {
          ultimoTesteEm: new Date(),
          ultimoTesteSucesso: false,
          ultimaMensagemErro: mensagem,
        },
      });
      throw new UnprocessableEntityException(mensagem);
    }
  }
}
