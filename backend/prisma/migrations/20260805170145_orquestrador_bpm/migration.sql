-- CreateEnum
CREATE TYPE "TipoEtapa" AS ENUM ('tarefa_agente', 'interacao_usuario', 'aprovacao', 'decisao_automatica', 'integracao', 'espera');

-- CreateEnum
CREATE TYPE "ExecutorEtapa" AS ENUM ('agente', 'usuario', 'agente_mais_usuario', 'integracao', 'agente_mais_integracao', 'automatico');

-- CreateEnum
CREATE TYPE "StatusInstancia" AS ENUM ('em_andamento', 'concluido', 'erro');

-- CreateEnum
CREATE TYPE "StatusExecucao" AS ENUM ('pending', 'processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "AtorExecucao" AS ENUM ('agente', 'usuario', 'integracao', 'automatico');

-- CreateTable
CREATE TABLE "Fluxo" (
    "id" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fluxo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Macroetapa" (
    "id" TEXT NOT NULL,
    "fluxoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "Macroetapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etapa" (
    "id" TEXT NOT NULL,
    "fluxoId" TEXT NOT NULL,
    "macroetapaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoEtapa" NOT NULL,
    "executor" "ExecutorEtapa" NOT NULL,
    "prazoDias" INTEGER,
    "agenteId" TEXT,
    "skillId" TEXT,
    "autonomia" TEXT,
    "aprovadores" JSONB NOT NULL DEFAULT '[]',
    "loopParaEtapaId" TEXT,
    "entradaRefs" JSONB NOT NULL DEFAULT '[]',
    "camposUsuario" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Etapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanciaDeProcesso" (
    "id" TEXT NOT NULL,
    "fluxoId" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "etapaAtualId" TEXT NOT NULL,
    "status" "StatusInstancia" NOT NULL DEFAULT 'em_andamento',
    "dadosAcumulados" JSONB NOT NULL DEFAULT '{}',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstanciaDeProcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecucaoDeEtapa" (
    "id" TEXT NOT NULL,
    "instanciaId" TEXT NOT NULL,
    "etapaId" TEXT NOT NULL,
    "numeroDaExecucao" INTEGER NOT NULL,
    "ator" "AtorExecucao" NOT NULL,
    "atorUsuarioId" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "status" "StatusExecucao" NOT NULL DEFAULT 'pending',
    "chaveIdempotencia" TEXT,
    "tokensEntrada" INTEGER,
    "tokensSaida" INTEGER,
    "mensagemErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidoEm" TIMESTAMP(3),

    CONSTRAINT "ExecucaoDeEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoWhatsApp" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "apiUrl" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "apiKeyCriptografada" TEXT NOT NULL,
    "phone" TEXT,
    "ultimoTesteEm" TIMESTAMP(3),
    "ultimoTesteSucesso" BOOLEAN,
    "ultimaMensagemErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegracaoWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecucaoDeEtapa_chaveIdempotencia_key" ON "ExecucaoDeEtapa"("chaveIdempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoWhatsApp_empresaId_key" ON "IntegracaoWhatsApp"("empresaId");

-- AddForeignKey
ALTER TABLE "Fluxo" ADD CONSTRAINT "Fluxo_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Macroetapa" ADD CONSTRAINT "Macroetapa_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "Fluxo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "Fluxo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_macroetapaId_fkey" FOREIGN KEY ("macroetapaId") REFERENCES "Macroetapa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanciaDeProcesso" ADD CONSTRAINT "InstanciaDeProcesso_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "Fluxo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanciaDeProcesso" ADD CONSTRAINT "InstanciaDeProcesso_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoDeEtapa" ADD CONSTRAINT "ExecucaoDeEtapa_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "InstanciaDeProcesso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoDeEtapa" ADD CONSTRAINT "ExecucaoDeEtapa_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoDeEtapa" ADD CONSTRAINT "ExecucaoDeEtapa_atorUsuarioId_fkey" FOREIGN KEY ("atorUsuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoWhatsApp" ADD CONSTRAINT "IntegracaoWhatsApp_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (regra permanente: toda tabela nova nasce com RLS habilitada e sem policies)
ALTER TABLE "Fluxo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Macroetapa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Etapa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InstanciaDeProcesso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExecucaoDeEtapa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegracaoWhatsApp" ENABLE ROW LEVEL SECURITY;
