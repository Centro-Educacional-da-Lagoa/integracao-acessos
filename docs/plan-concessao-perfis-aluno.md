# Plano de Execução — Concessão de Perfis ao Aluno no TOTVS

## Contexto

Esta etapa ocorre dentro de `syncAluno` no `AlunoSyncProcessor`, **após** a etapa 3 (criação/ativação do usuário).  
Neste ponto, `usuarioJaExiste` é garantidamente um objeto válido com `usuarioJaExiste.data` populado.

A concessão de perfis precisa ser verificada e, se necessário, aplicada para **dois sistemas**:

| CODSISTEMA | Perfil esperado (CD_Coligada 1) | Perfil esperado (CD_Coligada 5) |
| ---------- | ------------------------------- | ------------------------------- |
| `S`        | `Aluno CEL`                     | `Aluno LICEU`                   |
| `L`        | `Aluno CEL`                     | `Aluno LICEU`                   |

---

## ⚠️ Comportamento da API: GPERMIS é escopado por CODSISTEMA do header

O `GET GlbUsuarioData/{cdUsuario}` retorna em `GPERMIS` **apenas as permissões do sistema passado no header `CODSISTEMA`** da requisição.

- `usuarioJaExiste` foi obtido com o sistema padrão (`totvsApiConstants.codigoSistema` = `"S"`) → `usuarioJaExiste.data.GPERMIS` contém **apenas** as permissões do sistema `"S"`.
- Para verificar/conceder permissões do sistema **`"L"`**, é preciso fazer um **novo GET** ao mesmo endpoint, mas passando `CODSISTEMA: "L"` no header.

---

## Estrutura de dados de `GPERMIS` (por sistema)

```ts
// usuarioJaExiste.data  (escopo CODSISTEMA "S")
{
  CODUSUARIO: string,
  GPERMIS: [
    {
      CODCOLIGADA: number,
      CODSISTEMA: string,       // sempre "S" nesta resposta
      CODUSUARIO: string,
      GUSRPERFIL: [
        {
          CODCOLIGADA: number,
          CODUSUARIO: string,
          CODSISTEMA: string,
          CODPERFIL: string,    // ex: "Aluno CEL", "Aluno LICEU"
          INDICE: number,
        }
      ]
    }
  ]
}
// Para o sistema "L", a estrutura é idêntica, mas obtida via GET separado com header CODSISTEMA: "L"
```

---

## Fluxo de execução por sistema

### CODSISTEMA `"S"` — dados já disponíveis

Usar diretamente `usuarioJaExiste.data.GPERMIS`:

```
1. Buscar em GPERMIS o obj onde CODCOLIGADA === aluno.CD_Coligada
   → Não achou? → conceder perfil para sistema "S"
   → Achou? → inspecionar GUSRPERFIL
     → Não tem CODPERFIL esperado? → conceder perfil para sistema "S"
     → Tem? → skip (já OK)
```

### CODSISTEMA `"L"` — requer novo GET

Fazer um novo `GET GlbUsuarioData/{cdUsuario}` com `CODSISTEMA: "L"` no header para obter as permissões desse sistema:

```
1. GET GlbUsuarioData/{cdUsuario} com header CODSISTEMA: "L"
   → Obter dadosUsuarioSistemaL.GPERMIS
2. Buscar em GPERMIS o obj onde CODCOLIGADA === aluno.CD_Coligada
   → Não achou? → conceder perfil para sistema "L"
   → Achou? → inspecionar GUSRPERFIL
     → Não tem CODPERFIL esperado? → conceder perfil para sistema "L"
     → Tem? → skip (já OK)
```

---

## Verificação de perfil (mesma lógica para ambos os sistemas)

```ts
const codPerfilEsperado = aluno.CD_Coligada === 1 ? 'Aluno CEL' : 'Aluno LICEU'

// gpermisDoSistema = GPERMIS obtido para o sistema em questão
const permissaoColigada = gpermisDoSistema?.find(
  (p) => p.CODCOLIGADA === aluno.CD_Coligada,
)

const precisaConceder =
  !permissaoColigada ||
  !permissaoColigada.GUSRPERFIL?.some((p) => p.CODPERFIL === codPerfilEsperado)
```

---

## Payload de concessão (PATCH `GlbUsuarioData/{cdUsuario}`)

Quando for necessário conceder, montar o payload preservando o `GPERMIS` existente **do sistema em questão** (obtido no GET anterior):

```ts
// Clonar o GPERMIS do sistema (já escopado)
const gpermisAtualizado = [...(gpermisDoSistema ?? [])]

const novoPerfilObj = {
  CODCOLIGADA: aluno.CD_Coligada,
  CODUSUARIO: aluno.CD_Registro_Academico,
  CODSISTEMA: codSistema, // "S" ou "L"
  CODPERFIL: codPerfilEsperado,
  INDICE: 0,
}

const idxPermissao = gpermisAtualizado.findIndex(
  (p) => p.CODCOLIGADA === aluno.CD_Coligada,
)

if (idxPermissao === -1) {
  // Objeto da coligada não existe → criar
  gpermisAtualizado.push({
    CODCOLIGADA: aluno.CD_Coligada,
    CODSISTEMA: codSistema,
    CODUSUARIO: aluno.CD_Registro_Academico,
    GUSRPERFIL: [novoPerfilObj],
  })
} else {
  // Objeto existe → adicionar perfil mantendo os existentes em GUSRPERFIL
  gpermisAtualizado[idxPermissao] = {
    ...gpermisAtualizado[idxPermissao],
    GUSRPERFIL: [
      ...(gpermisAtualizado[idxPermissao].GUSRPERFIL ?? []),
      novoPerfilObj,
    ],
  }
}

const payload = { GPERMIS: gpermisAtualizado }
```

**Endpoint:**  
`PATCH {urlAPI}/rmsrestdataserver/rest/GlbUsuarioData/{cdUsuario}`

**Headers do PATCH** (o `CODSISTEMA` no header deve corresponder ao sistema que está sendo modificado):

```
CODFILIAL:     totvsApiConstants.codigoFilial
CODSISTEMA:    "S" ou "L"   ← sistema alvo da concessão
Authorization: totvsApiConstants.authorization
```

---

## Implementação — `TotvsService`

### Novo método: `buscarUsuarioPorSistema`

Permite buscar os dados de um usuário escopado por um `CODSISTEMA` específico:

```ts
async buscarUsuarioPorSistema(
  cdUsuario: string,
  codSistema: string,        // "S" ou "L"
): Promise<any | false>
```

Faz o mesmo `GET GlbUsuarioData/{cdUsuario}` que `verificarUsuario`, mas com `CODSISTEMA: codSistema` no header.  
Retorna `data` do usuário ou `false` se não encontrado / erro lógico.

### Método revisado: `concederPerfilAluno`

```ts
async concederPerfilAluno(
  cdUsuario: string,
  coligada: number,
  dadosUsuarioSistemaS: any,   // usuarioJaExiste.data
): Promise<TotvsApiResponse>
```

Fluxo interno:

```
1. Verificar sistema "S" usando dadosUsuarioSistemaS.GPERMIS
   → Se precisar conceder: PATCH com CODSISTEMA "S" no header

2. Buscar dados do sistema "L" via GET com CODSISTEMA "L"
   → Se precisar conceder: PATCH com CODSISTEMA "L" no header
```

---

## Impacto no `AlunoSyncProcessor`

Na etapa 4 do `syncAluno`, substituir a chamada stub:

```ts
// Antes (stub)
await this.totvsService.concederPerfilAluno(cdUsuario)

// Depois
if (usuarioJaExiste?.data) {
  const resultPerfil = await this.totvsService.concederPerfilAluno(
    cdUsuario,
    coligada.id,
    usuarioJaExiste.data,
  )
  if (resultPerfil.status === 'Error') {
    this.logger.warn(
      `[Aluno ${ra}] Etapa 4 falhou — concederPerfilAluno. Abortando sync.`,
    )
    return
  }
}
```

---

## Checklist de implementação

- [ ] Criar método `buscarUsuarioPorSistema(cdUsuario, codSistema)` no `TotvsService`
- [ ] Substituir o stub `concederPerfilAluno` no `TotvsService` pela implementação real
  - [ ] Verificar sistema `"S"` a partir de `dadosUsuarioSistemaS.GPERMIS`
  - [ ] Conceder perfil para `"S"` se necessário (PATCH com header `CODSISTEMA: "S"`)
  - [ ] Chamar `buscarUsuarioPorSistema(cdUsuario, "L")` para obter dados do sistema `"L"`
  - [ ] Conceder perfil para `"L"` se necessário (PATCH com header `CODSISTEMA: "L"`)
  - [ ] Preservar `GPERMIS` e `GUSRPERFIL` existentes em ambos os PATCHes
- [ ] Atualizar a chamada no `AlunoSyncProcessor` (etapa 4) passando `usuarioJaExiste.data`
- [ ] Testar com aluno da coligada 1 → perfil `Aluno CEL`
- [ ] Testar com aluno da coligada 5 → perfil `Aluno LICEU`
- [ ] Testar cenário onde perfil já existe em `"S"` → deve fazer skip sem PATCH
- [ ] Testar cenário onde perfil já existe em `"L"` → deve fazer skip sem PATCH
- [ ] Verificar que os demais perfis em `GUSRPERFIL` não são perdidos após os PATCHes
