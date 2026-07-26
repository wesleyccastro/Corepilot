-- Bloqueia a Data API pública (PostgREST) do Supabase para todas as tabelas
-- criadas pelo Prisma. Sem RLS habilitada, qualquer pessoa de posse da chave
-- publishable/anon (que é embarcada no bundle do frontend) consegue ler e
-- escrever diretamente em `/rest/v1/<Tabela>`, contornando por completo o
-- JwtAuthGuard/TenantGuard do NestJS.
--
-- Habilitar RLS SEM NENHUMA POLICY = negação total para os papéis `anon` e
-- `authenticated` do PostgREST. Isto NÃO reintroduz RLS como mecanismo de
-- autorização (que continua explícito nos services do NestJS, conforme spec
-- §3/§5): o backend conecta via DATABASE_URL como dono das tabelas, e o dono
-- ignora RLS por padrão (`NO BYPASSRLS` não está setado), então nada muda para
-- a aplicação.
--
-- REGRA PERMANENTE: toda tabela nova (Fase 2 em diante) precisa da mesma
-- linha aqui — ver spec §3.1.

ALTER TABLE "Empresa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsuarioEmpresa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
