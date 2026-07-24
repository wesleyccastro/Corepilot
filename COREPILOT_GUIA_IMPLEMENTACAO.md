# CorePilot — Guia de implementação (protótipo → produto real)

## 0. Como usar este documento

Este documento consolida as decisões de arquitetura e produto discutidas até aqui e serve como
briefing técnico para a implementação real do CorePilot. O que existe hoje são protótipos visuais
(Claude Design) e a especificação funcional do Orquestrador BPM. A partir daqui, o objetivo é
construir backend e frontend reais, conectados à API do Claude, com agentes, skills, fontes de
dados e o motor de orquestração funcionando de ponta a ponta — não mais telas estáticas.

Onde este documento sugere uma stack ou uma estrutura de dados, trate como ponto de partida
razoável, não como decisão travada. Onde ele descreve um princípio de arquitetura (seção 2), trate
como não negociável — são as regras que evitam que o produto vire duas fontes de verdade
divergentes (BPM vs Kanban, por exemplo).

---

## 1. Visão geral do produto

O CorePilot é uma plataforma corporativa organizada em **módulos** (ex: Compras, Financeiro,
Operações Agrícolas). Cada módulo tem:

- Uma **base de conhecimento** própria.
- **Fontes de dados** conectadas (somente leitura, consultas parametrizadas).
- **Agentes de IA** com **skills** específicas (objetivo + fontes + ferramentas + formato de saída).
- Duas áreas de trabalho para o funcionário: **Chat** (conversa livre) e **Interação** (área
  operacional gerada pelo processo configurado no módulo).

A partir da especificação do Orquestrador, cada módulo pode ter um **fluxo de processo (BPM)**
configurável visualmente, cujo estado é representado no **Kanban** e cuja execução gera a tela de
**Interação** para quem precisa agir.

## 2. Princípios de arquitetura (não negociáveis)

1. **O BPM controla o estado do processo. O Kanban apenas representa esse estado.** Nunca criar
   lógica de coluna independente do fluxo publicado.
2. **Uma etapa do BPM pertence a no máximo uma macroetapa (coluna).** Etapas técnicas podem ficar
   ocultas sem mover o card.
3. **Toda saída de agente usada pela engine é estruturada (JSON com schema), nunca texto livre
   interpretado por regex ou heurística.** Texto livre pode ser exibido ao usuário, mas a decisão
   de transição do processo nunca deve depender de parsing de linguagem natural.
4. **Toda ação — humana ou de agente — é auditada**: ator, timestamp, dados de entrada e saída.
5. **Chave de API da Anthropic e credenciais de fontes de dados vivem só no backend.** O frontend
   nunca chama a API do Claude diretamente nem recebe segredos.
6. **Fontes de dados são sempre somente leitura, com consultas parametrizadas cadastradas
   previamente** — nunca acesso livre a SQL vindo do agente.
7. **Fluxo é versionado.** Processos em andamento permanecem vinculados à versão em que foram
   iniciados, mesmo que o fluxo seja republicado.

## 3. Stack sugerida (ajustável)

| Camada | Sugestão | Motivo |
|---|---|---|
| Backend | Node.js + TypeScript (NestJS ou Fastify) | SDK oficial da Anthropic em TS é maduro; tipagem ajuda no contrato de schemas de skill |
| Banco de dados | PostgreSQL | Suporta bem modelo relacional de fluxo/etapa/transição + JSONB para payloads de agente |
| Fila / agendamento | Redis + BullMQ (ou equivalente) | Necessário pois etapas de agente rodam de forma assíncrona e em horários agendados |
| Frontend | React + TypeScript | Já é a base visual do protótipo em Claude Design |
| IA | SDK oficial `@anthropic-ai/sdk` (Messages API) | Tool use nativo, MCP connector, structured output |

Multi-tenant desde o início (empresa como escopo de tudo — módulo, dado, permissão, log).

## 4. Modelo de dados (núcleo)

```
Empresa
  └─ Modulo (nome, identidade, objetivo)
       ├─ FonteDeDados (tipo, conexao, somente_leitura=true)
       │     └─ ConsultaParametrizada (nome, sql/params, testada:boolean)
       ├─ Agente (nome, funcao, objetivo, modelo_ia, ferramentas[])
       │     └─ Skill (nome, objetivo, fontes[], ferramentas[], schema_saida)
       ├─ Fluxo (versao, publicado:boolean)
       │     ├─ Etapa (tipo, executor, entrada[], saida[], acoes[], prazo, macroetapa_id)
       │     └─ Transicao (etapa_origem, etapa_destino, gatilho, condicao)
       ├─ Macroetapa (nome = coluna do kanban)
       └─ InstanciaDeProcesso / Card (fluxo_versao, etapa_atual, dados_acumulados JSONB)
             └─ ExecucaoDeEtapa (ator, tipo_ator[agente|usuario|integracao],
                                  input JSONB, output JSONB, timestamp, custo_tokens)
```

`tipo` de Etapa: `tarefa_agente | interacao_usuario | aprovacao | decisao_automatica |
integracao | espera`.

`executor` de Etapa: `agente | usuario | agente_mais_usuario | integracao | automatico`.

## 5. Integração com a API do Claude

**Regra central**: cada Skill corresponde a uma chamada escopada à Messages API — não ao histórico
de chat do usuário. A chamada recebe apenas o `entrada` configurado naquela etapa (dados
acumulados do card até ali), nunca o módulo inteiro.

Padrão de chamada por etapa de agente:

1. Montar o contexto de entrada a partir de `InstanciaDeProcesso.dados_acumulados`, filtrado pelo
   que a Etapa define como `entrada`.
2. Chamar a Messages API com:
   - `system` = identidade + objetivo do Agente (definidos na etapa "Agentes e instruções").
   - `tools` = ferramentas habilitadas para aquela Skill (consultas de dados, integrações).
   - Uma tool obrigatória de retorno (`tool_choice` forçando o schema de saída da Skill), para
     garantir JSON estruturado em vez de texto livre.
3. Validar a saída contra o schema declarado da Skill antes de gravar.
4. Gravar `ExecucaoDeEtapa` (auditoria) com input, output, tokens/custo.
5. A engine de estado decide a transição com base no `output` estruturado — nunca o modelo decide
   a transição sozinho.

**Integrações externas (ERP/TOTVS, WhatsApp, fornecedores)**:
- Para integrações reaproveitadas entre módulos/skills, considerar um servidor MCP remoto próprio
  (HTTP/SSE) e conectar via `mcp_servers` na Messages API.
- Para integrações simples e internas (ex: consulta parametrizada ao SQL Server), preferir tool
  use direto implementado no backend — mais simples de auditar e não exige expor um servidor MCP
  publicamente.

**Autonomia da etapa** (`Apenas notificar | Executar e notificar | Executar com aprovação`) é
lógica do motor de orquestração, não do prompt do agente. O agente sempre produz a
recomendação/resultado; quem decide se isso vira ação automática ou espera aprovação é a
configuração da etapa.

## 6. Motor de orquestração (BPM)

- Implementar como módulo isolado e testável, sem depender da UI — uma máquina de estados que
  recebe eventos (`entrada_em_etapa`, `acao_usuario`, `resultado_agente`) e decide transições.
- Etapas de agente executam em **fila assíncrona** (worker), nunca bloqueando uma requisição HTTP.
- Suportar **loops** no grafo do fluxo (ex: "solicitar correção" volta para uma etapa anterior),
  não apenas árvore/DAG linear.
- **Idempotência obrigatória** em qualquer etapa com efeito externo (enviar WhatsApp, gerar pedido
  no ERP) — usar uma chave única por instância de processo + etapa.
- Falha de uma etapa não pode marcar o card como concluído silenciosamente: deve existir um estado
  de erro visível (ex: "Falha no envio — reenviar").
- SLA/prazo por etapa: alertas e escalonamento configuráveis, sem acoplar isso à lógica de
  transição em si.

## 7. Kanban / Interação (frontend)

- Card = uma `InstanciaDeProcesso`. Coluna = `Macroetapa` vinculada à etapa ativa do card.
- Duas subvisões dentro de Interação: **Quadro do processo** (visão global) e **Minhas
  pendências** (filtrado pelo usuário logado).
- Tela de detalhe da interação é gerada a partir da configuração de campos da etapa (builder),
  distinguindo campo preenchido pelo agente / editável pelo usuário / somente leitura.
- Drag-and-drop de card só é permitido quando existir transição válida e autorizada — nunca mover
  livremente.

## 8. Builder de módulo (frontend)

Wizard: **Identidade → Base de conhecimento → Fontes de dados → Agentes e instruções →
Orquestrador → Permissões → Revisão e publicação.**

O Orquestrador é um canvas de fluxo (nós e transições) + painel lateral de configuração da etapa
selecionada (executor, entrada, saída, ações, prazo, exibição operacional), conforme o protótipo
já validado em Claude Design.

## 9. Segurança, permissões e auditoria

- Perfis de acesso por empresa e unidade; restringir quadros, cards, campos e ações por perfil.
- Toda ação (humana ou de agente) logada com ator, timestamp, e dados antes/depois.
- Fontes de dados sempre somente leitura, com `INSERT/UPDATE/DELETE/DROP` bloqueados na camada de
  acesso — nunca depender apenas de permissão de aplicação.
- Segredos (chave da Anthropic, credenciais de fonte de dados) apenas em variáveis de
  ambiente/secret manager do backend.

## 10. Roteiro de implementação sugerido (fases)

1. **Fundação** — infraestrutura, autenticação, multi-tenant, modelo de dados core.
2. **Módulo + Chat** — chat conectado de verdade à Messages API, sem orquestrador ainda.
3. **Agentes + Skills** — builder de agentes, execução de skill avulsa (sem BPM), schema de saída
   estruturada validado.
4. **Fontes de dados** — conectores somente leitura, consultas parametrizadas expostas como tools.
5. **Orquestrador BPM** — motor de estado, canvas visual, execução de etapa em fila assíncrona.
6. **Kanban / Interação** — quadro do processo, minhas pendências, detalhe da interação.
7. **Integrações externas** — ERP, WhatsApp, fornecedores (tool use direto ou MCP).
8. **Permissões avançadas, auditoria completa, versionamento de fluxo.**

Não avançar para a fase seguinte sem o caso de validação da fase anterior funcionando de ponta a
ponta — especialmente a fase 5, que é a mais arriscada tecnicamente.

## 11. Caso de validação de ponta a ponta

Usar o fluxo de Compras já detalhado como teste de aceitação real do motor de orquestração:

1. Solicitação recebida (automático) → grava no banco.
2. Triagem (agente, skill dedicada, disparo agendado) → saída estruturada com solicitações
   agrupadas.
3. Aprovação da triagem (comprador) → aprova / reprova / ajusta.
4. Cotação (agente, aciona fornecedores) → saída estruturada com propostas.
5. Aprovação da cotação (comprador) → aprova, ou solicita correção (loop de volta à etapa 4, com
   `motivo_correcao` como entrada adicional).
6. Finalização (agente) → mapa de cotações consolidado.
7. Aprovação final (comprador).
8. Comunicação (agente + integração WhatsApp, disparo automático, idempotente) → fornecedor e
   solicitante notificados.

Se esse fluxo completo funcionar de ponta a ponta — com auditoria, loop de correção e
idempotência no passo 8 — o motor de orquestração está validado para os demais módulos.

## 12. Notas diretas para o Claude Code

- Implementar o motor de estado (seção 6) como módulo isolado, com testes automatizados, antes de
  plugar em qualquer UI.
- Definir o schema de saída de cada Skill (JSON Schema ou equivalente TypeScript) antes de
  escrever o prompt do agente — o contrato de dados vem primeiro, o prompt se adapta a ele.
- Não interpretar texto livre do modelo para decidir transição de estado, em nenhuma hipótese.
- Não persistir chave de API, tokens ou credenciais de fonte de dados no repositório.
- Priorizar o caso de validação da seção 11 como critério de "pronto" antes de generalizar o
  builder para outros tipos de fluxo.
