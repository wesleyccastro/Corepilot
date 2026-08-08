-- CreateTable
CREATE TABLE "ConectorConexao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "contaExterna" TEXT,
    "accessTokenCriptografado" TEXT NOT NULL,
    "refreshTokenCriptografado" TEXT,
    "expiraEm" TIMESTAMP(3),
    "escopos" TEXT[],
    "ultimoTesteEm" TIMESTAMP(3),
    "ultimoTesteSucesso" BOOLEAN,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConectorConexao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConectorConexao_usuarioId_empresaId_provider_key" ON "ConectorConexao"("usuarioId", "empresaId", "provider");

-- AddForeignKey
ALTER TABLE "ConectorConexao" ADD CONSTRAINT "ConectorConexao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConectorConexao" ADD CONSTRAINT "ConectorConexao_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (regra permanente: toda tabela nova nasce com RLS habilitada e sem policies)
ALTER TABLE "ConectorConexao" ENABLE ROW LEVEL SECURITY;
