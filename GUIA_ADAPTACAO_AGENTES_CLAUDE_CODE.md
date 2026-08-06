# Guia de Adaptação — Step "Agente e Instruções" (CorePilot)

> Este documento é um complemento tático ao `COREPILOT_GUIA_IMPLEMENTACAO.md` (que continua sendo a fonte de verdade arquitetural). Aqui detalhamos especificamente a expansão do formulário de criação de agentes, hoje limitado a `Nome do agente`, `Função` e `Objetivo`, para um modelo que gera agentes Claude funcionais em produção.

---

## 1. Problema atual

O formulário na tela "Agente e instruções" captura só metadado de exibição. Isso não é suficiente para:

- Montar um `system prompt` consistente e determinístico;
- Escopar quais ferramentas/skills o agente pode chamar (regra já definida: escopo por step);
- Definir o contrato de entrada/saída em JSON (regra já definida: schemas declarados);
- Implementar guardrails e regras de escalonamento para humano;
- Suportar loops de correção com `motivo_correcao`.

---

## 2. Novo modelo de dados

Adicionar ao schema do agente (Prisma/SQL — ajustar à convenção já usada no projeto):

```prisma
model Agent {
  id                String   @id @default(uuid())
  moduleId          String
  name              String
  role              String   // "Função" atual
  objective         String   // "Objetivo" atual
  systemPrompt      String   @db.Text   // NOVO — instruções completas
  inputSchema       Json     // NOVO — contrato de entrada (JSON Schema)
  outputSchema      Json     // NOVO — contrato de saída (JSON Schema)
  allowedTools      Json     // NOVO — lista de tool names / MCP connectors habilitados
  guardrails        String?  @db.Text   // NOVO — restrições explícitas
  escalationRule    String?  @db.Text   // NOVO — quando devolver para humano
  model             String   @default("claude-sonnet-4-6") // NOVO — qual modelo usar
  temperature       Float    @default(0.3)                  // NOVO
  maxTokens         Int      @default(2000)                 // NOVO
  status            AgentStatus @default(DRAFT)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

**Observação:** `inputSchema`/`outputSchema` devem ser JSON Schema válido — isso permite validação automática antes/depois da chamada à API e alimenta diretamente as transições de estado do BPM engine.

---

## 3. Novos campos na UI (step 4 — "Agente e instruções")

Reorganizar o step em **abas ou seções colapsáveis** (o form atual vira só a primeira seção):

### Seção A — Identidade do agente (existente)
- Nome do agente
- Função
- Objetivo

### Seção B — Instruções (NOVA)
- Textarea grande: **Instruções detalhadas** (system prompt)
  - Oferecer um botão "Gerar rascunho com IA" que monta um draft a partir de Função + Objetivo, usando a própria API Claude (meta-uso: usar Claude para escrever o prompt do agente)

### Seção C — Contrato de dados (NOVA)
- Editor JSON (ou form estruturado campo-a-campo) para **Schema de entrada**
- Editor JSON para **Schema de saída**
- Validação em tempo real (JSON Schema válido)

### Seção D — Ferramentas e permissões (NOVA)
- Multi-select: quais tools/skills/MCP connectors esse agente pode usar
  - Ex.: busca web, base de conhecimento do módulo, conector TOTVS RM, WhatsApp
  - Isso conecta com o step 5 "Permissões" já existente no fluxo — decidir se fica ali ou aqui (recomendo aqui, já que é escopo técnico do agente, não de usuário)

### Seção E — Guardrails e escalonamento (NOVA)
- Textarea: **O que este agente NÃO deve fazer**
- Textarea: **Quando escalar para um humano**

### Seção F — Configuração do modelo (NOVA, avançado/colapsado por padrão)
- Modelo (dropdown: sonnet, opus, haiku)
- Temperature (slider)
- Max tokens

---

## 4. Template de geração do system prompt final

O `systemPrompt` salvo no banco deve ser **montado dinamicamente** a partir dos campos, não digitado cru pelo usuário final (ele edita as seções, o backend compõe o prompt). Estrutura sugerida:

```
Você é {nome_agente}, um agente especialista em {função}, atuando no módulo {módulo} do CorePilot.

OBJETIVO:
{objetivo}

INSTRUÇÕES:
{instrucoes_detalhadas}

FORMATO DE ENTRADA:
Você receberá dados no seguinte formato JSON:
{input_schema}

FORMATO DE SAÍDA (OBRIGATÓRIO):
Responda SEMPRE e SOMENTE com um JSON válido no seguinte formato, sem texto adicional:
{output_schema}

RESTRIÇÕES:
{guardrails}

ESCALONAMENTO:
{escalation_rule}
Se precisar escalar, defina "necessita_revisao_humana": true e preencha "motivo_revisao".
```

Isso mantém consistência entre agentes e facilita auditoria/versionamento (já previsto na arquitetura).

---

## 5. Exemplo completo preenchido — Cotador de Peças Agrícolas

```json
{
  "name": "Cotador de Peças Agrícolas",
  "role": "Especialista em cotação de peças para máquinas agrícolas",
  "objective": "Analisar pendências de compra, identificar peças e buscar preços de mercado atualizados.",
  "systemPrompt": "...(gerado pelo template acima)...",
  "inputSchema": {
    "type": "object",
    "properties": {
      "pendencia_id": { "type": "string" },
      "peca": { "type": "string" },
      "maquina_modelo": { "type": "string" },
      "quantidade": { "type": "integer" },
      "urgencia": { "type": "string", "enum": ["baixa", "media", "alta"] }
    },
    "required": ["pendencia_id", "peca", "maquina_modelo", "quantidade"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "pendencia_id": { "type": "string" },
      "peca_identificada": { "type": "string" },
      "fornecedores": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "nome": { "type": "string" },
            "preco": { "type": "number" },
            "prazo_entrega_dias": { "type": "integer" },
            "condicao_pagamento": { "type": "string" },
            "tipo_peca": { "type": "string", "enum": ["original", "generica"] }
          }
        }
      },
      "recomendacao": { "type": "string" },
      "necessita_revisao_humana": { "type": "boolean" },
      "motivo_revisao": { "type": "string" }
    },
    "required": ["pendencia_id", "fornecedores", "necessita_revisao_humana"]
  },
  "allowedTools": ["web_search", "knowledge_base_query", "totvs_rm_connector"],
  "guardrails": "Nunca aprove ou feche uma compra. Nunca invente preço sem fonte. Sempre busque no mínimo 3 fornecedores.",
  "escalationRule": "Se não encontrar 3 fornecedores confiáveis ou se o preço variar mais de 40% entre fontes, marcar necessita_revisao_humana.",
  "model": "claude-sonnet-4-6",
  "temperature": 0.2,
  "maxTokens": 2000
}
```

---

## 6. Integração técnica com a API Claude

Padrão de chamada (camada "Claude API" já prevista na arquitetura):

```javascript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: agent.model,
    max_tokens: agent.maxTokens,
    temperature: agent.temperature,
    system: renderSystemPrompt(agent), // template da seção 4
    messages: [
      { role: "user", content: JSON.stringify(stepInputData) }
    ],
    tools: resolveTools(agent.allowedTools) // mapeia para definições de tool/MCP
  })
});

const data = await response.json();
const output = parseAndValidateAgainstSchema(data, agent.outputSchema);
```

Pontos que já estavam definidos na arquitetura e continuam valendo aqui:
- Validar a saída contra `outputSchema` antes de permitir transição de estado no BPM;
- Se `necessita_revisao_humana: true`, o BPM engine deve rotear para o board Kanban em vez de avançar automaticamente;
- Loops de correção reenviam ao agente com `motivo_correcao` adicionado ao `messages`.

---

## 7. Prompt sugerido para orientar o Claude Code

Ao abrir sessão no Claude Code, cole algo como:

> Vamos expandir o step "Agente e instruções" do módulo de criação de agentes do CorePilot. Leia `COREPILOT_GUIA_IMPLEMENTACAO.md` e `CLAUDE.md` para contexto arquitetural. Implemente as mudanças descritas em `GUIA_ADAPTACAO_AGENTES_CLAUDE_CODE.md`: (1) schema do agente no banco, (2) novas seções no formulário do frontend, (3) função `renderSystemPrompt()` que monta o prompt final a partir dos campos, (4) validação de JSON Schema nos campos de entrada/saída, (5) endpoint de teste ("Testar módulo") que executa uma chamada real à API Claude com dados de exemplo e mostra o output validado. Priorize consistência com os agentes que já existem no módulo de Compras.

---

## 8. Checklist de validação antes de publicar um agente

- [ ] `systemPrompt` renderizado sem campos vazios
- [ ] `inputSchema` e `outputSchema` são JSON Schema válidos
- [ ] Pelo menos uma tool/skill habilitada (ou justificativa de agente "puro raciocínio")
- [ ] Guardrails preenchidos (não pode ficar em branco para agentes que tocam dados financeiros/compras)
- [ ] Regra de escalonamento definida
- [ ] Teste no botão "Testar módulo" retornou JSON válido e aderente ao schema
