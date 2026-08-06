# Adendo — Regra Tipo de etapa × Executor (Orquestrador)

> Complementa a seção 6 (Motor de orquestração) do `COREPILOT_GUIA_IMPLEMENTACAO.md`.
> Contexto: no builder do Orquestrador (Claude Design), os campos **Tipo de etapa** e
> **Executor** estavam se comportando como dois selects independentes, permitindo combinações
> que não fazem sentido em runtime (ex: "Interação do usuário" com Executor "Automático").

## Problema

`Tipo de etapa` e `Executor` não são dimensões independentes. Na maioria dos casos, o Tipo já
implica um Executor único. Deixar os dois campos livres cria estados que a engine não sabe
executar e confunde quem está montando o fluxo.

## Regra: Executor é derivado do Tipo de etapa

| Tipo de etapa | Executor válido | Comportamento do campo Executor |
|---|---|---|
| Tarefa do agente | Agente de IA | Travado, pré-preenchido |
| Interação do usuário | Usuário | Travado, pré-preenchido |
| Aprovação | Usuário **ou** Agente + usuário | Dropdown restrito a essas duas opções |
| Decisão automática | Automático | Travado, pré-preenchido |
| Integração | Integração **ou** Agente + Integração | Dropdown restrito a essas duas opções |
| Espera / SLA | Automático (timer) | Travado, pré-preenchido |

**Observação importante**: a opção **"Agente + Integração"** precisa ser adicionada à lista de
Executor — hoje ela não existe no dropdown, mas é o caso real da etapa de Finalização do fluxo de
Compras (agente redige a mensagem, integração dispara o WhatsApp).

## Comportamento esperado no builder

1. Ao selecionar o **Tipo de etapa**, o campo **Executor** é atualizado automaticamente:
   - Se o Tipo tem executor único → campo preenchido e desabilitado (sem dropdown aberto).
   - Se o Tipo tem mais de uma opção válida (Aprovação, Integração) → dropdown aberto, mas
     **filtrado** apenas para as opções da tabela acima.
2. Trocar o Tipo depois de já ter escolhido um Executor reseta o Executor para o valor padrão
   daquele novo Tipo (não preserva uma escolha agora inválida).
3. No card do fluxo (visão geral do canvas), a etiqueta passa a mostrar uma informação
   combinada e não duas tags redundantes — ex: `Tarefa do agente · Agente de IA` em vez de
   `Tarefa do agente` + `Automático` lado a lado.

## Validação no backend (não só no frontend)

A regra da tabela acima precisa ser validada também ao salvar/publicar o fluxo (não só no
formulário), para impedir que um fluxo publicado via API ou importado de outro lugar contenha uma
combinação Tipo/Executor inválida. Sugestão: validar isso no mesmo passo em que o schema de saída
da Skill é validado (seção 5 do guia principal), antes de permitir publicação da versão do fluxo.
