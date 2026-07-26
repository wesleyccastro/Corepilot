-- CreateTable
CREATE TABLE "FonteDeDados" (
    "id" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "configuracao" JSONB NOT NULL,
    "ultimoTesteEm" TIMESTAMP(3),
    "ultimoTesteSucesso" BOOLEAN,
    "ultimaMensagemErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FonteDeDados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultaParametrizada" (
    "id" TEXT NOT NULL,
    "moduloId" TEXT NOT NULL,
    "fonteDeDadosId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codSentenca" TEXT NOT NULL,
    "parametrosSincronizacao" JSONB NOT NULL,
    "camposFiltro" JSONB NOT NULL,
    "colunas" JSONB,
    "testada" BOOLEAN NOT NULL DEFAULT false,
    "sincronizacaoAtiva" BOOLEAN NOT NULL DEFAULT false,
    "intervaloSincronizacaoMinutos" INTEGER,
    "ultimaSincronizacaoEm" TIMESTAMP(3),
    "ultimoResultadoSincronizacao" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultaParametrizada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultaResultado" (
    "id" TEXT NOT NULL,
    "consultaParametrizadaId" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultaResultado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ConsultaParametrizadaToSkill" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ConsultaParametrizadaToSkill_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ConsultaParametrizadaToSkill_B_index" ON "_ConsultaParametrizadaToSkill"("B");

-- AddForeignKey
ALTER TABLE "FonteDeDados" ADD CONSTRAINT "FonteDeDados_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultaParametrizada" ADD CONSTRAINT "ConsultaParametrizada_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultaParametrizada" ADD CONSTRAINT "ConsultaParametrizada_fonteDeDadosId_fkey" FOREIGN KEY ("fonteDeDadosId") REFERENCES "FonteDeDados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultaResultado" ADD CONSTRAINT "ConsultaResultado_consultaParametrizadaId_fkey" FOREIGN KEY ("consultaParametrizadaId") REFERENCES "ConsultaParametrizada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConsultaParametrizadaToSkill" ADD CONSTRAINT "_ConsultaParametrizadaToSkill_A_fkey" FOREIGN KEY ("A") REFERENCES "ConsultaParametrizada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ConsultaParametrizadaToSkill" ADD CONSTRAINT "_ConsultaParametrizadaToSkill_B_fkey" FOREIGN KEY ("B") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (regra permanente: toda tabela nova nasce com RLS habilitada e sem policies)
ALTER TABLE "FonteDeDados" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsultaParametrizada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsultaResultado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_ConsultaParametrizadaToSkill" ENABLE ROW LEVEL SECURITY;
