# Spec: Cancelamento de e-mail para concluintes do Ensino Médio

- **ID:** 2026-04-cancelamento-email-concluintes-em
- **Status:** Entregue
- **Atualizada em:** 2026-08-17 por IA: Codex
- **Playbook:** ajuste-sql-procedure + rotina-agendada + integracao-externa
- **Rastreabilidade:** Sem issue/ClickUp vinculados nesta sessão.

## Objetivo
- **Funcional:** impedir cancelamento antecipado do Gmail institucional de alunos que concluíram o Ensino Médio no período letivo anterior, liberando o cancelamento somente após a carência de 6 meses.
- **Técnico:** expor a coluna `IN_Cancela_Email` nas consultas de cancelamento, consumir essa coluna no fluxo de revogação de aluno e criar uma rotina específica para buscar concluintes do Ensino Médio elegíveis ao cancelamento de e-mail.

## Contexto / motivação
O fluxo atual de cancelamento de aluno chama `PR_MGA_Consulta_Aluno_Cancelamento_Acesso`, mapeia o retorno em `AlunoCancelamentoTotvsDto` e executa `AccessProvisioningService.revogarAcesso`. Dentro da revogação, `_cancelarEmailInstitucional` chama `GoogleService.cancelarEmailInstitucional`, que já preserva a regra técnica de ambiente (`NODE_ENV !== 'production'` não suspende conta real).

A procedure atual inclui no mesmo conjunto temporário alunos cancelados/falecidos, alunos de curso extra e alunos que finalizaram o último ano do Ensino Médio no período letivo anterior. A nova regra exige distinguir a origem "conclusão de EM" para que o acesso possa continuar sendo revogado conforme regra atual, mas o Gmail institucional só seja cancelado quando `IN_Cancela_Email = 1`.

Referências de contexto: `docs/contexto/regras-negocio.md`, `docs/contexto/integracoes.md`, `docs/contexto/comandos.md`.

## Premissas
- O período letivo regular é anual e `CODPERLET` representa o ano civil, por exemplo `2025`.
- "Último dia do ano letivo anterior" será tratado como `31/12/<periodo_letivo_anterior>`.
- A liberação ocorre em `30/06` do ano seguinte ao período letivo concluído. Exemplo: concluinte de 2025 fica elegível em `2026-06-30`.
- Para todos os casos de cancelamento que não sejam conclusão do Ensino Médio do período anterior, `IN_Cancela_Email = 1`.
- O cron específico de concluintes EM deve cancelar somente o Gmail institucional; não deve executar revogação completa de usuário, usuário-filial ou perfis.
- ClickUp e GitHub Issues não serão atualizados sem pedido explícito ou ferramenta/contexto operacional configurado.

## Escopo
- Alterar a procedure de cancelamento de aluno para retornar `IN_Cancela_Email`.
- Calcular explicitamente `IN_Cancela_Email` em cada origem de carga da procedure, deixando `0` apenas para conclusão de EM antes da carência.
- Ajustar o DTO de cancelamento de aluno para aceitar `IN_Cancela_Email`.
- Propagar `IN_Cancela_Email` para `PessoaAcessoContext`.
- Fazer `_cancelarEmailInstitucional` respeitar `IN_Cancela_Email`, mantendo as condições técnicas já existentes em `GoogleService`.
- Criar query/procedure específica para concluintes do Ensino Médio elegíveis ao cancelamento de e-mail, porque esse caso não deve depender necessariamente do fluxo normal de cancelamento.
- Criar cron/job Bull específico para buscar esses concluintes e cancelar os e-mails de forma idempotente.
- Registrar logs estruturados de elegibilidade, skip e resultado do Google.

## Fora de escopo
- Alterar regra de inativação do usuário TOTVS.
- Alterar regra de revogação de `SUSUARIOFILIAL` ou perfis.
- Alterar o contrato técnico do Google Workspace além do uso condicional já existente.
- Criar tela ou interface de acompanhamento.
- Aplicar procedure diretamente em ambiente TOTVS nesta sessão.

## Contratos
- **Endpoints / rotas:** não há novo endpoint obrigatório. Reprocessamento manual pode ser avaliado em implementação futura, seguindo o padrão atual de sync.
- **Entrada (payload/DTO):**
  - `AlunoCancelamentoTotvsDto` deve incluir `IN_Cancela_Email: 0 | 1`.
  - Durante rollout, o backend deve tolerar ausência temporária do campo e assumir comportamento conservador definido na implementação. Recomendação: assumir `1` para compatibilidade com procedure antiga, mas logar ausência para acelerar correção de ambiente.
- **Saída das procedures:**
  - `PR_MGA_Consulta_Aluno_Cancelamento_Acesso` deve retornar todas as colunas atuais e adicionar `IN_Cancela_Email`.
  - Para conclusão de EM do período anterior:
    - `IN_Cancela_Email = 0` antes da data de liberação.
    - `IN_Cancela_Email = 1` a partir da data de liberação.
  - Para demais origens de cancelamento: `IN_Cancela_Email = 1`.
- **Modelo de dados tocado:** procedure SQL Server em `apps/docs/2026-03-20 RARAGAO PR_MGA_Consulta_Aluno_Cancelamento_Acesso - MGA.sql` e novo script/procedure em `apps/docs/`.
- **Integrações externas:** Google Workspace continua sendo acionado por `GoogleService.cancelarEmailInstitucional`; autenticação, idempotência de conta já suspensa e skip por ambiente permanecem no adapter.
- **Jobs/filas:** fila `aluno-sync`, novo job de lote por coligada e novo job individual para cancelamento de Gmail de concluinte EM, como fluxo complementar ao cancelamento normal.

## Regras de negócio / invariantes
- Aluno concluinte do Ensino Médio no período letivo anterior não pode ter e-mail institucional cancelado antes da carência de 6 meses após o último dia daquele período letivo.
- A regra de `IN_Cancela_Email` só controla o cancelamento de Gmail; ela não deve bloquear revogação de acesso TOTVS, filial ou perfis quando o aluno estiver elegível por outras regras.
- O Google só deve ser chamado quando `IN_Cancela_Email = 1` e as regras atuais de e-mail institucional também forem verdadeiras.
- Em ambientes não produtivos, o Google deve continuar retornando skip técnico mesmo quando `IN_Cancela_Email = 1`.
- A rotina específica de concluintes EM deve ser reexecutável sem gerar erro por e-mail já cancelado.

## Critérios de aceite
- [x] A procedure geral de cancelamento de aluno retorna `IN_Cancela_Email` para todos os registros.
- [x] Registros de cancelamento normal, falecimento e curso extra retornam `IN_Cancela_Email = 1`.
- [x] Registros originados de conclusão do Ensino Médio no período anterior retornam `IN_Cancela_Email = 0` antes da carência e `1` após a carência.
- [x] O backend não chama `GoogleService.cancelarEmailInstitucional` quando `IN_Cancela_Email = 0`.
- [x] O backend mantém a revogação de usuário-filial/perfis conforme regras existentes mesmo quando o e-mail for preservado.
- [x] Existe query/procedure separada para buscar somente concluintes EM elegíveis ao cancelamento de Gmail.
- [x] Existe cron/job específico para enfileirar e processar cancelamento de Gmail de concluintes EM elegíveis.
- [x] Jobs individuais têm chave/deduplicação por coligada, período letivo anterior e RA ou pessoa.
- [x] Logs distinguem `email_cancel_skip_in_cancela_email`, `email_cancel_google_skipped_non_production`, `email_cancel_google_already_suspended` e falha de integração.
- [x] `pnpm --dir apps/backend build` passa após a implementação.

## Casos a cobrir
- **Caminho feliz:** aluno cancelado regular no período atual retorna `IN_Cancela_Email = 1` e segue cancelamento de Gmail.
- **Caminho feliz:** concluinte EM de 2025 processado em 2026-06-30 retorna elegível e tem Gmail cancelado.
- **Borda:** concluinte EM de 2025 processado antes da liberação retorna `IN_Cancela_Email = 0` na procedure geral e não chama Google.
- **Borda:** concluinte EM elegível sem e-mail institucional calculável deve gerar skip sem erro fatal.
- **Borda:** aluno da coligada 5/6 deve manter regra atual de resolução por pessoa/coligada.
- **Falha de integração:** erro do Google deve ser logado e permitir retry do job conforme padrão Bull.
- **Risco de regressão:** ausência temporária de `IN_Cancela_Email` em algum ambiente não deve quebrar o build nem impedir demais revogações, mas deve ficar visível em log.

## Impactos técnicos (camadas)
- **SQL Server:** calcular `IN_Cancela_Email` nas cargas da temporária; criar procedure/query específica de concluintes EM elegíveis; revisar índices temporários para não degradar a procedure geral.
- **Backend:** atualizar DTO, mapper para `PessoaAcessoContext`, guarda em `_cancelarEmailInstitucional`, processor e cron novos para concluintes EM.
- **Frontend:** não aplicável.
- **Integrações:** Google Workspace continua com mesmo adapter e mesmas credenciais; a regra de negócio fica antes da chamada.
- **Jobs/Filas:** novo fluxo Bull independente do cancelamento geral, com lote por coligada e processamento individual idempotente.
- **DevOps/Observabilidade:** habilitar cron apenas quando aprovado; logs devem permitir contar elegíveis, cancelados, skips e falhas por coligada/período.

## Riscos e decisões em aberto
- **Compatibilidade de rollout:** se o backend for publicado antes da procedure, decidir entre fallback `IN_Cancela_Email = 1` ou bloqueio conservador. Recomenda-se fallback `1` só para não regredir cancelamentos atuais, com log de contrato ausente.
- **Escopo de entidades:** confirmado que a nova coluna entra na procedure de cancelamento de alunos; a exceção é de aluno concluinte EM, não de responsáveis/funcionários.
- **Nome da procedure nova:** confirmar padrão de nomenclatura com DBA antes de aplicar em TOTVS.

## Plano de execução
1. [x] SQL Server: alterar `#tmp_aluno_cancelado` para retornar `IN_Cancela_Email` no `SELECT` final.
2. [x] SQL Server: implementar procedure/query específica `PR_MGA_Consulta_Aluno_Conclusao_EM_Cancelamento_Email`, filtrando concluintes EM já elegíveis.
3. [x] Backend DTO: adicionar `IN_Cancela_Email` ao schema de cancelamento de aluno e ao contexto de provisionamento.
4. [x] Backend revogação: ajustar `_cancelarEmailInstitucional` para bloquear chamada Google quando `IN_Cancela_Email = 0`, com log explícito.
5. [x] Backend TOTVS: adicionar método no `TotvsService` para consultar concluintes EM elegíveis.
6. [x] Jobs/cron: criar cron diário de madrugada para enfileirar lote por coligada e jobs individuais de cancelamento de Gmail de concluintes EM.
7. [x] Validação: revisar SQL estaticamente e executar build backend.

## Query/procedure prevista
Forma recomendada para a regra de carência, sujeita à confirmação da data oficial do período letivo:

```sql
declare @dt_fim_periodo_anterior date =
  datefromparts(try_convert(int, @prm_cd_periodo_letivo_anterior), 12, 31);

declare @dt_libera_cancelamento_email date =
  dateadd(month, 6, @dt_fim_periodo_anterior);

case
  when TP_Origem_Cancelamento = 'CONCLUSAO_EM_ANTERIOR'
   and cast(getdate() as date) < @dt_libera_cancelamento_email
  then 0
  else 1
end as IN_Cancela_Email
```

Para o cron específico, a consulta deve reaproveitar os filtros já existentes do bloco de conclusão de EM:

```sql
where prlt.codperlet = @prm_cd_periodo_letivo_anterior
  and hblt.complemento = 'EM'
  and mtpl.codstatusres = 5
  and hblt.codhabilitacao = '3S2'
  and stt.descricao = 'Ativo'
  and cast(getdate() as date) >= @dt_libera_cancelamento_email
```

## Cron previsto
- Nome sugerido: `handleCancelamentoEmailConcluintesEnsinoMedioCron`.
- Agenda sugerida: diária de madrugada, após o cancelamento geral, por exemplo `0 30 2 * * *`.
- Lote: buscar coligadas habilitadas, calcular período letivo anterior a partir do ano corrente ou configuração já usada no serviço, consultar concluintes EM elegíveis por coligada e enfileirar job individual.
- Job individual: validar `IN_Cancela_Email = 1`, montar e-mail institucional, chamar `GoogleService.cancelarEmailInstitucional`, registrar status e permitir retry.
- Idempotência: chave do job por `cancelamento-email-em:{periodoAnterior}:{coligada}:{RA ou CD_Pessoa}`.

## Validação
- `pnpm --dir apps/backend build` executado com sucesso.
- SQL revisado estaticamente; aplicação e validação em SQL Server/TOTVS permanecem pendentes de ambiente.
