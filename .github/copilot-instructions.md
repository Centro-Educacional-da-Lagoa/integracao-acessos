# Sistema de Roteamento de Agentes (Multi-Agent System)

Este repositório utiliza uma arquitetura de múltiplos agentes para desenvolvimento. As regras de cada especialista estão localizadas na pasta `.agents/`.

Sempre que o usuário pedir para executar uma etapa de um Plano de Ação (`action_plan_*.md`), você DEVE seguir este fluxo:

1. **Identificar o Domínio:** Analise a tarefa solicitada e decida qual é o domínio principal (Arquitetura, Banco de Dados, Backend ou Frontend).
2. **Carregar o Especialista:** Antes de escrever qualquer código, leia silenciosamente as regras do arquivo correspondente na pasta `.agents/`:
   - Se for planejamento ou divisão de tarefas -> Leia `.agents/agent-architect.md`
   - Se for SQL Server, Tabelas, Procedures ou Prisma -> Leia `.agents/agent-database.md`
   - Se for rotas, regras de negócio, NestJS, Services, Controllers -> Leia `.agents/agent-backend.md`
3. **Executar:** Escreva o código assumindo 100% a persona e as restrições do agente selecionado, respeitando estritamente os padrões de nomenclatura da empresa (CD*, NM*, TX\_, etc.).
