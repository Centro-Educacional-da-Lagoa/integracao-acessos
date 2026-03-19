# Plano de Ação — Concessão de Acessos e E-mails de Alunos

## Visão Geral

Rotina que executa a procedure `[dbo].[PR_MGA_Consulta_Aluno_Ativacao_Acesso]` no SQL Server (TOTVS)
para cada coligada configurada, e para cada aluno retornado:

1. Garante existência e ativação da conta Google Workspace
2. Sincroniza o e-mail na ficha da pessoa no TOTVS
3. Garante existência e ativação do usuário no TOTVS
4. Concede perfil de aluno no TOTVS

---

## 1. Variáveis de Ambiente

Adicionar ao `.env` / `.env.example`:

| Variável         | Exemplo                                                                           | Descrição                                    |
| ---------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| `PERIODO_LETIVO` | `2026`                                                                            | Período letivo passado à procedure           |
| `COLIGADAS`      | `[{"id":1,"domain":"alunos.uni1.edu.br"},{"id":5,"domain":"alunos.uni2.edu.br"}]` | Array JSON com id e domínio de cada coligada |

---

## 2. Novo DTO — `AlunoTotvsDto`

**Arquivo:** `apps/backend/src/modules/integrations/totvs/dto/aluno-totvs.dto.ts`

Campos mapeados da procedure:

| Campo                   | Tipo             | Descrição                                     |
| ----------------------- | ---------------- | --------------------------------------------- |
| `CD_Coligada`           | `number`         | Código da coligada                            |
| `CD_Pessoa`             | `string`         | Código da pessoa no TOTVS                     |
| `CD_Registro_Academico` | `string`         | RA do aluno — usado para montar o e-mail      |
| `TX_Email`              | `string \| null` | E-mail atual cadastrado no TOTVS              |
| `CD_Usuario`            | `string \| null` | Login do usuário no TOTVS (null = não criado) |
| `IN_Usuario_Ativo`      | `number \| null` | 1 = ativo, 0 = inativo                        |

---

## 3. Interface `ColigadaConfig`

**Arquivo:** `apps/backend/src/modules/sync/interfaces/coligada-config.interface.ts`

```ts
export interface ColigadaConfig {
  id: number
  domain: string // ex: 'alunos.faculdade.edu.br'
}
```

---

## 4. `PrismaService` (arquivo faltante)

**Arquivo:** `apps/backend/src/core/prisma/prisma.service.ts`

Implementação padrão NestJS: classe `PrismaService` estendendo `PrismaClient`,
implementando `OnModuleInit` com `this.$connect()`.

---

## 5. Atualizações em `TotvsService`

**Arquivo:** `apps/backend/src/modules/integrations/totvs/totvs.service.ts`

### Método real (com lógica ativa):

- `fetchAlunosAtivos(periodoLetivo: string, coligada: number): Promise<AlunoTotvsDto[]>`
  - Executa via `PrismaClient.$queryRaw`:
    `EXEC [dbo].[PR_MGA_Consulta_Aluno_Ativacao_Acesso] @periodoLetivo, @coligada`
  - Retorna array de `AlunoTotvsDto`

### Métodos stub (retornam `void` sem lógica):

- `atualizarEmailPessoa(coligada: number, cdPessoa: string, email: string): Promise<void>` — TODO: chamar API/SP do TOTVS
- `criarUsuario(coligada: number, cdPessoa: string): Promise<void>` — TODO: criar login no TOTVS
- `ativarUsuario(cdUsuario: string): Promise<void>` — TODO: ativar login existente
- `concederPerfilAluno(cdUsuario: string): Promise<void>` — TODO: vincular perfil Portal do Aluno

---

## 6. Ajustes no Módulo Google (migrado de outro projeto)

O módulo Google existente foi trazido de outro projeto e precisa de ajustes antes de ser usado nesta rotina. Os problemas e ações necessárias estão listados abaixo.

---

### 6.1 Renomear arquivos (convenção NestJS)

Os arquivos atualmente usam PascalCase, que não é a convenção NestJS. Renomear:

| Atual                         | Novo                   |
| ----------------------------- | ---------------------- |
| `Google.Controller.ts`        | `google.controller.ts` |
| `Google.Module.ts`            | `google.module.ts`     |
| `Google.service.ts`           | `google.service.ts`    |
| `Shared/constantsFunction.ts` | `shared/constants.ts`  |

---

### 6.2 `google.module.ts` — corrigir import e adicionar exports

Problemas no arquivo atual:

- Import do serviço aponta para `'src/Google/Google.service'` (path absoluto do projeto antigo) — deve ser `'./google.service'`
- Não tem `exports: [GoogleService]`, então outros módulos (`SyncModule`) não conseguem injetar o serviço
- Não fornece `PrismaService` (necessário para o serviço)

Ação: corrigir import, adicionar `exports` e `PrismaService` nos `providers`.

---

### 6.3 `google.controller.ts` — remover dependência de Keycloak

O controller importa `{ Public } from 'nest-keycloak-connect'` — pacote do projeto de origem que **não existe neste projeto**. Como a Fase 1 é backend-only (sem autenticação de usuário final), o controller pode ser mantido mas o decorator `@Public()` e o import devem ser removidos. Se não houver uso imediato do controller nesta fase, ele pode simplesmente ser excluído e reconectado depois.

---

### 6.4 `shared/constants.ts` — generalizar autenticação por coligada

Problema atual: a lógica de autenticação (`JwtAuth`) detecta a coligada comparando o número `5` de forma hardcoded:

```ts
// atual — hardcoded para apenas 2 coligadas
coligada == 5 ? process.env.GOOGLE_KEY_LICEU : process.env.GOOGLE_KEY_CEL
```

Ação: refatorar `JwtAuth` para receber o `coligada: number` e buscar as credenciais dinamicamente a partir de um mapa de env vars (uma entrada por coligada). Estrutura sugerida:

```ts
// novas env vars — uma por coligada
GOOGLE_CLIENT_KEY_1=...   GOOGLE_KEY_1=...   GOOGLE_IMPERSONATOR_1=...
GOOGLE_CLIENT_KEY_5=...   GOOGLE_KEY_5=...   GOOGLE_IMPERSONATOR_5=...
// e assim por diante para cada coligada adicionada no futuro
```

```ts
async JwtAuth(scopes: string[], coligada: number): Promise<Auth.JWT> {
  const clientEmail = process.env[`GOOGLE_CLIENT_KEY_${coligada}`];
  const privateKey  = process.env[`GOOGLE_KEY_${coligada}`];
  const subject     = process.env[`GOOGLE_IMPERSONATOR_${coligada}`];

  if (!clientEmail || !privateKey || !subject)
    throw new Error(`Credenciais Google não configuradas para coligada ${coligada}`);

  return new google.auth.JWT(clientEmail, null, privateKey, scopes, subject);
}
```

---

### 6.5 `google.service.ts` — corrigir imports e adaptar `createGmailAccount`

**Imports quebrados vindos do projeto antigo:**

- `import { splitFullName } from '@utilities/SplitFullName'` — path alias inexistente neste projeto
- `import { PrismaService } from '@utilities/prisma/prisma.service'` — idem

Ação: remover ambos os imports e injetar `PrismaService` do caminho correto deste projeto (`../../core/prisma/prisma.service` ou via `PrismaModule` global).

**`createGmailAccount` busca dados via procedure do projeto antigo:**

```ts
// atual — chama procedure do projeto de origem
exec bd_sinergia.dbo.PR_CAL_Busca_Usuario '${TX_Email}'
```

Na nova rotina os dados do aluno (nome, data de nascimento, etc.) já chegam via `AlunoTotvsDto` retornado por `fetchAlunosAtivos`. A assinatura deve mudar para receber o DTO diretamente, sem consulta adicional.

**`console.log` → logger Pino:**

Todos os `console.log` devem ser substituídos pelo `Logger` do NestJS (injetado via `private readonly logger = new Logger(GoogleService.name)`), para manter a rastreabilidade com `traceId`.

**Detecção de coligada por string de domínio:**

Métodos como `suspendGmailAccount` e `reactivateGmailAccount` detectam a coligada pelo domínio do e-mail (`email.includes('liceufranco.g12')`). Após o ajuste de `JwtAuth` (seção 6.4), esses métodos devem receber `CD_Coligada: number` explicitamente como parâmetro.

---

### 6.6 Novo método — `checkAndProvisionEmail`

Após os ajustes acima, adicionar o método orquestrador que será chamado pelo `AlunoSyncService`:

```ts
async checkAndProvisionEmail(
  email: string,
  aluno: AlunoTotvsDto,
  coligada: ColigadaConfig,
): Promise<'created' | 'activated' | 'already_active'>
```

Lógica interna:

1. Chama `verifyGmailAccount({ TX_Email: email, CD_Coligada: coligada.id })`
2. Se **não existe** → chama `createGmailAccount(aluno, coligada.id)` → retorna `'created'`
3. Se **existe e `suspended: true`** → chama `reactivateGmailAccount(email, coligada.id)` → retorna `'activated'`
4. Se **existe e ativo** → retorna `'already_active'` (nenhuma chamada extra)

---

### 6.7 Variáveis de Ambiente adicionais (Google)

Adicionar ao `.env` / `.env.example` uma entrada por coligada:

| Variável                   | Descrição                                                    |
| -------------------------- | ------------------------------------------------------------ |
| `GOOGLE_CLIENT_KEY_{id}`   | E-mail da service account (client_email do JSON)             |
| `GOOGLE_KEY_{id}`          | Chave privada da service account (private_key do JSON)       |
| `GOOGLE_IMPERSONATOR_{id}` | E-mail do admin do Workspace que a service account impersona |

---

## 7. Novo `AlunoSyncService`

**Arquivo:** `apps/backend/src/modules/sync/aluno-sync.service.ts`

Método principal: `syncAlunosPorColigada(): Promise<void>`

```
Para cada coligada em COLIGADAS (env):
  ↳ [Job por coligada] fetchAlunosAtivos(PERIODO_LETIVO, coligada.id)
    Para cada aluno retornado:
      ↳ [Job por aluno]
        1. email = `${aluno.CD_Registro_Academico}@${coligada.domain}`
        2. googleService.checkAndProvisionEmail(email, aluno, coligada)  ← lógica real
        3. if (!aluno.TX_Email || aluno.TX_Email !== email)
             totvsService.atualizarEmailPessoa(coligada.id, aluno.CD_Pessoa, email) ← stub
        4. if (!aluno.CD_Usuario)
             totvsService.criarUsuario(coligada.id, aluno.CD_Pessoa)               ← stub
           else if (aluno.IN_Usuario_Ativo !== 1)
             totvsService.ativarUsuario(aluno.CD_Usuario)                           ← stub
        5. totvsService.concederPerfilAluno(aluno.CD_Usuario ?? cdNovoUsuario)      ← stub
        [Cada job envolto em try/catch — falha individual não para o lote]
```

Jobs por coligada e por aluno implementados como `Promise.allSettled()` (sem fila externa por ora, fácil migrar para BullMQ depois).

---

## 8. Novo CronJob — `AlunoSyncCron`

**Arquivo:** `apps/backend/src/modules/sync/aluno-sync.cron.ts`

- Decorator `@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)` (ajustável via env `ALUNO_SYNC_CRON`)
- Gera `traceId` via `pinoLogger.assign({ traceId: crypto.randomUUID() })`
- Delega para `alunoSyncService.syncAlunosPorColigada()`

---

## 9. Atualizar `SyncModule`

**Arquivo:** `apps/backend/src/modules/sync/sync.module.ts`

Adicionar ao `providers`: `AlunoSyncService`, `AlunoSyncCron`
Garantir import de `TotvsModule` e `GoogleWorkspaceModule` (já existem).
Incluir `PrismaService` no módulo (ou exportar de um `PrismaModule` global).

---

## Verificação

- Executar `pnpm dev:backend` — sem erros de compilação TypeScript
- Verificar logs pino ao disparar o cron manualmente via endpoint de teste
- Confirmar que o método Google de criação/ativação retorna o status correto para um e-mail inexistente, inativo e ativo
- Confirmar que stubs do TOTVS logam a chamada recebida (com `this.logger.warn('STUB: ...')`) sem lançar exceção

---

## Decisões

- **`Promise.allSettled` sobre BullMQ**: sem overhead de Redis por ora; migração trivial no futuro
- **Stubs com `logger.warn`**: garantem que as chamadas chegam corretamente antes da implementação real
- **Domínio por coligada em env**: flexível sem redeployar código ao adicionar coligadas
- **Google SDK via HTTP direto** (googleapis) já presente no módulo migrado — apenas ajustes de imports e generalização de credenciais necessários
- **Módulo Google migrado de outro projeto**: não reescrever do zero; ajustar imports, remover dependências externas (Keycloak, path aliases antigos) e generalizar a autenticação por coligada
