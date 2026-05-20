# Mapeamento da Integração de Responsáveis

## 1. Entendimento

Este documento consolida o comportamento esperado da integração de responsáveis entre TOTVS RM e o core de acessos, cobrindo:

- as situações que podem surgir a partir das procedures de ativação e cancelamento;
- como o core consolida vínculos por CPF/pessoa;
- quais ações devem acontecer em TOTVS;
- quais cenários precisam existir na bateria de testes funcionais e de regressão.

O objetivo é separar claramente:

- cenário que a procedure retorna;
- cenário em que o core executa ação;
- cenário em que o core faz `skip`;
- desvios conhecidos entre intenção da regra e implementação atual.

## 2. Premissas

- TOTVS é a fonte de verdade para elegibilidade de acesso.
- A integração de responsáveis é assíncrona via Bull.
- Os fluxos principais usam:
  - `PR_MGA_Consulta_Responsavel_Ativacao_Acesso`
  - `PR_MGA_Consulta_Responsavel_Cancelamento_Acesso`
- O core de decisão está concentrado em:
  - `ResponsavelSyncProcessor`
  - `ResponsavelSyncService`
  - `AccessProvisioningService`
- Responsável usa CPF como login correto.
- Não existe provisionamento de Gmail institucional na integração de responsáveis.
- O webhook de aluno dispara:
  - cancelamento de responsável;
  - nova concessão de responsável.
- O mapeamento abaixo reflete o estado atual do repositório, inclusive riscos de implementação.

## 3. Escopo

- ativação de acessos de responsáveis;
- cancelamento de acessos de responsáveis;
- garantia/inativação de usuário TOTVS;
- garantia/revogação de usuário-filial;
- concessão/remoção de perfis de responsável;
- consolidação por CPF/pessoa;
- comportamento do webhook do aluno sobre a trilha de responsáveis.

## 4. Fora de Escopo

- detalhamento completo da integração de alunos;
- detalhamento da integração de funcionários;
- troubleshooting de infraestrutura Redis, credenciais ou deploy;
- correção das procedures ou do código.

## 5. Fontes Principais

- Core de responsáveis:
  - `apps/backend/src/modules/sync/responsavel-sync.processor.ts`
  - `apps/backend/src/modules/sync/responsavel-sync.service.ts`
- Regras centrais:
  - `apps/backend/src/modules/sync/access-provisioning/access-provisioning.service.ts`
  - `apps/backend/src/modules/sync/access-provisioning/constants/perfis-acesso.constants.ts`
- Integração TOTVS:
  - `apps/backend/src/modules/integrations/totvs/totvs.service.ts`
- Procedures versionadas:
  - `apps/docs/2026-05-07 RARAGAO PR_MGA_Consulta_Responsavel_Ativacao_Acesso - MGA.sql`
  - `apps/docs/2026-04-09 RARAGAO PR_MGA_Consulta_Responsavel_Cancelamento_Acesso - MGA.sql`

## 6. Fluxo Geral

### 6.1 Concessão

1. Um endpoint ou o webhook do aluno enfileira `sync-responsavel-unitario` ou `sync-responsaveis`.
2. O processor busca linhas da procedure de ativação.
3. As linhas são agrupadas por:
   - `CPF`, quando existir;
   - `CD_Pessoa`, como fallback.
4. O grupo é consolidado em um único `PessoaAcessoContext`.
5. O core:
   - garante usuário TOTVS pelo CPF;
   - garante acessos usuário-filial;
   - concede perfis acadêmicos/financeiros conforme o vínculo.

### 6.2 Cancelamento

1. Um endpoint ou o webhook do aluno enfileira `cancelamento-responsavel-unitario` ou `cancelamentos-responsavel`.
2. O processor busca linhas da procedure de cancelamento.
3. As linhas são agrupadas e consolidadas por responsável.
4. O core decide se deve:
   - revogar todas as filiais e inativar usuário;
   - preservar usuário e apenas remover perfis de responsável;
   - reter filiais ligadas a aluno ainda ativo;
   - ou fazer `skip`.

### 6.3 Webhook do aluno

O webhook do aluno enfileira:

- cancelamento do responsável;
- nova concessão do responsável.

Isso transforma o fluxo de responsáveis em uma reconciliação após a mudança do aluno.

Ponto importante:

- quando o disparo é por `RA`, o processor pode consolidar todos os grupos do responsável relacionados ao aluno filtrado, preservando os demais vínculos ativos daquele responsável no período.

## 7. Procedures: Situações Possíveis de Origem

## 7.1 Ativação

A procedure de ativação de responsáveis:

- usa a procedure de ativação de alunos como base;
- considera coligadas `1` e `5`;
- trata coligada `6` como apoio do extra da `5`;
- descarta responsáveis sem CPF;
- monta vínculos por:
  - `FILIACAO`;
  - `ACADEMICO`;
  - `FINANCEIRO`.

### Situações de origem relevantes

### A. Responsável por filiação

Origem:

- `vfiliacao` entre aluno ativo e pessoa vinculada;
- CPF obrigatório no responsável.

Flags esperadas:

- `IN_Filiacao = 1`
- `IN_Responsavel_Academico = 0`
- `IN_Responsavel_Financeiro = 0`

Efeito funcional:

- concede perfil acadêmico de responsável.

### B. Responsável acadêmico

Origem:

- `saluno.codpessoaraca`.

Flags esperadas:

- `IN_Filiacao = 0`
- `IN_Responsavel_Academico = 1`
- `IN_Responsavel_Financeiro = 0`

Efeito funcional:

- concede perfil acadêmico de responsável.

### C. Responsável financeiro

Origem:

- CPF do `CFO`.

Flags esperadas:

- `IN_Filiacao = 0`
- `IN_Responsavel_Academico = 0`
- `IN_Responsavel_Financeiro = 1`

Efeito funcional:

- concede perfil financeiro de responsável.

### D. Múltiplos vínculos simultâneos

Um mesmo responsável pode aparecer com:

- filiação + acadêmico;
- acadêmico + financeiro;
- filiação + financeiro;
- os três ao mesmo tempo.

A consolidação do processor usa `max(...)` nas flags e gera um único contexto final por responsável.

### E. Responsável também aluno

A procedure marca:

- `IN_Aluno = 1`

quando o responsável também aparece como aluno ativo.

Efeito funcional:

- na concessão, os acessos usuário-filial podem incluir as alocações do próprio responsável como aluno;
- no cancelamento, se ainda houver papel de aluno, a revogação não deve derrubar tudo.

### F. Responsável também funcionário

A procedure marca:

- `IN_Funcionario = 1`

quando existe vínculo funcional ativo.

Efeito funcional:

- login correto continua sendo CPF;
- o tipo de acesso usuário-filial pode migrar para acesso funcional;
- no cancelamento, não deve haver inativação total do usuário.

### G. Coligada 5 com extra ativo refletido na 6

Na consolidação do processor:

- se existe extra ativo da coligada `5`, o core marca `IN_Matricula_Extra_Ativa_Coligada5 = 1`;
- nesse caso, perfis e alocação adicionais podem ser projetados para a coligada `6`.

## 7.2 Cancelamento

A procedure de cancelamento:

- usa a procedure de cancelamento de alunos como base;
- monta vínculos por `FILIACAO`, `ACADEMICO` e `FINANCEIRO`;
- bloqueia grupos que ainda possuem vínculo ativo equivalente;
- recalcula `IN_Inativo_Regular` e `IN_Inativo_Extra` por soma dos retornos.

### Situações de origem relevantes

### A. Responsável puro sem qualquer outro papel ativo

Condição:

- não é aluno ativo;
- não é funcionário ativo;
- os vínculos de responsável elegíveis foram cancelados/inativados.

Efeito funcional:

- revoga todas as filiais ativas;
- remove perfis de responsável;
- inativa usuário.

### B. Responsável que continua como aluno

Condição:

- `IN_Aluno = 1`
- `IN_Funcionario = 0`

Efeito funcional:

- preserva filiais ligadas às alocações de aluno;
- remove apenas perfis de responsável.

### C. Responsável que continua como funcionário

Condição:

- `IN_Funcionario = 1`

Efeito funcional:

- preserva usuário e acesso funcional;
- remove apenas perfis de responsável.

### D. Responsável ainda com vínculo ativo bloqueante

Condição:

- a procedure identifica vínculo ativo equivalente e bloqueia o grupo.

Efeito funcional:

- o grupo não deve retornar para cancelamento;
- se chegar ao core por inconsistência, a trilha tende a preservar o usuário.

## 8. Regras do Core

## 8.1 Usuário TOTVS

- login correto de responsável é sempre `CPF`;
- se `CD_Usuario` estiver errado:
  - cria/ativa o usuário correto;
  - vincula à pessoa;
  - transfere perfis compatíveis;
  - inativa o usuário antigo.
- se não houver CPF na concessão:
  - o processor ignora o responsável.

## 8.2 E-mail / Google

- não existe provisionamento de Gmail institucional;
- não existe atualização de `PPESSOA.EMAIL` pela regra de aluno puro;
- `Validar Google` nos testes de responsáveis tende a ser `Não aplicável`.

## 8.3 Usuário-filial

### Concessão de responsável puro

O core usa:

- alocações do vínculo de responsável;
- alocações do responsável como aluno, se existirem;
- alocação extra `6:1` quando `IN_Matricula_Extra_Ativa_Coligada5 = 1`.

Depois:

- revoga filiais fora da alocação permitida;
- garante as filiais finais como acesso `Portal`.

### Concessão de responsável que também é funcionário

Risco atual do core:

- quando há `IN_Funcionario = 1`, o fluxo não entra no ramo principal de concessão de responsável puro;
- em cenários específicos, isso pode levar a garantia parcial por uma única filial ou por alocações de aluno, sem o mesmo saneamento completo das alocações de responsável.

Isso precisa de validação direcionada em homologação.

### Cancelamento

- responsável puro:
  - revoga todas as filiais ativas;
- responsável ainda aluno:
  - recalcula e mantém só as filiais de aluno;
- responsável ainda funcionário:
  - não passa pela limpeza de filiais de aluno/responsável nesse ramo; o acesso funcional tende a ser preservado.

## 8.4 Perfis

Mapeamento atual:

- coligada `1`:
  - `RespAcad_CEL` no sistema `S`
  - `RespFinanc_CEL` no sistema `S`
- coligada `5`:
  - `RespAcad_LFB` no sistema `S`
  - `RespFinanc_LFB` no sistema `S`
- coligada `6`:
  - `RespAcad_LFB` no sistema `S`
  - `RespFinanc_LFB` no sistema `S`

Regras:

- `IN_Filiacao = 1` concede perfil acadêmico;
- `IN_Responsavel_Academico = 1` concede perfil acadêmico;
- `IN_Responsavel_Financeiro = 1` concede perfil financeiro;
- se ambos acadêmico e financeiro existirem, ambos os perfis devem permanecer;
- no cancelamento, remove apenas os perfis da entidade `RESPONSAVEL` quando o usuário ainda precisa existir por outro papel.

## 9. Situações Críticas para Teste

- responsável por filiação puro;
- responsável acadêmico puro;
- responsável financeiro puro;
- responsável com vínculo acadêmico e financeiro ao mesmo tempo;
- responsável de múltiplos alunos e múltiplas filiais;
- responsável da coligada `5` com reflexo de extra para `6`;
- responsável também aluno;
- responsável também funcionário;
- responsável sem CPF;
- responsável financeiro com CPF de CFO sem correspondência consistente em `PPESSOA`;
- cancelamento puro;
- cancelamento preservando aluno;
- cancelamento preservando funcionário;
- reprocessamento idempotente.

## 10. Riscos e Pendências

- Não há Gmail na trilha de responsáveis, então qualquer efeito de Google visto em homologação indica interferência indevida de outra integração.
- O ramo de concessão para responsável com `IN_Funcionario = 1` merece validação forte, porque o saneamento de filiais não segue exatamente o mesmo fluxo do responsável puro.
- O ramo financeiro pode depender de correspondência adequada entre `CPF` do CFO e `PPESSOA`; se isso falhar, a criação/vinculação do usuário pode ficar inconsistente.
- O webhook do aluno reconcilia responsáveis em duas etapas, então o estado final esperado deve ser avaliado após a conclusão completa da fila, não no meio do processamento.
