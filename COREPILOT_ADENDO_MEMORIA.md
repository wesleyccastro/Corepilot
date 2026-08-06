# Adendo — Arquitetura de memória em três camadas

> Complementa a seção 5 (Integração com a API do Claude) do `COREPILOT_GUIA_IMPLEMENTACAO.md`.
> Contexto: o CorePilot precisa "aprender a rotina da empresa" e reter contexto entre chats,
> módulos e sessões, sem deixar a memória crescer sem controle nem misturar conhecimento
> evolutivo com dado operacional determinístico (ver adendo de campos personalizados, princípio
> de não deixar texto livre decidir transição de estado).

## 1. O que é nativo da Anthropic × o que é interno do CorePilot

Esse é o ponto que mais gera confusão, então primeiro a tabela:

| Peça | Nativo da API do Claude | Responsabilidade do CorePilot |
|---|---|---|
| Protocolo de leitura/escrita de memória | Sim — ferramenta `memory` (`type: "memory_20250818"`), com comandos padronizados `view / create / str_replace / insert / delete / rename` | — |
| Onde e como os dados ficam guardados | Não — a ferramenta é **client-side**: o Claude só solicita a operação, quem executa e decide o armazenamento real é a aplicação | Sim — implementar o handler que mapeia `/memories/...` para linhas no Postgres |
| Isolar dados por empresa/módulo (multi-tenant) | Não — a Anthropic não sabe o que é um "tenant" | Sim — todo o desenho de path (seção 4) e a validação de que ninguém acessa fora do próprio escopo |
| Isolar dados por usuário dentro do mesmo tenant | Não — mesma resposta, a Anthropic não sabe o que é um "usuário" | Sim — distinguir chat privado (por pessoa) de dado de processo compartilhado (por departamento/módulo), seção 3 e 4.2 |
| Proteção contra path traversal | Não — a documentação é explícita: "sua implementação deve validar todos os caminhos" | Sim — obrigatório, sem isso a ferramenta é uma porta aberta entre empresas |
| Limite de tamanho de arquivo / paginação | Não — a Anthropic recomenda mas não impõe | Sim — controlar tamanho, usar `view_range` para paginar |
| Expirar memória não usada | Não — recomendação da documentação, não comportamento automático | Sim — job de expiração (seção 6) |
| Resumir/consolidar memória ao longo do tempo | Não existe automaticamente | Sim — o job de consolidação (camada 2) é 100% CorePilot |
| Buscar numa conversa antiga específica | Não é isso que a ferramenta de memória faz — ela é para conhecimento acumulado, não busca em histórico bruto | Sim — precisa de uma ferramenta própria (camada 3) |
| Evitar que a conversa ativa estoure a janela de contexto | Sim — **compactação** (resume o histórico automaticamente no servidor) e **edição de contexto** (limpa resultados de ferramenta antigos no cliente), ambos nativos | Decidir se/quando habilitar, mas a mecânica é da Anthropic |

A confusão mais comum é achar que a "ferramenta de memória" já resolve tudo sozinha — ela resolve
só o protocolo (como Claude pede para ler/escrever) e uma parte do padrão de uso (ele confere a
memória antes de começar a trabalhar, registra o que aprende). O armazenamento real, o
particionamento por empresa, o que vira memória consolidada e o que é só busca sob demanda —
tudo isso é arquitetura do CorePilot, seção por seção abaixo.

## 2. As três camadas (recapitulando o que ficou decidido na conversa)

```
Camada 1 — Log bruto (CorePilot)
   ↓ job de consolidação periódico (CorePilot)
Camada 2 — Memória compacta (via ferramenta nativa `memory`) ──► usada em toda chamada de skill
Camada 3 — Índice de busca (ferramenta própria do CorePilot)  ──► usada só sob demanda
```

## 3. Camada 1 — Log bruto (duas naturezas diferentes, não confundir)

A regra de negócio que fixa isso: **Chat é o espaço privado de exploração da pessoa; Interação/BPM
é o registro compartilhado do processo.** Isso já existe na divisão de produto (Chat × Interação,
guia principal seção 1) — a Camada 1 só precisa respeitar essa mesma fronteira, sem criar uma
segunda regra de privacidade paralela.

| Log | O que é | Visibilidade |
|---|---|---|
| `MensagemChat` | Histórico de conversa livre de um usuário com o agente (ex: um comprador explorando dados na aba Chat) | **Privado ao usuário que gerou** — nenhum outro usuário do mesmo módulo/tenant lê isso, nem o job de consolidação compartilhada |
| `ExecucaoDeEtapa` | Já existente no guia principal — o que aconteceu em cada etapa de um processo (`InstanciaDeProcesso`) | **Compartilhado**, seguindo a mesma `Permissao` de módulo já definida no guia principal, seção 9 — se o departamento de Compras tem acesso ao módulo, tem acesso ao histórico de qualquer cotação dele, não só das que ele mesmo tocou |

Nenhuma das duas é lida diretamente por uma skill em tempo real — ambas alimentam a Camada 2 e a
Camada 3, mas **nunca se misturam entre si** (ver regra da seção 4.3).

## 4. Camada 2 — Memória compacta (ferramenta nativa `memory`)

### 4.1 Como o protocolo funciona (nativo)

1. O backend inclui `{"type": "memory_20250818", "name": "memory"}` em `tools` na chamada da
   Messages API — sem schema próprio, é uma ferramenta pronta da Anthropic.
2. Antes de começar a tarefa, o próprio Claude chama `view` em `/memories` para conferir o que já
   existe — isso é injetado automaticamente no prompt de sistema pela API, não precisa ser escrito
   por vocês.
3. Cada solicitação (`view`, `create`, `str_replace`, `insert`, `delete`, `rename`) chega como um
   `tool_use` — o backend do CorePilot executa contra o armazenamento real e devolve um
   `tool_result`.

### 4.2 O que o CorePilot precisa implementar

**Handler do lado do cliente.** Uma tabela `MemoriaArquivo(empresa_id, path, conteudo, tamanho,
criado_em, atualizado_em, acessado_em)`, com uma função que traduz cada comando (`view` vira
`SELECT`, `create`/`str_replace`/`insert` viram `UPDATE`/`INSERT`, `delete` remove a linha,
`rename` atualiza o `path`). Os SDKs da Anthropic (Python/TypeScript) têm uma classe base
(`BetaAbstractMemoryTool`) feita exatamente para isso — implementar essa interface contra Postgres
em vez de contra filesystem.

**Escopo do path por tenant e por usuário (crítico, não é opcional).** O prefixo `/memories`
sozinho não separa nada — isso é 100% desenho do CorePilot, em duas dimensões. Estrutura
recomendada:

```
/memories/{empresa_id}/{modulo_id}/rotina.md                          → compartilhada (departamento)
/memories/{empresa_id}/{modulo_id}/agentes/{agente_id}/padroes.md     → compartilhada, sem PII de ninguém
/memories/{empresa_id}/{modulo_id}/usuarios/{usuario_id}/chat.md      → privada daquele usuário
```

Duas regras de validação no handler, não uma:

1. **Tenant**: rejeitar qualquer operação cujo path não comece com
   `/memories/{empresa_id_da_sessão_atual}/` — sem isso, uma falha de prompt injection numa etapa
   poderia levar Claude a ler ou escrever memória de outro tenant.
2. **Usuário**: rejeitar qualquer operação em `/usuarios/{x}/...` cujo `x` não seja o
   `usuario_id` autenticado da sessão atual. Isso vale mesmo para um administrador do tenant — ser
   admin da empresa não dá acesso à pasta privada de um funcionário; é dado pessoal daquela
   pessoa, não da empresa (ver seção 7).

**Escritor único em arquivo compartilhado.** `rotina.md` e `agentes/{id}/padroes.md` só são
escritos pelo job de consolidação em lote (seção 4.3) — nunca por uma sessão de chat em tempo
real. Isso evita dois efeitos ruins ao mesmo tempo: concorrência de escrita entre usuários
diferentes editando o mesmo arquivo compartilhado, e vazamento indireto de conversa privada para
dentro do resumo do departamento (seção 4.3 detalha essa segunda regra). Arquivos dentro de
`/usuarios/{id}/` podem ser escritos ao vivo pela própria sessão daquele usuário, porque só ele
escreve ali — não há concorrência entre pessoas diferentes.

**Tamanho e paginação.** Rastrear `tamanho` por arquivo e aplicar um teto (ex: 8-16 KB por
arquivo de memória compacta) — se um arquivo ultrapassar isso, é sinal de que o job de
consolidação (4.3) não está resumindo o suficiente, não que o teto deva subir. Para arquivos
grandes que precisem existir mesmo assim, usar `view_range` para paginar em vez de devolver tudo.

### 4.3 Job de consolidação (o "aprender rotina" de verdade)

Um job periódico (ex: diário ou semanal, por módulo) que:

1. Lê a Camada 1 — **mas só o log de processo (`ExecucaoDeEtapa`), nunca `MensagemChat` de
   nenhum usuário.** Essa é a regra que mais importa nesta seção: se o job de `rotina.md`
   (arquivo compartilhado do departamento) puder ler conversas privadas de chat, um comprador
   explorando um assunto sensível na aba Chat corre o risco de ver aquilo resumido — mesmo sem
   nome — no arquivo que todo o departamento lê depois. `rotina.md` só pode nascer de dado que já
   era compartilhado por natureza (o processo, visível a quem tem permissão no módulo). Uma
   eventual memória construída a partir do chat de um usuário específico só pode ir para o
   arquivo privado dele (`/usuarios/{id}/`), nunca para o compartilhado.
2. Gera um resumo — pode ser puramente determinístico para métricas (ex: "tempo médio de
   aprovação: 1,8 dia", contagens, quem aprova o quê) ou, para padrões mais qualitativos (estilo
   de comunicação, prioridades recorrentes), uma chamada à própria API do Claude com uma Skill
   dedicada de consolidação — nesse caso reaproveitando o mesmo padrão de saída estruturada já
   definido no guia principal.
3. Escreve o resultado em `/memories/{empresa}/{modulo}/rotina.md` usando os mesmos comandos
   (`create` ou `str_replace`) do handler da seção 4.2 — o job usa a mesma via de escrita que o
   Claude usaria em runtime, não um caminho alternativo direto ao banco.
4. **Substitui, não acumula.** Cada rodada de consolidação reescreve o arquivo com a versão atual
   do padrão — não faz `append`. Isso é o que garante que o arquivo não cresça indefinidamente
   (ver seção 6).

### 4.4 O que a memória compacta pode e não pode influenciar

Pode: tom de comunicação do agente, priorização de itens ("historicamente, cotações de fornecedor
X demoram mais — sinalizar isso"), atalhos de UX ("esse aprovador costuma preferir resumo curto").

Não pode: decidir uma transição de etapa do BPM sozinha. Isso continua sendo saída estruturada da
Skill + regra do motor de orquestração (adendo de Tipo × Executor) — memória informa contexto,
nunca substitui o contrato de saída determinístico.

## 5. Camada 3 — Índice de busca sob demanda

Isso **não é** a ferramenta de memória — são ferramentas próprias do CorePilot, expostas ao Claude
como qualquer outra tool de negócio (guia principal, seção 5). Como a Camada 1 tem duas naturezas
(seção 3), a busca também precisa ser duas ferramentas separadas, não uma só com um parâmetro de
escopo — separar fisicamente evita que um bug de parâmetro vaze conversa privada para uma consulta
que deveria ser só de processo.

| Ferramenta | Busca em | Escopo |
|---|---|---|
| `buscar_historico_processo` | `ExecucaoDeEtapa` | Qualquer instância do módulo, para quem tem `Permissao` naquele módulo — igual ao que a pessoa já veria no Kanban/Interação |
| `buscar_meu_chat` | `MensagemChat` | **Sempre e só** do `usuario_id` autenticado da sessão atual — o parâmetro de usuário nunca vem do modelo ou da requisição, é fixado pelo backend a partir da sessão, para não existir a possibilidade de alguém pedir o chat de outra pessoa |

- Backing store para as duas: no MVP, busca textual no Postgres (`tsvector`/`pg_trgm`) resolve a
  maior parte dos casos, sem exigir infraestrutura de embeddings/vetor desde o início.
- São chamadas só quando necessário — nunca pré-carregadas em toda chamada de skill, ao contrário
  da memória compacta da Camada 2, que é lida por padrão.

## 6. Controle de crescimento (por que isso não vira problema)

- **Consolidação substitui, não acumula** (seção 4.3, item 4) — o arquivo usado em runtime tem
  tamanho limitado por design, não cresce com o tempo.
- **Expiração periódica**: um job apaga arquivos de memória não acessados há muito tempo (a
  própria documentação da Anthropic recomenda isso explicitamente) — usar o campo
  `acessado_em` da tabela `MemoriaArquivo` para decidir o que expira.
- **Camada 1 nunca é lida por inteiro** — ela cresce livremente (é log), mas só é tocada via
  índice de busca filtrado (Camada 3) ou pelo job de consolidação, nunca carregada inteira numa
  chamada de skill.
- **Compactação e edição de contexto (nativas)** cuidam de um problema relacionado mas diferente:
  a conversa *ativa* de um Chat longo dentro de um módulo estourando a janela de contexto — vale
  habilitar para sessões de chat longas, independente da arquitetura de memória entre sessões.

## 7. Segurança e LGPD (reforçando o que já foi combinado)

- Validação de path por tenant é obrigatória (seção 4.2) — sem isso, a ferramenta de memória é uma
  superfície de vazamento entre empresas.
- Antes de gravar, filtrar dados sensíveis (a documentação nota que o Claude geralmente se recusa
  a escrever informação sensível em memória, mas recomenda validação adicional no handler — não
  depender só do comportamento do modelo).
- **Chat privado (`MensagemChat` + `/usuarios/{id}/`) é dado pessoal do indivíduo.** Cada usuário
  — não o admin do tenant — precisa conseguir ver e pedir a exclusão do próprio histórico de chat
  e da própria pasta de memória. Isso vale mesmo dentro do mesmo tenant: admin de empresa não é
  automaticamente autorizado a ler o chat privado de um funcionário.
- **Dado de processo (`ExecucaoDeEtapa` + `rotina.md`) é registro de auditoria do negócio, não
  dado pessoal de quem executou a ação.** Aqui vale o princípio 4 do guia principal ("toda ação é
  auditada") — não pode ser livremente apagado a pedido de um usuário, porque isso destruiria o
  histórico do processo para todo o departamento. Se um pedido de exclusão de dados pessoais
  esbarrar em algo registrado num `ExecucaoDeEtapa` (ex: nome de quem aprovou uma cotação), a
  resposta correta é anonimizar a referência à pessoa, não apagar o registro do processo — e essa
  decisão deveria passar por uma política de retenção definida com jurídico, não ser uma função
  simples de "apagar tudo que tiver esse `usuario_id`".
