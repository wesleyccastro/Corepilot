import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('conecta ao inicializar e desconecta ao destruir o módulo', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    const prisma = moduleRef.get(PrismaService);
    const connectSpy = jest.spyOn(prisma, '$connect').mockResolvedValue();
    const disconnectSpy = jest.spyOn(prisma, '$disconnect').mockResolvedValue();

    await moduleRef.init();
    expect(connectSpy).toHaveBeenCalledTimes(1);

    await moduleRef.close();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
