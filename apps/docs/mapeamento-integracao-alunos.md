# Mapeamento da Integração de Alunos

## 1. Entendimento

Este documento consolida o comportamento esperado da integração de alunos entre TOTVS RM e Google Workspace, cobrindo:

- as situações que podem surgir a partir das procedures de ativação e cancelamento;
- como o core da integração interpreta cada retorno;
- quais ações devem acontecer em TOTVS, Google e fila;
- quais cenários precisam existir na bateria de testes funcionais e de regressão.

O objetivo é separar claramente:

- cenário que a procedure retorna;
- cenário que a procedure deveria retornar, mas não retorna;
- cenário retornado em que o core executa ação;
- cenário retornado em que o core faz `skip`;
- desvios conhecidos entre intenção da regra e implementação atual.

## 2. Premissas

- TOTVS é a fonte de verdade para elegibilidade de acesso.
- A integração de alunos é assíncrona via Bull.
- O fluxo usa duas procedures principais:
  - `PR_MGA_Consulta_Aluno_Ativacao_Acesso`
  - `PR_MGA_Consulta_Aluno_Cancelamento_Acesso`
- O core de decisão está concentrado em:
  - `AlunoSyncProcessor`
  - `AccessProvisioningService`
  - `GoogleService`
- Coligada `6` está configurada para domínio, mas bloqueada para execução direta de procedure no backend.
- A versão real da procedure de ativação no banco está sem o filtro fixo por RA; o filtro encontrado no SQL versionado em `apps/docs` deve ser ignorado para interpretação funcional.
- Na ativação, matrícula extra segue as mesmas regras de usuário TOTVS do regular; a diferença é que não deve haver criação/reativação de Gmail por esse motivo isoladamente.
- O mapeamento abaixo reflete o estado atual do repositório, inclusive desvios e riscos.

## 3. Escopo

- ativação de acessos de alunos;
- cancelamento de acessos de alunos;
- regras de Gmail institucional;
- garantia/inativação de usuário TOTVS;
- garantia/revogação de usuário-filial;
- concessão/remoção de perfis de aluno;
- comportamento por coligada;
- impactos do webhook de aluno.

## 4. Fora de Escopo

- detalhamento completo da integração de responsáveis;
- detalhamento da integração de funcionários;
- troubleshooting de infraestrutura Redis, credenciais ou deploy;
- correção das procedures ou do código.

## 5. Fontes Principais

- Core de alunos:
  - `apps/backend/src/modules/sync/aluno-sync.processor.ts`
  - `apps/backend/src/modules/sync/aluno-sync.service.ts`
- Regras centrais:
  - `apps/backend/src/modules/sync/access-provisioning/access-provisioning.service.ts`
  - `apps/backend/src/modules/sync/access-provisioning/constants/perfis-acesso.constants.ts`
- Integrações:
  - `apps/backend/src/modules/integrations/totvs/totvs.service.ts`
  - `apps/backend/src/modules/integrations/google/google.service.ts`
- Versões exportadas das procedures:
  - `apps/docs/2026-03-20 RARAGAO PR_MGA_Consulta_Aluno_Ativacao_Acesso - MGA.sql`
  - `apps/docs/2026-03-20 RARAGAO PR_MGA_Consulta_Aluno_Cancelamento_Acesso - MGA.sql`

## 6. Fluxo Geral

### 6.1 Ativação

1. Um endpoint ou processo manual enfileira `sync-coligada`, `sync-aluno` ou `webhook-aluno`.
2. O processor busca alunos ativos na procedure de ativação.
3. Para cada aluno retornado:
   - calcula o e-mail institucional `RA@dominio-da-coligada`;
   - provisiona ou reativa Gmail apenas em situação elegível;
   - monta o `PessoaAcessoContext`;
   - delega para `AccessProvisioningService.provisionarAcesso`.
4. O serviço:
   - atualiza `PPESSOA.EMAIL` quando elegível;
   - garante o usuário TOTVS correto;
   - garante vínculo usuário-filial;
   - garante perfis esperados.

### 6.2 Cancelamento

1. Um endpoint ou processo manual enfileira `cancelamentos-coligada`, `cancelamento-aluno` ou `webhook-aluno`.
2. O processor busca alunos elegíveis na procedure de cancelamento.
3. Para cada aluno retornado:
   - calcula o e-mail institucional;
   - monta o `PessoaAcessoContext`;
   - delega para `AccessProvisioningService.revogarAcesso`.
4. O serviço:
   - decide se deve suspender Gmail;
   - decide se deve revogar usuário-filial;
   - decide se deve inativar usuário TOTVS;
   - ou apenas remover perfis de aluno;
   - ou não fazer nada.

### 6.3 Webhook de aluno

O webhook enfileira:

- cancelamento do aluno;
- reavaliação do aluno na procedure de ativação;
- cancelamento dos responsáveis;
- nova concessão para os responsáveis.

Logo, o webhook é um fluxo de reconciliação, não apenas de cancelamento.

## 6.4 Leitura Operacional para Testes

Para execução de testes, a leitura correta deste documento é:

- **Situação**
  estado montado no TOTVS antes do webhook;
- **O que a integração faz**
  reconciliação esperada durante o processamento;
- **O que validar no TOTVS após o webhook**
  estado final esperado no RM;
- **O que validar no Google quando aplicável**
  estado final da conta institucional.

## 7. Procedures: Situações Possíveis de Origem

## 7.1 Ativação: o que a procedure tenta retornar

Pelo SQL exportado, a procedure de ativação monta alunos em duas origens:

### A. Regular ativo no período letivo

Condição-base:

- curso em `EI`, `EF1`, `EF2` ou `EM`;
- status `Ativo`;
- mesma coligada solicitada;
- mesmo período letivo solicitado.

Flags esperadas:

- `IN_Existe_Matricula_Regular = 1`
- `IN_Inativo_Regular = 0`
- `IN_Existe_Matricula_Extra = 0` inicialmente
- `IN_Inativo_Extra = 0` inicialmente

### B. Somente curso extra ativo

Condição-base:

- curso `CEX`;
- status `Ativo`;
- não existe linha regular equivalente já inserida;
- para coligada `5`, a busca do extra é feita na coligada `6` por pessoa.

Flags esperadas:

- `IN_Existe_Matricula_Regular = 0`
- `IN_Inativo_Regular = 1`
- `IN_Existe_Matricula_Extra = 1`
- `IN_Inativo_Extra = 0`

### C. Regular ativo com curso extra ativo também

A procedure atualiza registros regulares já inseridos para marcar existência de curso extra.

Flags esperadas no SQL após o ajuste:

- `IN_Existe_Matricula_Regular = 1`
- `IN_Inativo_Regular = 0`
- `IN_Existe_Matricula_Extra = 1`
- `IN_Inativo_Extra = 0`

Interpretação funcional final:

- a existência de matrícula extra em ativação deve apenas impedir o provisionamento de Gmail;
- as regras de usuário TOTVS permanecem iguais às do regular.

### D. Marcação de funcionário e responsável

Após montar a base, a procedure acrescenta:

- `IN_Funcionario = 1` quando encontra vínculo funcional ativo;
- `IN_Responsavel = 1` quando encontra vínculo de responsável a aluno ativo no período.

Isso muda o login correto e impede parte do provisionamento de aluno puro.

## 7.2 Cancelamento: o que a procedure tenta retornar

Pelo SQL exportado, a procedure de cancelamento tenta retornar quatro grupos de situação:

### A. Regular do período atual com todas as matrículas canceladas/falecido

Condição-base:

- curso em `EI`, `EF1`, `EF2`, `EM`;
- mesma coligada;
- mesmo período;
- `having count(*) = sum(status cancelado/falecido/pré-matrícula nula cancelada)`.

Flags-base:

- `IN_Existe_Matricula_Regular = 1`
- `IN_Inativo_Regular = 1`

### B. Concluinte do último ano do EM no período anterior

Condição-base:

- coligada solicitada;
- período anterior;
- curso `EM`;
- `codstatusres = 5`;
- habilitação `3S2`;
- status `Ativo`;
- ainda não inserido na tabela temporária.

Flags-base:

- `IN_Existe_Matricula_Regular = 1`
- `IN_Inativo_Regular = 1`

### C. Somente curso extra no período anterior e sem continuidade no período atual

Condição-base:

- curso `CEX`;
- período anterior;
- não cancelado/falecido;
- não continuou em regular no período atual/anterior conforme os `not exists`;
- não continuou em `CEX` no período atual;
- regra especial da coligada `5` olhando a `6`.

Flags-base iniciais:

- `IN_Existe_Matricula_Regular = 0`
- `IN_Inativo_Regular = 0`
- `IN_Existe_Matricula_Extra = 0`
- `IN_Inativo_Extra = 0`

Depois o bloco de atualização de `#tmp_cex` recalcula existência/inatividade de extra para linhas regulares. Para linhas originadas como `EXTRA`, as flags já entram pelo `select`.

### D. Curso extra cancelado/falecido no período atual sem regular

Condição-base:

- curso `CEX`;
- período atual;
- sem regular correspondente;
- linha ainda não inserida.

Flags:

- `IN_Existe_Matricula_Regular = 0`
- `IN_Inativo_Regular = 0`
- `IN_Existe_Matricula_Extra = 1`
- `IN_Inativo_Extra = 1`

### E. Marcação de funcionário e responsável

Assim como na ativação, a procedure agrega:

- `IN_Funcionario`
- `IN_Responsavel`

Essas flags definem se o usuário deve ser inativado ou apenas ter perfis de aluno removidos.

## 8. Core: Regras de Decisão

## 8.1 Decisão de Gmail na ativação

O Gmail só é provisionado em `AlunoSyncProcessor` quando:

- `IN_Funcionario = 0`
- `IN_Responsavel = 0`
- `IN_Existe_Matricula_Regular = 1`
- `IN_Inativo_Regular = 0`

Efeitos possíveis:

- conta inexistente: cria;
- conta existente e suspensa: reativa;
- conta existente e ativa: não altera;
- ambiente não produtivo: apenas loga `skipped_non_production`.

## 8.2 Decisão de atualização do e-mail da pessoa

`PPESSOA.EMAIL` só é atualizado quando:

- não é funcionário;
- não é responsável;
- existe matrícula regular;
- não existe matrícula extra;
- o e-mail atual da pessoa é diferente do institucional.

## 8.3 Decisão de usuário TOTVS correto

Login correto:

- aluno puro: `RA`;
- aluno com papel de funcionário ou responsável: `CPF`.

Situações:

- sem usuário vinculado: cria ou ativa o usuário correto e vincula;
- usuário vinculado já correto: garante ativo e eventualmente ajusta e-mail do usuário;
- usuário vinculado incorreto: cria/ativa o correto, vincula, tenta inativar o antigo e transfere perfis elegíveis.

## 8.4 Decisão de atualização do e-mail do usuário TOTVS

O e-mail do usuário só é atualizado quando:

- o usuário correto já está vinculado e ativo;
- `_deveGerenciarEmailUsuarioAluno(ctx)` for verdadeiro.

Na implementação atual isso significa:

- aluno;
- não funcionário;
- não responsável;
- matrícula regular existe;
- matrícula extra existe.

## 8.5 Decisão de cancelamento de Gmail

O Gmail só é suspenso quando:

- é aluno;
- `IN_Existe_Matricula_Regular = 1`;
- `IN_Inativo_Regular = 1`;
- o e-mail calculado é institucional para o domínio da coligada.

Consequência prática:

- aluno apenas de curso extra cancelado não dispara suspensão de Gmail por essa regra.

## 8.6 Elegibilidade geral de revogação

O aluno entra no fluxo de revogação quando:

- `IN_Aluno = 1`; e
- `IN_Inativo_Regular = 1` ou `IN_Inativo_Extra = 1`.

## 8.7 Inativação total do usuário TOTVS

O usuário é inativado quando todas as condições abaixo forem verdadeiras:

- existe `CD_Usuario`;
- `IN_Usuario_Ativo = 1`;
- não é funcionário;
- não é responsável;
- não existe matrícula regular ou a regular está inativa;
- não existe matrícula extra ou a extra está inativa.

## 8.8 Remoção de perfis sem inativar usuário

Remove apenas perfis de aluno quando:

- existe `CD_Usuario`;
- não cai na regra de inativação total;
- não existe matrícula regular ou a regular está inativa;
- não existe matrícula extra ou a extra está inativa.

Caso típico:

- aluno também é funcionário;
- aluno também é responsável;
- usuário já está inativo mas ainda possui perfis de aluno.

## 9. Matriz de Situações de Ativação

| ID | Situação de origem | Indicadores principais | O que a procedure deveria fazer | O que o core faz hoje |
| --- | --- | --- | --- | --- |
| AT-01 | Aluno regular ativo, puro | regular=1, inativo_regular=0, funcionario=0, responsavel=0 | retornar linha | provisiona Gmail, atualiza email da pessoa, garante usuário RA, garante usuário-filial, concede perfis de aluno |
| AT-02 | Aluno regular ativo, puro, Gmail inexistente | igual AT-01 | retornar linha | cria conta Google em produção |
| AT-03 | Aluno regular ativo, puro, Gmail suspenso | igual AT-01 | retornar linha | reativa conta Google em produção |
| AT-04 | Aluno regular ativo, puro, Gmail já ativo | igual AT-01 | retornar linha | não altera Google, segue TOTVS |
| AT-05 | Aluno regular ativo, puro, `PPESSOA.EMAIL` já correto | email pessoa = email institucional | retornar linha | não atualiza `PPESSOA.EMAIL`; segue demais garantias |
| AT-06 | Aluno regular ativo, puro, sem `CD_Usuario` | `CD_Usuario = null` | retornar linha | cria ou reativa usuário RA, vincula e concede perfis |
| AT-07 | Aluno regular ativo, puro, usuário correto já vinculado e ativo | `CD_Usuario = RA`, `IN_Usuario_Ativo = 1` | retornar linha | mantém usuário e garante perfis faltantes |
| AT-08 | Aluno regular ativo, puro, usuário correto vinculado porém inativo | `CD_Usuario = RA`, `IN_Usuario_Ativo = 0` | retornar linha | reativa usuário e garante perfis |
| AT-09 | Aluno regular ativo, puro, usuário errado vinculado | `CD_Usuario != RA` | retornar linha | coleta perfis transferíveis, cria/ativa RA, vincula, tenta inativar antigo, garante perfis |
| AT-10 | Aluno regular ativo com vínculo funcionário | `IN_Funcionario = 1` | retornar linha | não provisiona Gmail de aluno, login correto passa a ser CPF, garante usuário/perfis conforme papéis |
| AT-11 | Aluno regular ativo com vínculo responsável | `IN_Responsavel = 1` | retornar linha | não provisiona Gmail de aluno, login correto passa a ser CPF, garante usuário/perfis conforme papéis |
| AT-12 | Aluno regular ativo com vínculo funcionário e responsável | ambos = 1 | retornar linha | mesmo comportamento de CPF, sem Gmail de aluno |
| AT-13 | Aluno somente de curso extra ativo | regular=0, extra=1, inativo_extra=0 | retornar linha | não provisiona Gmail em `syncAluno`; ainda assim entra em `provisionarAcesso` e mantém as regras de usuário TOTVS |
| AT-14 | Aluno regular ativo também com curso extra ativo | regular=1, extra=1, inativo_extra=0 | retornar linha | funcionalmente, deve manter regras de usuário TOTVS e não criar/reativar Gmail por causa do extra; implementação atual merece validação porque o contexto de ativação não propaga a flag de extra |
| AT-15 | Aluno da coligada 5 com curso extra na coligada 6 | coligada solicitada 5, extra apurado por pessoa na 6 | retornar linha consolidada | domínio continua da coligada 5; perfis de aluno só existem para coligada 5 |
| AT-16 | Aluno da coligada 6 por execução direta | coligada 6 | não deveria ser chamada pelo core | backend bloqueia a execução da procedure |
| AT-17 | Aluno elegível mas fora de produção | qualquer caso com Gmail | retornar linha | fluxo Google vira `skipped_non_production`; TOTVS continua |
| AT-18 | Aluno funcionário/responsável sem CPF | funcionario=1 ou responsavel=1 e `CD_CPF = null` | retornar linha inconsistente | o core lança erro ao resolver login correto |

## 10. Matriz de Situações de Cancelamento

| ID | Situação de origem | Indicadores principais | O que a procedure deveria fazer | O que o core faz hoje |
| --- | --- | --- | --- | --- |
| CT-01 | Regular do período atual totalmente cancelado/falecido | regular=1, inativo_regular=1 | retornar linha | entra em revogação |
| CT-02 | Concluinte do último ano do EM no período anterior | regular=1, inativo_regular=1, origem EM anterior | retornar linha | entra em revogação |
| CT-03 | Somente curso extra do período anterior sem continuidade | extra originado do período anterior | retornar linha | entra em revogação se `IN_Inativo_Extra = 1` no retorno final |
| CT-04 | Curso extra cancelado/falecido no período atual sem regular | extra=1, inativo_extra=1 | retornar linha | entra em revogação, mas o Gmail deve permanecer como está |
| CT-05 | Aluno elegível para cancelamento total | usuário ativo, sem vínculo funcional/responsável, todas as matrículas inexistentes ou inativas | retornar linha | suspende Gmail se regular inativo, revoga usuário-filial, inativa usuário TOTVS |
| CT-06 | Elegível para cancelamento, mas sem `CD_Usuario` | `CD_Usuario = null` | retornar linha | pode suspender Gmail, não revoga usuário TOTVS nem perfis |
| CT-07 | Elegível com usuário já inativo | `IN_Usuario_Ativo = 0` | retornar linha | não inativa de novo; pode remover perfis de aluno |
| CT-08 | Elegível com vínculo funcionário | `IN_Funcionario = 1` | retornar linha | não inativa usuário; remove apenas perfis de aluno |
| CT-09 | Elegível com vínculo responsável | `IN_Responsavel = 1` | retornar linha | não inativa usuário; remove apenas perfis de aluno |
| CT-10 | Elegível com vínculo funcionário e responsável | ambos = 1 | retornar linha | mesmo comportamento: sem inativação total, apenas remoção de perfis de aluno |
| CT-11 | Regular inativo e extra ainda ativo | regular=1, inativo_regular=1, extra=1, inativo_extra=0 | retornar linha, se a procedure construir esse estado | suspende Gmail, mas não inativa usuário e não remove perfis, porque ainda existe vínculo extra ativo |
| CT-12 | Regular inexistente e extra ativo | regular=0, extra=1, inativo_extra=0 | não deveria ser cancelamento | o core faria `skip` de revogação por não ser elegível |
| CT-13 | Regular inexistente e extra inativo | regular=0, extra=1, inativo_extra=1 | retornar linha | revogação possível sem suspensão de Gmail |
| CT-14 | Não elegível para cancelamento | inativo_regular=0 e inativo_extra=0 | não retornar linha na procedure | se chegar ao core mesmo assim, ele faz `skip` |
| CT-15 | Aluno não encontrado na procedure no cancelamento unitário | RA consultado sem linha | retornar vazio | processor faz warning e encerra |
| CT-16 | Conta Google inexistente no cancelamento | Gmail não existe | retornar linha | fluxo Google devolve `not_found`; TOTVS continua |
| CT-17 | Conta Google já suspensa | Gmail já suspenso | retornar linha | fluxo Google devolve `already_suspended`; TOTVS continua |
| CT-18 | Coligada 6 no cancelamento | coligada 6 | não deveria ser chamada pelo core | backend bloqueia a execução da procedure |

## 11. Matriz de Ações por Bloco Funcional

## 11.1 Google Workspace

| Condição | Ação esperada |
| --- | --- |
| aluno puro + regular ativo | criar, reativar ou manter Gmail |
| aluno com vínculo funcionário/responsável | não provisionar Gmail de aluno |
| regular inativo + e-mail institucional | suspender Gmail |
| apenas extra inativo | não suspender Gmail; a conta permanece como está |
| ambiente não produtivo | não chamar Google; apenas logar `skipped_non_production` |

## 11.2 Pessoa no TOTVS

| Condição | Ação esperada |
| --- | --- |
| aluno puro + regular ativo + sem extra + e-mail divergente | atualizar `PPESSOA.EMAIL` |
| aluno com vínculo funcionário/responsável | não atualizar `PPESSOA.EMAIL` pela regra de aluno puro |
| aluno com extra ativo | comportamento pretendido parece ser não tratar como aluno puro; implementação atual de ativação não propaga a flag |

## 11.3 Usuário TOTVS

| Condição | Ação esperada |
| --- | --- |
| sem usuário vinculado | criar ou reativar usuário correto e vincular |
| usuário correto vinculado e ativo | manter, garantindo ajustes necessários |
| usuário correto vinculado e inativo | reativar |
| usuário errado vinculado | migrar para login correto, vincular e tentar inativar antigo |
| funcionário ou responsável | login correto = CPF |
| aluno puro | login correto = RA |

## 11.4 Perfis TOTVS

| Condição | Ação esperada |
| --- | --- |
| aluno coligada 1 | garantir `Aluno CEL` nos sistemas `S` e `L` |
| aluno coligada 5 | garantir `Aluno LICEU` nos sistemas `S` e `L` |
| aluno coligada 6 | não há perfis de aluno mapeados |
| cancelamento com vínculo funcional/responsável | remover apenas perfis de aluno |
| cancelamento total com usuário ativo | inativar usuário e não seguir para remoção explícita de perfis |
| usuário errado substituído | transferir perfis transferíveis compatíveis com os papéis ativos |

## 11.5 Usuário-Filial

| Condição | Ação esperada |
| --- | --- |
| ativação de aluno sem papel de responsável | garantir usuário-filial da coligada/filial do registro |
| cancelamento de aluno puro com `CD_Filial` | revogar usuário-filial |
| cancelamento de aluno com vínculo funcionário/responsável | não revogar usuário-filial nesse fluxo |
| `CD_Filial` ausente | logar warning e pular etapa |

## 12. Desvios e Riscos Encontrados

## 12.1 Ativação não propaga flags de curso extra para o contexto

Em `syncAluno`, o contexto de ativação:

- não preenche `IN_Existe_Matricula_Extra`;
- fixa `IN_Inativo_Extra = 0`.

Impacto:

- `_isElegivelEmailPessoa` e `_deveGerenciarEmailUsuarioAluno` podem decidir com informação incompleta;
- cenários de regular + extra e somente extra podem não se comportar como a intenção da procedure sugere.

## 12.2 Coligada 6 tem domínio configurado, mas procedure bloqueada no backend

Há configuração de domínio para a coligada `6`, mas:

- `AlunoSyncService` e `AlunoSyncProcessor` bloqueiam procedure para a coligada `6`.

Impacto:

- existe regra especial de leitura indireta da coligada `6` pela `5`;
- não existe processamento direto de alunos da `6`.

## 12.3 Sem deduplicação forte de jobs

O repositório não mostra deduplicação por chave de negócio.

Impacto:

- webhook, reprocessamento e batch podem concorrer sobre o mesmo RA;
- a validação deve incluir idempotência e concorrência controlada.

## 13. Casos de Teste Obrigatórios

## 13.1 Ativação

- regular ativo, aluno puro, sem usuário;
- regular ativo, aluno puro, usuário correto ativo;
- regular ativo, aluno puro, usuário correto inativo;
- regular ativo, aluno puro, usuário errado vinculado;
- regular ativo, aluno puro, Gmail inexistente;
- regular ativo, aluno puro, Gmail suspenso;
- regular ativo, aluno puro, Gmail ativo;
- regular ativo, também funcionário;
- regular ativo, também responsável;
- somente extra ativo;
- regular ativo com extra ativo;
- regular ativo com extra ativo e sem usuário vinculado;
- somente extra ativo com usuário já existente e inativo;
- coligada 5 com reflexo de curso extra da coligada 6;
- aluno com `CD_Filial` nulo;
- aluno funcionário/responsável sem CPF.

## 13.2 Cancelamento

- regular totalmente cancelado com usuário ativo;
- regular totalmente cancelado sem usuário;
- regular totalmente cancelado com usuário já inativo;
- regular cancelado com vínculo funcionário;
- regular cancelado com vínculo responsável;
- regular cancelado com extra ainda ativo;
- somente extra cancelado;
- somente extra cancelado sem usuário vinculado;
- somente extra cancelado com usuário ativo;
- concluinte de EM do período anterior;
- RA não encontrado no cancelamento unitário;
- Gmail inexistente;
- Gmail já suspenso;
- `CD_Filial` nulo.

## 13.3 Idempotência e Reprocessamento

- ativação duas vezes para o mesmo RA;
- cancelamento duas vezes para o mesmo RA;
- webhook seguido de batch para o mesmo RA;
- batch seguido de cancelamento unitário para o mesmo RA;
- usuário errado substituído e reprocessado;
- conta Google já no estado final correto antes da execução.

## 14. Estratégia de Validação

- validar o retorno cru das procedures antes de validar o efeito do core;
- capturar evidência antes/depois em:
  - `PPESSOA.EMAIL`
  - `PPESSOA.CODUSUARIO`
  - `GUSUARIO.STATUS`
  - `GUSUARIO.EMAIL`
  - `GPERMIS/GUSRPERFIL`
  - estado da conta Google;
- registrar em cada caso:
  - coligada;
  - período letivo;
  - RA;
  - flags retornadas;
  - ações esperadas;
  - ações observadas;
  - divergências.

## 15. Pendências

- decidir se o contexto de ativação deve propagar `IN_Existe_Matricula_Extra` e `IN_Inativo_Extra`;
- decidir se coligada `6` continuará apenas como apoio da `5` ou terá fluxo direto no futuro.
