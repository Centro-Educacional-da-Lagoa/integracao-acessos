# Plano de Ação: Refatoração de Concessão de Acessos — Alunos, Funcionários e Responsáveis

## 1. Visão Geral

O objetivo é reestruturar o fluxo de provisionamento de acessos da integração de alunos tornando-o **genérico e reutilizável**, de modo que futuras integrações de funcionários e responsáveis aproveitem a mesma base.

As principais evoluções incluem:

- Condicionar o provisionamento Gmail e a atualização de e-mail de Pessoa às flags `IN_Funcionario` e `IN_Responsavel`.
- Garantir que o `CD_Usuario` atrelado à pessoa seja sempre o correto (CPF para funcionários/responsáveis, RA para alunos), criando, vinculando e inativando usuários antigos conforme necessário — inclusive migrando perfis válidos.
- Substituir a lógica de perfis hardcoded por um mapeamento centralizado em constante TypeScript no projeto, estruturado por coligada, sistema e tipo de entidade.
- Extrair toda a lógica de орquestração de acessos para um módulo genérico `AccessProvisioningModule`, que os processadores de cada integração vão chamar injetando apenas os dados específicos do contexto.

---

## 2. Tarefas para o Banco de Dados

### 2.1 Procedure `PR_MGA_Consulta_Aluno_Ativacao_Acesso` — verificar campos

Confirmar que os campos abaixo já são retornados. Caso não, incluí-los:

- `IN_Funcionario` (BIT / 0 ou 1)
- `IN_Responsavel` (BIT / 0 ou 1)
- `CD_CPF` (VARCHAR — CPF sem máscara da pessoa)

Nenhuma alteração necessária se já existirem.

---

## 3. Tarefas para o Backend

### 3.1 Atualizar `AlunoTotvsDto` (`aluno-totvs.dto.ts`)

Adicionar os três campos novos ao Zod schema:

```
IN_Funcionario: z.number().int().min(0).max(1)    // 0 ou 1
IN_Responsavel: z.number().int().min(0).max(1)    // 0 ou 1
CD_CPF:         z.string().nullable()             // CPF sem máscara, pode ser nulo
```

### 3.2 Criar enum `TipoEntidade` e constante `PERFIS_ACESSO`

#### Enum `TipoEntidade`

Localização: `src/modules/sync/access-provisioning/enums/tipo-entidade.enum.ts`

```ts
export enum TipoEntidade {
  ALUNO = 'ALUNO',
  FUNCIONARIO = 'FUNCIONARIO',
  RESPONSAVEL = 'RESPONSAVEL',
}
```

#### Interface e constante `PERFIS_ACESSO`

Localização: `src/modules/sync/access-provisioning/constants/perfis-acesso.constants.ts`

Esta constante substitui qualquer leitura de banco para o mapeamento de perfis. A estrutura espelha a tabela lógica definida no plano, mas vive inteiramente no código.

```ts
export interface PerfilAcessoEntry {
  NM_Perfil: string // Nome exato do perfil no TOTVS
  CD_Sistema: string // Ex: 'S' | 'L'
  CD_Coligada: number // Código da coligada
  TP_Entidade: TipoEntidade // ALUNO | FUNCIONARIO | RESPONSAVEL
}

export const PERFIS_ACESSO: PerfilAcessoEntry[] = [
  {
    NM_Perfil: 'Aluno CEL',
    CD_Sistema: 'S',
    CD_Coligada: 1,
    TP_Entidade: TipoEntidade.ALUNO,
  },
  {
    NM_Perfil: 'Aluno CEL',
    CD_Sistema: 'L',
    CD_Coligada: 1,
    TP_Entidade: TipoEntidade.ALUNO,
  },
  {
    NM_Perfil: 'Aluno LICEU',
    CD_Sistema: 'S',
    CD_Coligada: 5,
    TP_Entidade: TipoEntidade.ALUNO,
  },
  {
    NM_Perfil: 'Aluno LICEU',
    CD_Sistema: 'L',
    CD_Coligada: 5,
    TP_Entidade: TipoEntidade.ALUNO,
  },
  // Perfis de FUNCIONARIO e RESPONSAVEL serão adicionados aqui quando as integrações forem implementadas
]
```

> Ao adicionar suporte a funcionários ou responsáveis, basta inserir novos objetos neste array. Nenhuma alteração de banco necessária.

### 3.3 Criar interface genérica `PessoaAcessoContext`

Localização: `src/modules/sync/access-provisioning/interfaces/pessoa-acesso-context.interface.ts`

Esta interface representa os dados mínimos que qualquer integração (alunos, funcionários, responsáveis) deve fornecer ao `AccessProvisioningService`. Os processadores específicos mapeiam seus DTOs para esta interface antes de chamar o serviço genérico.

```ts
export interface PessoaAcessoContext {
  /** Código da pessoa no TOTVS (PPESSOA.CODPESSOA) */
  CD_Pessoa: string

  /** Login do usuário atualmente atrelado à ficha da pessoa (pode ser nulo) */
  CD_Usuario: string | null

  /** CPF da pessoa (necessário para funcionários e responsáveis) */
  CD_CPF: string | null

  /** Identificador principal da entidade (RA para alunos, matrícula para funcionários) */
  CD_Identificador: string

  /** Nome completo */
  NM_Pessoa: string

  /** Data de nascimento no formato DD/MM/YYYY (usada como senha inicial) */
  DT_Nascimento: string | null

  /** E-mail cadastrado na ficha da pessoa */
  TX_Email_Pessoa: string | null

  /** E-mail cadastrado no usuário do sistema */
  TX_Email_Usuario: string | null

  /** Status do usuário de sistema no TOTVS (1 = ativo, 0 = inativo, null = não existe) */
  IN_Usuario_Ativo: number | null

  /** 1 = é funcionário */
  IN_Funcionario: number

  /** 1 = é responsável */
  IN_Responsavel: number

  /** 1 = possui matrícula regular ativa */
  IN_Existe_Matricula_Regular: number

  /** 1 = matrícula regular inativa */
  IN_Inativo_Regular: number

  /** Tipo da entidade — derivado das flags acima */
  TP_Entidade: TipoEntidade

  /** Código da coligada */
  CD_Coligada: number

  /** E-mail institucional calculado pelo processador da integração */
  TX_Email_Institucional: string
}
```

> **Regra de derivação de `TP_Entidade`** (responsabilidade dos processadores):
>
> - `IN_Funcionario === 1` → `FUNCIONARIO`
> - `IN_Responsavel === 1` → `RESPONSAVEL`
> - Caso contrário → `ALUNO`
>
> **Regra de `CD_Identificador` para `cdUsuarioCorreto`** (responsabilidade do `AccessProvisioningService`):
>
> - `FUNCIONARIO` ou `RESPONSAVEL` → usa `CD_CPF`
> - `ALUNO` → usa `CD_Identificador` (RA)

---

### 3.4 Criar módulo genérico `AccessProvisioningModule`

Localização: `src/modules/sync/access-provisioning/`

#### Estrutura de arquivos

```
access-provisioning/
├── access-provisioning.module.ts
├── access-provisioning.service.ts
├── constants/
│   └── perfis-acesso.constants.ts
├── interfaces/
│   └── pessoa-acesso-context.interface.ts
└── enums/
    └── tipo-entidade.enum.ts
```

#### Métodos do `AccessProvisioningService`

Todos os métodos abaixo são **independentes do tipo de entidade** — recebem `PessoaAcessoContext` e aplicam as regras automaticamente.

---

##### `provisionarAcesso(ctx: PessoaAcessoContext): Promise<void>`

Método orquestrador principal. Chamado pelos processadores. Executa a sequência:

1. `_garantirEmailPessoa(ctx)` — se elegível
2. `_garantirUsuario(ctx)` — sempre
3. `_garantirPerfis(cdUsuarioFinal, ctx)` — sempre

---

##### `_garantirEmailPessoa(ctx): Promise<void>` _(privado)_

Responsável apenas pela atualização do **e-mail da ficha da pessoa** (PPESSOA). A condição abaixo é avaliada pelo `AccessProvisioningService` com base nas flags presentes em `PessoaAcessoContext`:

**Condição de elegibilidade:**

```
!IN_Funcionario && !IN_Responsavel
  && IN_Existe_Matricula_Regular
  && !IN_Inativo_Regular
```

> Estas flags existem no contexto porque a integração de alunos pode encontrar pessoas que **também são funcionários ou responsáveis**. Nesse caso, a atualização de e-mail de Pessoa — assim como o provisionamento Gmail — **não se aplica**. A procedure de alunos retorna essas flags exatamente para permitir essa distinção dentro da própria integração de alunos. Integrações futuras (funcionários, responsáveis) trarão suas próprias regras de elegibilidade ao montar o `PessoaAcessoContext`.

Quando elegível e `TX_Email_Pessoa` for nulo ou diferente de `TX_Email_Institucional`:
→ Chamar `totvsService.atualizarEmailAluno(CD_Coligada, CD_Pessoa, TX_Email_Institucional)`

---

##### `_resolverCdUsuarioCorreto(ctx): string` _(privado)_

Retorna o login que **deve** estar atrelado à pessoa:

- `FUNCIONARIO` ou `RESPONSAVEL` → `CD_CPF`
- `ALUNO` → `CD_Identificador`

---

##### `_garantirUsuario(ctx): Promise<{ cdUsuarioFinal: string; dadosUsuario: any }>` _(privado)_

Lógica completa de garantia de usuário correto:

```
cdUsuarioCorreto = _resolverCdUsuarioCorreto(ctx)

SE ctx.CD_Usuario !== null E ctx.CD_Usuario !== cdUsuarioCorreto:
  → "Substituição de usuário errado" (ver § abaixo)

SE ctx.CD_Usuario === null:
  → "Usuário ausente" (ver § abaixo)

SE ctx.CD_Usuario === cdUsuarioCorreto:
  → "Usuário correto já existe" (ver § abaixo)
```

**Cenário A — Usuário ausente (`CD_Usuario === null`)**

1. GET `GlbUsuarioData/{cdUsuarioCorreto}` — verificar existência
2. Não existe → POST `GlbUsuarioData` (criar com CODUSUARIO = cdUsuarioCorreto, NOME, SENHA, DATAINICIO, CODACESSO, EMAIL)
3. Existe e está inativo → PATCH `GlbUsuarioData/{cdUsuarioCorreto}` com `{ STATUS: 1, EMAIL? }`
4. PATCH `EduPessoaData/{CD_Pessoa}` com `{ CODUSUARIO: cdUsuarioCorreto }` — atrelar à pessoa
5. GET `GlbUsuarioData/{cdUsuarioCorreto}` — retornar dados atualizados

**Cenário B — Usuário correto já atrelado (`CD_Usuario === cdUsuarioCorreto`)**

1. Se inativo → PATCH `GlbUsuarioData/{cdUsuarioCorreto}` com `{ STATUS: 1, EMAIL? }`
2. Se ativo mas e-mail errado → PATCH `GlbUsuarioData/{cdUsuarioCorreto}` com `{ EMAIL: TX_Email_Institucional }`
3. GET `GlbUsuarioData/{cdUsuarioCorreto}` — retornar dados

**Cenário C — Usuário errado atrelado (`CD_Usuario !== null && CD_Usuario !== cdUsuarioCorreto`)**

1. Chamar `_coletarPerfisUsuario(ctx.CD_Usuario)` — coletar perfis do usuário antigo (sistemas S e L)
2. Filtrar perfis coletados via `_filtrarPerfisTransferíveis(perfis, ctx.TP_Entidade)` — remover perfis cujo `TP_Entidade` no mapeamento não corresponda ao tipo atual da pessoa
3. Executar Cenário A (garantir usuário correto + atrelar à pessoa)
4. PATCH `GlbUsuarioData/{ctx.CD_Usuario}` com `{ STATUS: 0 }` — inativar usuário antigo
5. Armazenar `perfisTransferíveis` para ser usado em `_garantirPerfis`

---

##### `_coletarPerfisUsuario(cdUsuario): Promise<PerfisColetados>` _(privado)_

Coleta **todos** os perfis do usuário, **sem nenhum filtro de sistema**. Para isso, faz um GET por sistema conhecido (`"S"` e `"L"`) — necessário pois a API TOTVS escopa `GPERMIS` pelo `CODSISTEMA` do header — e retorna as entradas de todos os sistemas agrupadas, sem descartar nada.

> O filtro por `TP_Entidade` é aplicado **depois**, em `_filtrarPerfisTransferíveis`. A separação por sistema é mantida na estrutura de retorno apenas para facilitar a posterior aplicação dos perfis por sistema.

---

##### `_filtrarPerfisTransferíveis(perfis, tipoEntidadeAtual): PerfisColetados` _(privado)_

Para cada perfil em GUSRPERFIL:

- Busca na constante `PERFIS_ACESSO` pelo `NM_Perfil` e `CD_Sistema`
- Se o `TP_Entidade` encontrado **não corresponder** a `tipoEntidadeAtual` → descartar o perfil
- Ex: perfil `"Aluno CEL"` (TP_Entidade = ALUNO) sendo transferido para pessoa com `IN_Funcionario = 1` → descartado
- Perfis não encontrados em `PERFIS_ACESSO` (perfis desconhecidos/externos) → manter sem filtro

---

##### `_garantirPerfis(cdUsuario, ctx, perfisTransferíveis?): Promise<void>` _(privado)_

1. Filtrar `PERFIS_ACESSO` por `CD_Coligada === ctx.CD_Coligada` e `TP_Entidade === ctx.TP_Entidade` — obter todos os perfis esperados para este tipo/coligada
2. Unir com `perfisTransferíveis` (se existir) — sem duplicatas
3. Para cada sistema com perfis esperados (S e L):
   - GET `GlbUsuarioData/{cdUsuario}` com `CODSISTEMA` correspondente
   - Para cada perfil esperado: verificar se já existe em `GPERMIS.GUSRPERFIL`
   - Se não existe → PUT/PATCH `GlbUsuarioData/{cdUsuario}` adicionando o perfil (preservando os demais)

---

### 3.5 Nenhuma alteração no `schema.prisma` ou banco

O mapeamento de perfis vive inteiramente na constante `PERFIS_ACESSO`. O `AccessProvisioningService` **não** usa `PrismaService` para esta finalidade. O `PrismaService` continua sendo injetado apenas se houver necessidade de log/estado de sync.

---

### 3.6 Adicionar métodos novos ao `TotvsService`

Os seguintes métodos precisam ser adicionados para suportar os cenários do `AccessProvisioningService`:

- **`inativarUsuario(cdUsuario: string): Promise<TotvsApiResponse>`**
  PATCH `GlbUsuarioData/{cdUsuario}` com `{ STATUS: 0 }`

- **`concederPerfil(cdUsuario, coligada, codSistema, codPerfil, dadosUsuarioSistema): Promise<TotvsApiResponse>`**
  Extraído de `_verificarEConcederPerfil` (que hoje é privado). Tornar este método **público e genérico**, recebendo `codPerfil` como parâmetro em vez de derivá-lo internamente. O método hardcoded `_verificarEConcederPerfil` deve ser refatorado para usar este método base.

- **`buscarUsuarioPorSistema(cdUsuario, codSistema): Promise<any | false>`**
  Tornar público (atualmente é `private`). Sem mudança de comportamento.

---

### 3.7 Refatorar `aluno-sync.processor.ts`

O método `syncAluno` deve ser simplificado para:

1. Mapear `aluno: AlunoTotvsDto` → `PessoaAcessoContext` (derivar `TP_Entidade`, `TX_Email_Institucional`, `CD_Identificador`)
2. **Gmail** — aplicar condição antes de chamar `googleService.checkAndProvisionEmail`:
   ```
   !IN_Funcionario && !IN_Responsavel
     && IN_Existe_Matricula_Regular
     && !IN_Inativo_Regular
   ```
3. Chamar `accessProvisioningService.provisionarAcesso(ctx)`

Toda a lógica de usuário, perfis e e-mail de Pessoa que hoje está inline no processor **deve ser removida** — ela passa a viver no `AccessProvisioningService`.

---

### 3.8 Atualizar `sync.module.ts`

- Registrar `AccessProvisioningModule` com `forwardRef` ou como importação direta
- `AccessProvisioningModule` deve exportar `AccessProvisioningService`
- `AccessProvisioningModule` importa: `TotvsService` (via `TotvsModule`)
- `PrismaService` **não** é necessário no `AccessProvisioningModule` para o mapeamento de perfis

---

### 3.9 Regras de Negócio — Resumo por Etapa

| Etapa                                | Condição                                                                                   | Ação                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Gmail                                | `!IN_Funcionario && !IN_Responsavel && IN_Existe_Matricula_Regular && !IN_Inativo_Regular` | Provisionar / reativar conta Google                                                     |
| E-mail Pessoa                        | mesma condição acima + `TX_Email_Pessoa !== TX_Email_Institucional`                        | PATCH `EduPessoaData`                                                                   |
| `cdUsuarioCorreto`                   | `IN_Funcionario \|\| IN_Responsavel`                                                       | usar `CD_CPF`; caso contrário usar `CD_Identificador` (RA)                              |
| Usuário ausente                      | `CD_Usuario === null`                                                                      | GET verificar → criar se necessário → PATCH atrelar pessoa                              |
| Usuário correto inativo              | `CD_Usuario === cdUsuarioCorreto && IN_Usuario_Ativo !== 1`                                | PATCH reativar (+ email se necessário)                                                  |
| Usuário correto ativo, e-mail errado | `CD_Usuario === cdUsuarioCorreto && IN_Usuario_Ativo === 1`                                | PATCH atualizar e-mail                                                                  |
| Usuário errado atrelado              | `CD_Usuario !== null && CD_Usuario !== cdUsuarioCorreto`                                   | Coletar + filtrar perfis → garantir usuário correto → inativar antigo → garantir perfis |
| Perfis                               | Sempre após usuário garantido                                                              | Filtrar `PERFIS_ACESSO` (constante) + transferíveis → conceder os que faltam            |

---

## 4. Tarefas para o Frontend

- **Componentes/Páginas:** Nenhuma alteração necessária nesta fase. Toda a lógica é de integração backend.
- **Integração:** N/A

---

## 5. Notas de Preparação para Futuras Integrações

Ao implementar `FuncionarioSyncProcessor` e `ResponsavelSyncProcessor` no futuro:

- Criar o DTO específico (ex: `FuncionarioTotvsDto` atualizado com os campos da procedure)
- Mapear para `PessoaAcessoContext` com:
  - `TP_Entidade = FUNCIONARIO` ou `RESPONSAVEL`
  - `CD_Identificador` = matrícula ou código específico
  - `TX_Email_Institucional` = e-mail institucional calculado pelo processador
- Chamar `accessProvisioningService.provisionarAcesso(ctx)`
- Para funcionários: incluir provisão Google quando aplicável
- Para responsáveis: sem provisão Google
- Adicionar os registros de perfil correspondentes na constante `PERFIS_ACESSO` antes de ativar a integração
