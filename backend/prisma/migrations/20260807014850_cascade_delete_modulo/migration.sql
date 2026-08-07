-- DropForeignKey
ALTER TABLE "Agente" DROP CONSTRAINT "Agente_moduloId_fkey";

-- DropForeignKey
ALTER TABLE "ConsultaParametrizada" DROP CONSTRAINT "ConsultaParametrizada_moduloId_fkey";

-- DropForeignKey
ALTER TABLE "ConsultaResultado" DROP CONSTRAINT "ConsultaResultado_consultaParametrizadaId_fkey";

-- DropForeignKey
ALTER TABLE "Conversa" DROP CONSTRAINT "Conversa_moduloId_fkey";

-- DropForeignKey
ALTER TABLE "ConversaTag" DROP CONSTRAINT "ConversaTag_moduloId_fkey";

-- DropForeignKey
ALTER TABLE "Etapa" DROP CONSTRAINT "Etapa_agenteId_fkey";

-- DropForeignKey
ALTER TABLE "Etapa" DROP CONSTRAINT "Etapa_fluxoId_fkey";

-- DropForeignKey
ALTER TABLE "Etapa" DROP CONSTRAINT "Etapa_macroetapaId_fkey";

-- DropForeignKey
ALTER TABLE "Etapa" DROP CONSTRAINT "Etapa_skillId_fkey";

-- DropForeignKey
ALTER TABLE "ExecucaoDeEtapa" DROP CONSTRAINT "ExecucaoDeEtapa_etapaId_fkey";

-- DropForeignKey
ALTER TABLE "ExecucaoDeEtapa" DROP CONSTRAINT "ExecucaoDeEtapa_instanciaId_fkey";

-- DropForeignKey
ALTER TABLE "Fluxo" DROP CONSTRAINT "Fluxo_moduloId_fkey";

-- DropForeignKey
ALTER TABLE "InstanciaDeProcesso" DROP CONSTRAINT "InstanciaDeProcesso_fluxoId_fkey";

-- DropForeignKey
ALTER TABLE "Macroetapa" DROP CONSTRAINT "Macroetapa_fluxoId_fkey";

-- DropForeignKey
ALTER TABLE "Mensagem" DROP CONSTRAINT "Mensagem_conversaId_fkey";

-- DropForeignKey
ALTER TABLE "Skill" DROP CONSTRAINT "Skill_agenteId_fkey";

-- DropForeignKey
ALTER TABLE "SkillExecucao" DROP CONSTRAINT "SkillExecucao_skillId_fkey";

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversaTag" ADD CONSTRAINT "ConversaTag_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agente" ADD CONSTRAINT "Agente_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillExecucao" ADD CONSTRAINT "SkillExecucao_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultaParametrizada" ADD CONSTRAINT "ConsultaParametrizada_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultaResultado" ADD CONSTRAINT "ConsultaResultado_consultaParametrizadaId_fkey" FOREIGN KEY ("consultaParametrizadaId") REFERENCES "ConsultaParametrizada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fluxo" ADD CONSTRAINT "Fluxo_moduloId_fkey" FOREIGN KEY ("moduloId") REFERENCES "Modulo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Macroetapa" ADD CONSTRAINT "Macroetapa_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "Fluxo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "Fluxo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_macroetapaId_fkey" FOREIGN KEY ("macroetapaId") REFERENCES "Macroetapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "Agente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etapa" ADD CONSTRAINT "Etapa_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanciaDeProcesso" ADD CONSTRAINT "InstanciaDeProcesso_fluxoId_fkey" FOREIGN KEY ("fluxoId") REFERENCES "Fluxo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoDeEtapa" ADD CONSTRAINT "ExecucaoDeEtapa_instanciaId_fkey" FOREIGN KEY ("instanciaId") REFERENCES "InstanciaDeProcesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecucaoDeEtapa" ADD CONSTRAINT "ExecucaoDeEtapa_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

