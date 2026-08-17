# Spec: [título curto da demanda]

- **ID:** [AAAA-NN-slug]
- **Status:** [ Rascunho | Aprovada | Em execução | Entregue ]
- **Atualizada em:** [AAAA-MM-DD] por [IA: Claude | Codex] — [autor humano, se relevante]
- **Playbook:** [ nova-funcionalidade | integracao-externa | rotina-agendada | refatoracao | correcao-bug | ajuste-sql-procedure | spike ]
- **Rastreabilidade:** [issue/ClickUp/PR, se houver]

## Objetivo
- **Funcional:** [que problema do usuário/negócio isto resolve]
- **Técnico:** [o que muda no sistema em termos técnicos]

## Contexto / motivação
[Por que agora. Links para `docs/contexto/` relevante (regras-negocio, integracoes, glossario, ADRs). Não duplicar — referenciar.]

## Premissas
- [Premissa explícita; o que se assume verdadeiro]

## Escopo
- [O que esta demanda entrega]

## Fora de escopo
- [O que explicitamente NÃO entra]

## Contratos
[Defina os contratos que a implementação deve respeitar. Inclua só o que se aplica.]
- **Endpoints / rotas:** [método, caminho, auth]
- **Entrada (payload/DTO):** [campos, tipos, validação]
- **Saída (resposta/evento):** [formato, códigos de status/erro]
- **Modelo de dados tocado:** [tabelas/colunas/procedures — detalhe no `padroes-sql-server`]
- **Integrações externas:** [sistema, autenticação, timeout, retry, idempotência]

## Regras de negócio / invariantes
- [Regra central que a entrega precisa garantir; o que nunca pode ser violado]

## Critérios de aceite
> Verificáveis e objetivos. São o contrato de pronto desta demanda — a validação confere contra eles.
- [ ] [critério 1]
- [ ] [critério 2]

## Casos a cobrir
- **Caminho feliz:** [...]
- **Dados inválidos:** [...]
- **Permissão / perfil:** [...]
- **Borda:** [...]
- **Falha de integração / reprocessamento:** [se aplicável]
- **Risco de regressão:** [o que pode quebrar perto daqui]

## Impactos técnicos (camadas)
- **SQL Server:** [...]
- **Backend:** [...]
- **Frontend:** [se houver]
- **Integrações:** [...]
- **Jobs/Filas:** [...]
- **DevOps/Observabilidade:** [...]

## Riscos e decisões em aberto
- [Risco] — [mitigação]
- [Decisão pendente] — [quem decide; vira ADR em `docs/contexto/decisoes/` se for cara de reverter]

## Plano de execução
[Decomposição em frentes. Se houver trabalho paralelo, defina fronteiras de ownership e ordem de integração conforme `padroes-orquestracao`.]
1. [frente — camada/agente — arquivos/módulos de ownership]
2. [...]
