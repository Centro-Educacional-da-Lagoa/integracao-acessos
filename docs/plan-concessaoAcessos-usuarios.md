# Plano de Ação - Concessão de Acessos de Usuários (Alunos)

## Contexto

Este documento define o fluxo para gerenciar a criação e atualização de usuários de alunos na API TOTVS durante o processo de sincronização.

## Endpoint API TOTVS

- **Base**: `GlbUsuarioData`
- **Operações específicas** (PATCH/PUT): `GlbUsuarioData/${cdusuario}`

## Fluxo de Implementação

### 1. Cenário: CD_Usuario é nulo (Usuário não existe no sistema)

#### 1.1. Verificação Prévia

Antes de criar um novo usuário, realizar um **GET** para verificar se o usuário já existe na base TOTVS:

```
GET GlbUsuarioData/${CD_Usuario} (que é o RA do aluno)
```

#### 1.2. Criação de Usuário (POST)

**Condição**: Prosseguir somente se o usuário NÃO existir na verificação anterior.

**Endpoint**: `POST GlbUsuarioData`

**Payload**:

```json
{
  "CODUSUARIO": "<RA do aluno>",
  "NOME": "<NM_Aluno>",
  "DATAINICIO": "<data da criação>",
  "SENHA": "<DT_Nascimento sem barras>",
  "CODACESSO": "Acesso03",
  "EMAIL": "<email do aluno>"
}
```

**Observações**:

- **CODUSUARIO**: RA (Registro Acadêmico) do aluno
- **NOME**: Nome completo do aluno (campo NM_Aluno)
- **DATAINICIO**: Data atual da criação do registro
- **SENHA**: Data de nascimento do aluno formatada sem barras (ex: 01/01/2000 → 01012000)
- **CODACESSO**: Fixo como 'Acesso03'
- **EMAIL**: Email novo (criado no processo ou obtido do campo TX_Email_Pessoa)

---

### 2. Cenário: Usuário Inativo

#### 2.1. Reativação Simples (somente status)

**Condição**: Usuário está inativo E email está correto (TX_Email_Usuario preenchido e igual ao email do aluno)

**Endpoint**: `PATCH GlbUsuarioData/${cdusuario}`

**Payload**:

```json
{
  "STATUS": 1
}
```

---

#### 2.2. Reativação com Atualização de Email

**Condição**: Usuário está inativo E (TX_Email_Usuario é nulo OU diferente do email do aluno)

**Endpoint**: `PATCH GlbUsuarioData/${cdusuario}`

**Payload**:

```json
{
  "STATUS": 1,
  "EMAIL": "<email do aluno>"
}
```

**Observações**:

- Esta abordagem evita realizar dois PATCH consecutivos
- Atualiza simultaneamente o status e o email quando necessário

---

## Resumo das Regras de Negócio

| Situação                                  | Ação                         | Endpoint                          | Campos                                                |
| ----------------------------------------- | ---------------------------- | --------------------------------- | ----------------------------------------------------- |
| CD_Usuario nulo                           | Verificar existência + Criar | GET + POST GlbUsuarioData         | CODUSUARIO, NOME, DATAINICIO, SENHA, CODACESSO, EMAIL |
| Usuário inativo (email OK)                | Reativar                     | PATCH GlbUsuarioData/${cdusuario} | STATUS: 1                                             |
| Usuário inativo (email ausente/diferente) | Reativar + Atualizar email   | PATCH GlbUsuarioData/${cdusuario} | STATUS: 1, EMAIL                                      |

---

## Próximos Passos para Implementação

1. Criar serviço para verificação de usuário existente (GET)
2. Implementar método de criação de usuário (POST)
3. Implementar método de atualização de usuário (PATCH)
4. Integrar lógica no fluxo de sincronização de alunos (aluno-sync.processor.ts)
5. Adicionar tratamento de erros e logs apropriados
6. Criar testes unitários para os novos métodos
7. Validar integração em ambiente de desenvolvimento

---

## Pontos de Atenção

- ⚠️ **Validação prévia**: Sempre verificar se o usuário já existe antes de criar
- ⚠️ **Formatação de senha**: Garantir remoção correta das barras da data de nascimento
- ⚠️ **Otimização**: Agrupar atualizações de STATUS e EMAIL em um único PATCH quando aplicável
- ⚠️ **Email**: Priorizar email criado no processo, caso contrário usar TX_Email_Pessoa
