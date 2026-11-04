# Incidente 04/11/2026 — saturação do CEL-BD (CORPORE_ERP)

## O que aconteceu

Entre ~08:10 e ~12:00 a CPU do SQL Server CEL-BD subiu para 60–95%. Outros
serviços (integracoes-sinergia, integracao-goto, portal-colaborador, matrícula,
portal-acadêmico) passaram a falhar com `Timed out fetching a new connection
from the connection pool`, `Can't reach database server` e `ETIMEDOUT`.

Causa principal: o integracao-acessos executando várias cópias simultâneas de
`PR_MGA_Consulta_Aluno_Ativacao_Acesso` e
`PR_MGA_Consulta_Responsavel_Ativacao_Acesso` (≈ 44 s de CPU por chamada da
de alunos; a de responsáveis recalculava as coligadas 1 e 5 inteiras a cada
chamada, mesmo com RA/CPF). Contenção: app com 0 instâncias às ~11:50.

## Mudanças deste patch

1. **Concorrência real das filas** (`utils/queue-concurrency.ts`)
   No Bull, cada `@Process('nome')` soma concorrência: `aluno-sync` (7 handlers)
   e `responsavel-sync` (4) rodavam até 11 jobs ao mesmo tempo por instância.
   Agora cada fila tem um único processador (`name: '*'`) que despacha pelo
   nome do job. Concorrência por variável de ambiente:
   `ALUNO_SYNC_CONCURRENCY` e `RESPONSAVEL_SYNC_CONCURRENCY` (padrão 1).
   Verificado com Bull 4 + Redis: antes pico de 7 jobs simultâneos, agora 1.

2. **Sincronização completa sem empilhar** — `sync-coligada` com `jobId` fixo
   (`sync-coligada:<período>:<coligada>`), `removeOnComplete` e `removeOnFail`.
   Disparos repetidos (cron + `POST /sync/alunos`) enquanto uma carga está na
   fila/rodando são ignorados.

3. **Procedures v2 opcionais** — `TOTVS_USAR_PROCEDURES_V2=true` passa a chamar
   `PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2` e
   `PR_MGA_Consulta_Responsavel_Ativacao_Acesso_v2`. Padrão `false`: as
   originais seguem em uso até o analista responsável dar o veredito.
   Os logs "Buscando alunos ativos…" / "Buscando responsáveis…" informam qual
   procedure foi usada.

## Procedures v2 (`docs/sql/`)

- `PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2.sql` — filtra pela(s) pessoa(s) do
  RA desde o início, resolve IDPERLET antes, alocações a partir das pessoas,
  `OPTION (RECOMPILE)`, junção com FCFO sem `REPLACE` na coluna. Aceita
  `#pessoa_filtro_externo` criada por quem chama.
- `PR_MGA_Consulta_Responsavel_Ativacao_Acesso_v2.sql` — com filtro, descobre os
  responsáveis-alvo e todos os alunos ligados a eles antes de chamar a de
  alunos; PPESSOA/FCFO por CPF/CNPJ puro ou mascarado. Saída opcional em
  `#saida_responsavel` (necessária para testes, pois a procedure usa INSERT EXEC).
- `validacao_v2_noturna.sql` — compara original × v2 (carga completa e amostra
  de 50 RAs). Rodar fora do pico.

Mesmas colunas e regras das originais. **Pontos para o analista decidir**
(mantidos iguais às originais de propósito):

- Coligada 5: `IN_Inativo_Extra` é sempre 0 (`THEN 0 ELSE 0`); nas outras
  coligadas é `THEN 0 ELSE 1`.
- Vínculo financeiro liga FCFO só por `CODCFO`. A SALUNO tem `CODCOLCFO`
  (índice `IXSALUNO_CFO (CODCOLIGADA, CODCOLCFO, CODCFO)`); o correto parece
  ser `fcfo.codcoligada = aln.codcolcfo and fcfo.codcfo = aln.codcfo`.
- Troca do `REPLACE` em CPF/CGCCFO assume CPF só com dígitos ou máscara padrão
  (checagens no fim dos arquivos .sql).

## Como ativar

1. Criar as duas v2 no CORPORE_ERP (primeiro a de alunos).
2. Rodar `validacao_v2_noturna.sql` fora do pico; esperado 0 linhas nos EXCEPT.
3. No CapRover: `ALUNO_SYNC_CONCURRENCY=1`, `RESPONSAVEL_SYNC_CONCURRENCY=1`,
   `TOTVS_USAR_PROCEDURES_V2=true` (ou `false` para manter as originais).
4. Religar com 1 instância e acompanhar CPU do CEL-BD no DBA Dash e os logs
   "Buscando … procedure …" no Grafana.

Recomendações ainda não incluídas: `connection_limit` baixo na `DATABASE_URL`
deste app (ex.: `;connection_limit=5`), acesso ao banco pela rede interna, e não
agendar carga completa em horário de expediente.
