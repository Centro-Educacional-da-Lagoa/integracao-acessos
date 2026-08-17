# Diário de Sessões

> Histórico append-only. **Adicione uma entrada no topo ao final de cada sessão.** Não reescreva entradas antigas.

<!-- Modelo de entrada (copie para o topo):

## [AAAA-MM-DD] — [IA: Claude | Codex]
- **Demanda:** [o que foi pedido]
- **Feito:** [o que foi entregue/alterado]
- **Decisões:** [decisões tomadas; linke ADR em decisoes/ se houver]
- **Arquivos tocados:** [principais arquivos/módulos]
- **Validação:** [como foi validado / o que ficou pendente de validar]
- **Próximo:** [o que fica para a próxima sessão]

-->

## 2026-08-17 — Codex
- **Demanda:** Implementar spec aprovada para alocações ativas regular/extra e mapear webhook vindo da coligada 6.
- **Feito:** Criado contrato `JS_Alocacoes_Ativas`; backend parseia e usa alocações reais para `SUSUARIOFILIAL` e perfis; webhook preserva origem 6 e tenta resolver RA 5 por `CODPESSOA`; scripts SQL versionados retornam JSON e removem remapeamento 6→5 nas alocações.
- **Decisões:** Coligada 6 provisiona acesso/perfil na coligada 6. RA 5 é apenas ponte de compatibilidade para procedures legadas quando webhook chega com RA da 6.
- **Arquivos tocados:** `apps/backend/src/modules/sync/**`, `apps/backend/src/modules/integrations/totvs/**`, `apps/docs/PR_MGA_Consulta_*`, `docs/specs/2026-02-alocacoes-ativas-regular-extra.md`, `docs/contexto/*`.
- **Validação:** `pnpm --dir apps/backend build` passou. SQL precisa aplicação/validação em homologação TOTVS.
- **Próximo:** Aplicar procedures em homologação e reprocessar casos regular cancelado + extra ativo, responsável financeiro e webhook coligada 6.

## 2026-08-17 — Codex
- **Demanda:** Analisar `logs.txt` para entender erros de provisionamento/verificação prévia.
- **Feito:** Identificados dois grupos de falha e implementadas guardas. Após novo log, ajustado fallback para responsável financeiro com CPF e sem `CD_Pessoa`: provisiona usuário/filial/perfil por CPF sem chamar `EduPessoaData/`.
- **Decisões:** Guardas locais devem bloquear entradas inválidas antes de chamar DataServer TOTVS; exceção controlada para responsável financeiro vindo de CFO sem `PPESSOA` resolvida.
- **Arquivos tocados:** `apps/backend/src/modules/sync/responsavel-sync.processor.ts`, `apps/backend/src/modules/sync/access-provisioning/access-provisioning.service.ts`, `apps/backend/src/modules/integrations/totvs/totvs.service.ts`, `docs/specs/2026-01-guardas-provisionamento-totvs.md`, `docs/specs/README.md`, `docs/contexto/estado-atual.md`, `docs/contexto/diario.md`.
- **Validação:** `pnpm --dir apps/backend build` executado com sucesso após os dois ajustes.
- **Próximo:** Reprocessar webhook do aluno `2027100003` e validar `SUSUARIOFILIAL` + `RespFinanc_CEL` para o CPF `42848049014`.

## 2026-08-13 — Codex
- **Demanda:** Corrigir remoção indevida de usuário-filial quando matrícula regular é cancelada, mas existe matrícula de curso extra ativa.
- **Feito:** Alterado `AccessProvisioningService.revogarAcesso` para preservar `SUSUARIOFILIAL` quando `IN_Existe_Matricula_Extra=1` e `IN_Inativo_Extra=0`. Após log de regressão, também foi ajustado `syncAluno` para propagar flags de extra e evitar saneamento de filiais na ativação quando extra está ativo.
- **Decisões:** Usar as flags já retornadas pela procedure de cancelamento de aluno; não alterar SQL nesta demanda.
- **Arquivos tocados:** `apps/backend/src/modules/sync/access-provisioning/access-provisioning.service.ts`, `apps/backend/src/modules/sync/aluno-sync.processor.ts`, `apps/backend/src/modules/integrations/totvs/dto/aluno-totvs.dto.ts`, `docs/contexto/estado-atual.md`, `docs/contexto/diario.md`.
- **Validação:** `pnpm --dir apps/backend build` executado com sucesso.
- **Próximo:** Validar em homologação os cenários regular cancelado + extra ativo e regular cancelado + extra inativo/inexistente.

## 2026-08-13 — Codex
- **Demanda:** Ajustar `DATAINICIO` na criação de usuário TOTVS porque a tabela gravava `2020-01-01 00:00:00.000`.
- **Feito:** Alterado `TotvsService.criarUsuario` para enviar `DATAINICIO` em formato local `dd/MM/yyyy 00:00:00`, em vez de `YYYY-MM-DD`.
- **Decisões:** Usar formato compatível com `System.DateTime` observado no DataServer (`04/09/2023 00:00:00`).
- **Arquivos tocados:** `apps/backend/src/modules/integrations/totvs/totvs.service.ts`, `docs/contexto/estado-atual.md`, `docs/contexto/diario.md`.
- **Validação:** `pnpm --dir apps/backend build` executado com sucesso.
- **Próximo:** Criar usuário em homologação/TOTVS e conferir `GUSUARIO.DATAINICIO`.

## 2026-08-11 — Codex
- **Demanda:** Analisar logs `primeiro.txt` e `segundo.txt` após cancelamento de matrícula e edição posterior do aluno.
- **Feito:** Comparados retornos das procedures nos logs. Identificado que o primeiro webhook não revogou aluno porque a procedure de cancelamento retornou 0; o segundo revogou porque retornou 1. A parte de responsáveis no segundo log está truncada antes do retorno da procedure.
- **Decisões:** Nenhuma decisão arquitetural nova.
- **Arquivos tocados:** `docs/contexto/estado-atual.md`, `docs/contexto/diario.md`.
- **Validação:** Análise estática dos logs e do fluxo de webhook.
- **Próximo:** Capturar cauda do segundo log e validar a procedure de responsáveis diretamente no SQL Server.

## 2026-08-11 — Codex
- **Demanda:** Analisar se cancelamento de aluno desativa usuário de responsáveis associados quando não há outro aluno vigente em regular/extra e o responsável não é aluno nem funcionário.
- **Feito:** Revisados fluxo de webhook/cancelamento de aluno, processor de responsáveis, regra de revogação em `AccessProvisioningService` e procedure SQL de cancelamento de responsáveis.
- **Decisões:** Nenhuma decisão arquitetural nova.
- **Arquivos tocados:** `docs/contexto/estado-atual.md`, `docs/contexto/diario.md`.
- **Validação:** Análise estática. Sem execução contra TOTVS/SQL Server.
- **Próximo:** Validar em homologação os cenários com responsável puro, responsável com outro aluno vigente e cancelamento manual/lote de alunos.

## [AAAA-MM-DD] — [IA]
- **Demanda:** [inicialização do projeto]
- **Feito:** [criada a pasta de contexto compartilhada]
- **Próximo:** [preencher os arquivos de contexto]
