-- CreateEnum
CREATE TYPE "PapelMensagem" AS ENUM ('usuario', 'agente');

-- CreateTable
CREATE TABLE "Modulo" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "instrucoes" TEXT,
    "modeloIA" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Modulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "papel" "PapelMensagem" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tokensEntrada" INTEGER,
    "tokensSaida" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Modulo" ADD CONSTRAINT "Modulo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (regra permanente: toda tabela nova nasce com RLS habilitada e sem policies)
ALTER TABLE "Modulo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mensagem" ENABLE ROW LEVEL SECURITY;
