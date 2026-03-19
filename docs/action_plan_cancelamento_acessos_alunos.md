# Plano de Ação: Sincronização de Cancelamento de Acessos de Alunos

## 1. Visão Geral

O objetivo desta feature é implementar um fluxo de revogação de acessos para alunos a partir da procedure `dbo.PR_MGA_Consulta_Aluno_Cancelamento_Acesso`, garantindo que a mesma base técnica possa ser reutilizada futuramente para funcionários e responsáveis.

O desenho deve suportar dois modos de execução com a mesma regra de negócio centralizada:

- execução em lote por período letivo e coligada, para rotinas agendadas;
- execução unitária por aluno, para cenários de reprocessamento pontual de um único registro alterado.

O fluxo deve tratar três frentes de cancelamento de forma idempotente e desacoplada:

- revogação de acesso Gmail institucional do aluno;
- desabilitação do usuário no TOTVS quando permitido pela regra de negócio;
- remoção seletiva apenas dos perfis de aluno quando a pessoa também for funcionário ou responsável.

---

## 2. Tarefas para o Banco de Dados

- **Tabelas a serem criadas/alteradas:** nenhuma tabela funcional é obrigatória para a primeira entrega; avaliar futuramente a criação das tabelas `TB_MGA_Integracao_Acesso_Evento` e `TB_MGA_Integracao_Acesso_Log` para rastrear origem do disparo (`BATCH`, `REPROCESSAMENTO`) e auditoria das ações de cancelamento por entidade e coligada.
- **Procedures/Consultas:** validar e ajustar a `dbo.PR_MGA_Consulta_Aluno_Cancelamento_Acesso` para retornar um contrato estável com, no mínimo, `CD_Coligada`, `CD_Periodo_Letivo`, `CD_Pessoa`, `CD_Registro_Academico`, `CD_Usuario`, `CD_CPF`, `NM_Aluno`, `TX_Email_Pessoa`, `TX_Email_Usuario`, `IN_Usuario_Ativo`, `IN_Existe_Matricula_Regular`, `IN_Inativo_Regular`, `IN_Inativo_Extra`, `IN_Funcionario` e `IN_Responsavel`; prever também uma estratégia para execução unitária por aluno, preferencialmente adicionando filtro opcional por `CD_Registro_Academico` na própria procedure ou, caso a governança do banco não permita alteração de assinatura, criando uma consulta irmã com o mesmo layout de retorno.
- **Prisma Schema:** mapear no `schema.prisma` apenas as tabelas de evento/log se elas forem aprovadas; caso o escopo permaneça sem persistência adicional, não há alteração obrigatória de schema para a primeira fase.

## 3. Tarefas para o Backend

- **Módulos:** alterar `SyncModule`, `AlunoSyncCron`, `AlunoSyncController`, `AlunoSyncProcessor`, `TotvsModule`, `GoogleModule` e evoluir o módulo atual de provisionamento para um serviço genérico de ciclo de vida de acesso capaz de executar também revogação; criar DTO específico para cancelamento retornado pela procedure de alunos e manter a mesma orquestração para lote e disparo unitário sem duplicar regra no controller.
- **Regras de Negócio:** centralizar a decisão de cancelamento em um serviço reutilizável por tipo de entidade; executar o mesmo caso de uso tanto no lote quanto no disparo unitário; cancelar o Gmail apenas quando o aluno estiver marcado para cancelamento pela combinação de `IN_Existe_Matricula_Regular` com `IN_Inativo_Regular` e o e-mail pertencer a um domínio institucional de aluno configurado pela coligada; desabilitar usuário TOTVS somente quando `CD_Usuario` existir, o usuário estiver ativo, a pessoa não for funcionário nem responsável e a condição de inativação do aluno estiver caracterizada simultaneamente por `IN_Inativo_Regular` e `IN_Inativo_Extra`; remover perfis de aluno apenas quando o usuário não puder ser desabilitado por manter vínculo como funcionário ou responsável, e ainda assim somente quando `IN_Inativo_Regular` e `IN_Inativo_Extra` estiverem ambos marcados; tornar a remoção de perfis orientada por constante central de perfis por `CD_Coligada`, `CD_Sistema` e `TP_Entidade`, evitando regras hardcoded no processor; garantir idempotência, de forma que reprocessamentos duplicados não gerem erro se o e-mail já estiver suspenso, o usuário já estiver inativo ou os perfis de aluno já tiverem sido removidos.
- **Rotas e DTOs:** criar um DTO de consulta de cancelamento com os campos da procedure usando a nomenclatura corporativa (`CD_Registro_Academico`, `CD_Coligada`, `CD_Usuario`, `IN_Usuario_Ativo`, `IN_Inativo_Regular`, `IN_Inativo_Extra`, `IN_Funcionario`, `IN_Responsavel`, `TX_Email_Usuario`, `TX_Email_Pessoa`); expor uma rota operacional para lote, por exemplo `POST /sync/alunos/cancelamentos`, recebendo `CD_Periodo_Letivo` e `CD_Coligada`; expor uma rota unitária para reprocessamento, por exemplo `POST /sync/alunos/cancelamentos/aluno`, recebendo `CD_Registro_Academico`, `CD_Coligada`, `CD_Periodo_Letivo` e `TP_Origem_Disparo`.
