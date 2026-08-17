# ClickUp do Projeto

> Fonte única da config de ClickUp, **compartilhada entre IAs** (Codex e Claude leem daqui).
> Só relevante se este projeto usa ClickUp. Se não usa, deixe explícito e ignore o resto.

**Usa ClickUp?** [ sim | não ]

## Gatilho de uso (importante)
O uso do ClickUp é **sob demanda explícita** — nenhuma IA deve criar/atualizar/mover tarefas, iniciar/encerrar timer ou aplicar a tag `daily` **sem sinal explícito** do usuário (ex.: "registra no clickup", "abre a tarefa", "fecha a tarefa X", "inicia o timer"). Sem sinal, não age (no máximo, ao final de uma demanda grande, pode *perguntar* se deve registrar).

## Escopo (obrigatório se usa ClickUp)
- **list_id do projeto:** `[ID]`  ← as IAs atuam **exclusivamente** nesta lista; nunca usar outra como fallback
- **Workspace / Space / Folder:** [...]
- **Responsável padrão:** [...]

## Fluxo de status
`Pendente → Em andamento → Em validação`
- Ao iniciar o desenvolvimento (quando sinalizado): mover para `Em andamento` (+ timer, se suportado)
- Ao concluir (quando sinalizado): encerrar timer + mover para `Em validação`

## Tag `daily`
Reflete apenas o foco real do dia (trabalhado ontem + entra no foco hoje). Aplicar/remover **só** quando solicitado.

## Capabilities confirmadas do MCP
> Validar antes de usar — o MCP remoto pode não expor tudo.
- [ ] timer / time entry
- [ ] tags
- [ ] custom fields
- [ ] attachments
- [ ] subtasks
