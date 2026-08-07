-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "cnpjCpf" TEXT,
ADD COLUMN     "segmento" TEXT,
ADD COLUMN     "uf" TEXT,
ADD COLUMN     "whatsapp" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cnpjCpf_key" ON "Empresa"("cnpjCpf");
