# Spec: Guardas de provisionamento TOTVS

- **ID:** 2026-01-guardas-provisionamento-totvs
- **Status:** Entregue
- **Atualizada em:** 2026-08-17 por IA: Codex
- **Playbook:** correcao-bug
- **Rastreabilidade:** `logs.txt`

## Objetivo
- **Funcional:** Evitar tentativas de provisionamento TOTVS com dados mestre ausentes ou inconsistentes, reduzindo erros de FK e endpoint inválido.
- **Técnico:** Adicionar guardas antes de vincular usuário à pessoa e antes de gravar `SUSUARIOFILIAL`, mantendo logs rastreáveis.

## Contexto / motivação
`logs.txt` mostra erro `0007` do TOTVS ao garantir `SUSUARIOFILIAL` para filial `78`, além de chamada `EduPessoaData/` com `CD_Pessoa` vazio para responsável financeiro.

Referências: `docs/contexto/estado-atual.md`, `docs/contexto/diario.md`, `docs/contexto/integracoes.md`.

## Premissas
- `CD_Pessoa` é obrigatório para vincular usuário a `EduPessoaData/{CD_Pessoa}`.
- `SUSUARIOFILIAL` depende de mestres TOTVS para usuário e filial/coligada/tipo de curso.
- Sem acesso direto ao SQL Server/TOTVS nesta sessão; validação operacional de filial `78` fica pendente.

## Escopo
- Bloquear vinculação usuário-pessoa quando `CD_Pessoa` estiver vazio.
- Permitir responsável financeiro com CPF e sem `CD_Pessoa` seguir por login CPF, sem chamada a `EduPessoaData/`.
- Ignorar concessão de responsável sem `CD_Pessoa` apenas quando não houver fallback financeiro seguro.
- Adicionar validação SQL local de mestres mínimos antes de gravar `SUSUARIOFILIAL`.
- Melhorar log de falhas de `SUSUARIOFILIAL`.

## Fora de escopo
- Alterar procedures TOTVS.
- Corrigir cadastro mestre da filial `78`.
- Mudar política global de retry das filas.

## Contratos
- **Endpoints / rotas:** sem alteração.
- **Entrada (payload/DTO):** sem alteração em payload externo; validação interna reforçada.
- **Saída:** sem alteração em respostas HTTP; logs passam a indicar skip/bloqueio.
- **Modelo de dados tocado:** leitura SQL em `GUSUARIO` e `GFILIAL`; escrita permanece via DataServer `EduUsuarioFilialData`.
- **Integrações externas:** TOTVS REST/DataServer e SQL Server TOTVS; autenticação inalterada; idempotência preservada por busca de PK existente.

## Regras de negócio / invariantes
- Não tentar criar detalhe `SUSUARIOFILIAL` quando usuário ou filial mestre não puderem ser confirmados.
- Não tentar vincular usuário à pessoa sem `CD_Pessoa`.
- Não tratar responsável sem pessoa resolvida como provisionamento normal, exceto responsável financeiro com CPF, que pode ser provisionado sem vínculo em `PPESSOA`.

## Critérios de aceite
- [x] Responsável financeiro com CPF, mas sem `CD_Pessoa`, provisiona usuário/filial/perfil por CPF e não chama `EduPessoaData/`.
- [x] Responsável não financeiro com CPF, mas sem `CD_Pessoa`, é ignorado com log claro e não chama `EduPessoaData/`.
- [x] `vincularUsuarioPessoa` retorna erro rastreável se receber `CD_Pessoa` vazio.
- [x] `garantirUsuarioFilial` valida mestre de usuário e filial antes de POST/PATCH.
- [x] Erro de validação prévia não faz chamada DataServer de `EduUsuarioFilialData`.
- [x] Build backend passa.

## Casos a cobrir
- **Caminho feliz:** usuário, pessoa e filial válidos seguem fluxo atual.
- **Dados inválidos:** `CD_Pessoa` vazio bloqueia vinculação; usuário/filial mestre ausente bloqueia `SUSUARIOFILIAL`.
- **Permissão / perfil:** sem alteração.
- **Borda:** responsável vindo por RA com CPF e sem pessoa resolvida.
- **Falha de integração / reprocessamento:** falha prévia fica em log e mantém retorno `Error` nos métodos de integração.
- **Risco de regressão:** queries de validação podem errar nome de tabela em ambiente TOTVS; fallback deve logar e retornar erro, não prosseguir silencioso.

## Impactos técnicos (camadas)
- **SQL Server:** novas leituras em tabelas mestre TOTVS.
- **Backend:** `TotvsService`, `AccessProvisioningService`, `ResponsavelSyncProcessor`.
- **Frontend:** não aplicável.
- **Integrações:** TOTVS ganha validação prévia.
- **Jobs/Filas:** mesma política de fila; logs mais claros para reprocessamento.
- **DevOps/Observabilidade:** mensagens distinguem dado inválido local vs erro remoto TOTVS.

## Riscos e decisões em aberto
- Filial `78` pode ser válida em outra dimensão não coberta por `GFILIAL`; validar em homologação.
- Se o ambiente usar nome mestre diferente de `GFILIAL`, ajustar validação.

## Plano de execução
1. Backend: adicionar guardas em `ResponsavelSyncProcessor` e `AccessProvisioningService`.
2. Integração TOTVS: validar mestres em `TotvsService.garantirUsuarioFilial`.
3. Validação: build backend e revisão de critérios.
