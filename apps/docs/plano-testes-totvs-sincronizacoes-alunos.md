# Playbook de Homologacao - Sincronizacoes de Alunos (Ativacao e Cancelamento)

## Objetivo
Este documento serve para o analista simular situacoes no TOTVS, rodar a integracao e validar se o resultado ficou correto no TOTVS e no Google.

Formato de uso:
1. Simular a situacao no TOTVS (ou localizar um aluno real com as flags desejadas).
2. Rodar a integracao (ativacao ou cancelamento).
3. Conferir os resultados esperados em TOTVS e Google.

---

## 1) Ativacao - Mapa de Situacoes

### A-01: Aluno ativo no regular, nao funcionario, nao responsavel
- **Como simular (flags no retorno de ativacao)**:
  - `IN_Existe_Matricula_Regular=1`
  - `IN_Inativo_Regular=0`
  - `IN_Funcionario=0`
  - `IN_Responsavel=0`
- **Ao rodar**: `POST /sync/alunos`
- **Esperado Google**:
  - Conta `${RA}@dominio_coligada` deve existir e ficar ativa (cria ou reativa).
- **Esperado TOTVS**:
  - `PPESSOA.EMAIL` = email institucional (se estava diferente).
  - Usuario correto deve ficar vinculado na pessoa (`PPESSOA.CODUSUARIO`).
  - Usuario TOTVS correto deve estar ativo (`STATUS=1`).
  - Perfis de aluno concedidos:
    - coligada 1: `Aluno CEL` nos sistemas `S` e `L`
    - coligada 5: `Aluno LICEU` nos sistemas `S` e `L`

### A-02: Aluno ativo no regular, mas ja com email correto
- **Como simular**:
  - Mesmo de A-01
  - `TX_Email_Pessoa` ja igual ao email institucional
- **Esperado**:
  - Nao alterar `PPESSOA.EMAIL`
  - Demais regras de usuario/perfil seguem normalmente

### A-03: Aluno com `CD_Usuario` nulo (sem usuario vinculado)
- **Como simular**:
  - `CD_Usuario=null`
  - Elegivel ou nao para Google (tanto faz para esta validacao)
- **Esperado TOTVS**:
  - Se usuario correto nao existir: criar usuario
  - Se existir inativo: reativar
  - Em ambos: vincular pessoa ao usuario correto
  - Garantir perfis faltantes

### A-04: Aluno com `CD_Usuario` incorreto (troca de login)
- **Como simular**:
  - `CD_Usuario` diferente do login correto
  - Login correto:
    - aluno puro: `RA`
    - funcionario/responsavel: `CPF`
- **Esperado TOTVS**:
  - Criar/reativar usuario correto
  - Vincular pessoa ao usuario correto
  - Tentar inativar usuario antigo
  - Transferir/garantir perfis conforme papeis ativos

### A-05: Aluno tambem funcionario ou responsavel
- **Como simular**:
  - `IN_Funcionario=1` ou `IN_Responsavel=1`
- **Esperado Google**:
  - Nao provisionar Gmail institucional de aluno por este fluxo
- **Esperado TOTVS**:
  - Nao atualizar `PPESSOA.EMAIL` pela regra de aluno regular
  - Login correto passa a ser `CPF` (na garantia de usuario)
  - Perfis sao tratados conforme papeis ativos

### A-06: Aluno da coligada 6
- **Como simular**:
  - `CD_Coligada=6`
- **Esperado**:
  - Dominio institucional usado: `aluno.lfb.g12.br`
  - Validar que nao ha perfil de aluno mapeado na constante atual para coligada 6 (comportamento atual do codigo)

---

## 2) Cancelamento - Mapa de Situacoes

### C-01: Aluno elegivel para cancelamento total (inativar usuario)
- **Como simular (flags no retorno de cancelamento)**:
  - `IN_Inativo_Regular=1`
  - `IN_Inativo_Extra=1`
  - `CD_Usuario` preenchido
  - `IN_Usuario_Ativo=1`
  - `IN_Funcionario=0`
  - `IN_Responsavel=0`
- **Ao rodar**:
  - Lote: `POST /sync/alunos/cancelamentos`
  - Unitario: `POST /sync/alunos/cancelamentos/aluno`
- **Esperado Google**:
  - Conta institucional deve ser suspensa quando aplicavel
- **Esperado TOTVS**:
  - Usuario TOTVS deve ficar inativo (`STATUS=0`)
  - Nao precisa remover perfis neste caminho (retorna apos inativar)

### C-02: Aluno elegivel, mas sem `CD_Usuario`
- **Como simular**:
  - `IN_Inativo_Regular=1` ou `IN_Inativo_Extra=1`
  - `CD_Usuario=null`
- **Esperado**:
  - Pode executar parte de Gmail (se regra permitir)
  - Nao inativar usuario TOTVS
  - Nao remover perfil (nao ha usuario vinculado)

### C-03: Aluno elegivel, com vinculo funcionario/responsavel
- **Como simular**:
  - `IN_Inativo_Regular=1`
  - `IN_Inativo_Extra=1`
  - `CD_Usuario` preenchido
  - `IN_Funcionario=1` ou `IN_Responsavel=1`
- **Esperado TOTVS**:
  - Nao inativar usuario
  - Remover apenas perfis de aluno (manter usuario para outros papeis)

### C-04: Aluno nao elegivel para cancelamento
- **Como simular**:
  - `IN_Inativo_Regular=0` e `IN_Inativo_Extra=0`
- **Esperado**:
  - Sem alteracoes em usuario/perfis no TOTVS
  - Fluxo deve registrar skip

### C-05: Usuario ja inativo, mas perfis de aluno ainda presentes
- **Como simular**:
  - `IN_Inativo_Regular=1`
  - `IN_Inativo_Extra=1`
  - `CD_Usuario` preenchido
  - `IN_Usuario_Ativo=0`
- **Esperado TOTVS**:
  - Nao inativar novamente
  - Remover perfis de aluno se ainda existirem

---

## 3) Como validar no TOTVS e Google (checklist por registro)

Para cada aluno testado, coletar antes/depois:

### TOTVS
- `PPESSOA`:
  - `EMAIL`
  - `CODUSUARIO`
- `GUSUARIO` / `GlbUsuarioData`:
  - `CODUSUARIO`
  - `STATUS`
  - `EMAIL`
- `GPERMIS / GUSRPERFIL`:
  - perfis de aluno esperados/removidos por sistema (`S`, `L`) e coligada

### Google
- Conta `${RA}@dominio_coligada`:
  - existe?
  - ativa ou suspensa?

### Aplicacao
- Log do job com:
  - `job.id`
  - `CD_Coligada`
  - `CD_Registro_Academico`
  - acao executada (create/activate/suspend/update/inactivate/remove profile/skip)

---

## 4) Cenarios de Idempotencia (obrigatorio testar)

### I-01: Rodar ativacao duas vezes para o mesmo aluno
- **Esperado**: nao duplicar usuario/perfil; estado final permanece correto.

### I-02: Rodar cancelamento duas vezes para o mesmo aluno
- **Esperado**: sem erro funcional; usuario/perfis permanecem no estado final esperado.

### I-03: Reprocessamento unitario de aluno ja processado
- **Esperado**: fluxo deve ser seguro e manter consistencia.

### I-04: Conta Google inexistente no cancelamento
- **Esperado**: fluxo nao quebrar; seguir com validacoes TOTVS.

### I-05: Aluno nao encontrado no fetch unitario de cancelamento
- **Esperado**: warning e encerramento sem alteracao.

---

## 5) Observacoes Importantes para Homologacao
- Coligada 5 possui regra especial com curso extra em coligada 6 (validar por `CD_Pessoa`).
- Coligada 6 usa dominio de email, mas atualmente nao possui perfis de aluno mapeados na constante local.
- Existem pontos de risco nas procedures (join/flags/comentario vs filtro) que devem ser observados nos casos de borda.

---

## 6) Roteiro Rapido de Execucao (ordem sugerida)
1. Executar A-01, A-03, A-04 (cobre principal de ativacao).
2. Executar A-05 e A-06 (papeis e coligadas especiais).
3. Executar C-01, C-02, C-03, C-04, C-05 (cobre toda arvore de cancelamento).
4. Executar I-01 a I-05 (idempotencia/reprocessamento).
5. Consolidar evidencias antes/depois por aluno.
