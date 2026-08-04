-- AlterTable
ALTER TABLE "Conversa" ADD COLUMN     "arquivada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fixada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tagId" TEXT;

-- CreateTable
CREATE TABLE "ConversaTag" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversaTag_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ConversaTag"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaTag" ADD CONSTRAINT "ConversaTag_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaTag" ADD CONSTRAINT "ConversaTag_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
