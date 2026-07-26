import { PrismaClient } from '@prisma/client';

describe('Prisma smoke test', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('conecta no Postgres e persiste uma Empresa', async () => {
    const empresa = await prisma.empresa.create({ data: { nome: 'Smoke Test Empresa' } });

    const encontrada = await prisma.empresa.findUnique({ where: { id: empresa.id } });
    expect(encontrada?.nome).toBe('Smoke Test Empresa');

    await prisma.empresa.delete({ where: { id: empresa.id } });
  });
});
