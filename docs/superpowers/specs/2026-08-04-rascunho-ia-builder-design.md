# CorePilot — Rascunho com IA no builder de módulo/agente (design)

## 0. Contexto

O builder de módulo (`Wizard` → step 4 "Agente e instruções") tem três campos que exigem
do usuário escrever texto estruturado ou semiestruturado sem nenhuma ajuda: as
instruções gerais do módulo (`Modulo.instrucoes`, aba "Instruções"), as restrições e a
regra de escalonamento do agente (`Agente.guardrails` / `Agente.regraEscalonamento`,
campos adicionados à aba "Identidade" nesta mesma sessão de trabalho, sem spec própria
por ser uma extensão pequena e já escopada por diálogo direto) e os campos de saída de
uma Skill (`Skill.camposSaida`, aba "Skills" → editor de skill). Um
usuário sem experiência em escrever prompts ou definir contratos de dados tende a deixar
esses campos vazios ou rasos demais para produzir um agente útil.

O backend já tem o mecanismo certo para gerar rascunhos de boa qualidade nesses campos:
`AnthropicService.parseStructured` (`backend/src/chat/anthropic.service.ts`), que usa
`zodOutputFormat` para forçar o modelo Claude a devolver JSON validado contra um schema —
o mesmo mecanismo já usado em produção por `SkillExecucaoController` para rodar skills de
verdade (`docs/superpowers/specs/2026-07-26-agentes-skills-design.md` §5).

## 1. Objetivo

Um botão "Gerar rascunho com IA" nos três locais acima. O usuário opcionalmente descreve
em 1-2 frases o que precisa; o backend monta um prompt a partir desse brief + do contexto
já existente (nome/objetivo do módulo, ou nome/função/objetivo do agente/skill) e chama a
Messages API pedindo saída estruturada. O rascunho retorna e **preenche os campos do
formulário como texto editável** — nada é salvo automaticamente. O usuário revisa,
ajusta, e salva do jeito que já salva hoje (blur nos campos de texto, botão "Salvar
skill" no editor de skill).

## 2. Fora de escopo

- Rascunhar `Modulo.descricao`, `Modulo.objetivo`, ou qualquer campo de identidade
  (nome/função/objetivo) do módulo/agente/skill — esses já são o próprio insumo do
  prompt, não faz sentido a IA inventá-los antes de existirem.
- Histórico de rascunhos gerados (não persiste o rascunho em si, só audita metadados de
  uso — tokens, tipo, ator).
- Qualquer mecanismo de "aceitar/recusar" além de editar o texto normalmente — não há
  diff, não há botão "desfazer rascunho": é só um preenchimento inicial editável.
- Aplicar isso em Compras/Financeiro (módulos de referência com dados mock) — só faz
  sentido em módulos customizados reais, que é onde esses três campos existem de fato.

## 3. Arquitetura

Três endpoints novos, cada um dentro do controller do recurso ao qual o campo pertence —
sem módulo "assistente" genérico, seguindo o padrão já estabelecido no backend (cada
controller é escopado ao seu recurso: `ModuloController`, `AgenteController`, etc.):

```
Frontend (Wizard, step 4)                    Backend (NestJS)                      Anthropic
  step4/Instructions.tsx ("Instruções") ▶  ModuloController
    [Gerar rascunho com IA]                  POST /modulos/:id/rascunho-instrucoes
                                                 monta prompt (nome+objetivo do módulo
                                                 + brief) ──▶ AnthropicService.parseStructured ──▶ Messages API
                                                 devolve { instrucoes }

  Step4Agent/aba "Identidade" ──────────▶  AgenteController
    [Gerar rascunho com IA]                  POST /modulos/:moduloId/agentes/:agenteId/rascunho-guardrails
                                                 monta prompt (nome+função+objetivo do
                                                 agente + brief) ──▶ parseStructured ──▶ Messages API
                                                 devolve { guardrails, regraEscalonamento }

  step4/SkillEditor ─────────────────────▶  AgenteController
    [Gerar rascunho com IA]                  POST /modulos/:moduloId/agentes/:agenteId/rascunho-skill
                                                 monta prompt (nome+objetivo da skill,
                                                 se já preenchidos, + brief) ──▶ parseStructured ──▶ Messages API
                                                 devolve { camposSaida: CampoSaida[] }
```

Mesmo princípio das fases anteriores: o frontend nunca fala com a Anthropic diretamente.
`JwtAuthGuard` + `TenantGuard` protegem os três endpoints, reaproveitados sem alteração.

`ModuloModule` e `AgenteModule` passam a importar `ChatModule` (que já exporta
`AnthropicService` — mesmo padrão que `SkillExecucaoModule` já usa hoje).

Endpoint da skill fica sob `AgenteController` (não sob `SkillController`) porque precisa
funcionar **antes** de a skill existir — o caso de uso principal é o formulário de criação
de skill em branco, sem `skillId` ainda.

## 4. Schemas de saída (Zod, fixos por tipo — sem schema dinâmico)

```typescript
// rascunho-instrucoes
z.object({ instrucoes: z.string() });

// rascunho-guardrails
z.object({ guardrails: z.string(), regraEscalonamento: z.string() });

// rascunho-skill
z.object({
  camposSaida: z.array(
    z.object({
      nome: z.string(),
      tipo: z.enum(['string', 'number', 'boolean', 'string[]']),
      obrigatorio: z.boolean(),
      descricao: z.string().optional(),
    }),
  ),
});
```

Diferente de `Skill.camposSaida` (construído dinamicamente a partir dos dados do usuário
na execução real de skill), aqui o formato de saída é sempre o mesmo — três schemas
estáticos, um por endpoint.

## 5. Fluxo de cada endpoint

1. `JwtAuthGuard` + `TenantGuard`.
2. Valida que o recurso pai (módulo, ou agente) pertence à empresa do tenant atual —
   mesmo padrão de `findByIdInEmpresa` já usado em todos os outros controllers.
3. Monta `system`/mensagem a partir do contexto já persistido (nome/objetivo do módulo,
   ou nome/função/objetivo do agente + objetivo da skill se houver) mais o `brief`
   opcional enviado no corpo da requisição.
4. Chama `anthropicService.parseStructured({ system, mensagem, model, maxTokens: 2048,
   schema })`. `model`: `agente.modeloIA` quando o contexto é um agente/skill; um default
   fixo (`'claude-sonnet-5'`) quando é só o módulo (ainda sem agente).
5. Se `parsed_output` vier `null`, `UnprocessableEntityException` — mesmo tratamento que
   `SkillExecucaoController` já usa para o mesmo tipo de falha.
6. Audita (`AuditService.record`, `acao: 'rascunho_ia_gerado'`, `dadosDepois: { tipo,
   tokensEntrada, tokensSaida }`) — não persiste o conteúdo do rascunho em si, só
   metadados de uso/custo.
7. Retorna o objeto estruturado ao cliente. Nenhuma escrita em `Modulo`/`Agente`/`Skill`
   acontece aqui — quem persiste é o fluxo de salvar já existente, quando o usuário
   confirma.

## 6. Frontend

Um componente pequeno reutilizável, `GerarRascunhoButton` (novo,
`frontend/src/corepilot/components/GerarRascunhoButton.tsx`): botão "Gerar rascunho com
IA" que, ao clicar, expande uma caixa de texto opcional ("Descreva em poucas palavras o
que você precisa — opcional") + botão "Gerar". Estados: ocioso → gerando (`Gerando…`,
desabilitado) → erro inline (reaproveita o padrão de `wizardError`) → sucesso (fecha a
caixa, chama o callback `onRascunho(dados)` do consumidor).

Uso nos três locais:

- **Aba Instruções** (`step4/Instructions.tsx`, campo `Modulo.instrucoes` apesar de
  editado dentro do step "Agente e instruções"): `onRascunho` seta o `useState`
  (`state.instructions`) já existente, que salva no blur.
- **Aba Identidade do agente** (`step4/Identity.tsx`): `onRascunho` seta os dois
  `useState` locais (`guardrails`, `regraEscalonamento`) — mesmo padrão de blur-para-
  salvar já implementado.
- **Editor de skill** (`step4/SkillEditor.tsx`): `onRascunho` substitui
  `state.skillFormCampos` por inteiro via a action já existente de atualização em lote
  (nova action `aplicarRascunhoCamposSaida(campos)` que faz um único `update` com o array
  completo, em vez de chamar `adicionarCampoSaida` campo a campo).

Nenhum dos três salva sozinho — o texto/array populado é exatamente como se o usuário
tivesse digitado, e passa pelo mesmo caminho de salvar que já existe hoje.

## 7. Auditoria

Cada chamada gera uma linha em `AuditLog` (`acao: 'rascunho_ia_gerado'`), mesma tabela e
`AuditService` de sempre, sem alteração no serviço de auditoria.

## 8. Variáveis de ambiente

Nenhuma nova. `ANTHROPIC_API_KEY` já configurada desde a Fase 2 do chat.

## 9. Critério de aceite

1. No módulo Agronomia (ou qualquer módulo customizado real), clicar "Gerar rascunho com
   IA" na aba Instruções com um módulo que já tem nome/objetivo preenchidos (com ou sem
   brief) preenche o textarea de instruções com texto coerente, editável, não salvo até
   o blur.
2. Mesmo teste na aba Identidade do agente — preenche `guardrails` e
   `regraEscalonamento` a partir de nome/função/objetivo do agente.
3. Mesmo teste no editor de skill (criação nova, sem `skillId`) — preenche
   `camposSaida` com pelo menos 2 campos de tipos plausíveis para o objetivo descrito.
4. Cada uma das três chamadas gera exatamente uma linha em `AuditLog` com
   `acao: 'rascunho_ia_gerado'` e tokens de entrada/saída.
5. Se a resposta do modelo não validar contra o schema, a UI mostra um erro inline e
   nenhum campo é alterado.
6. Um usuário de uma empresa nunca consegue gerar rascunho usando `moduloId`/`agenteId`
   de outra empresa (retorna 404 via `findByIdInEmpresa`, mesmo padrão de todos os outros
   endpoints).

## 10. Decisões em aberto (não bloqueantes)

- Valor exato de `maxTokens` para os três endpoints (proposto: 2048 — rascunhos são bem
  mais curtos que uma execução de skill real, que usa 4096).
- Se o editor de skill deve avisar ("isso vai substituir os campos já preenchidos") antes
  de sobrescrever `skillFormCampos` quando já há campos não vazios, ou se sobrescrever
  direto é aceitável no v1 (proposto: sobrescrever direto, já que o caso de uso principal
  é o formulário vazio).
