# API TOTVS - Requisições HTTP

Este documento descreve o serviço de requisições HTTP para a API REST da TOTVS, integrado ao `TotvsService`.

## Arquivos

- **`totvs-api.constants.ts`**: Constantes de configuração da API TOTVS
- **`totvs.service.ts`**: Serviço unificado com queries SQL e requisições HTTP à API REST

## Configuração

Adicione as seguintes variáveis de ambiente no arquivo `.env`:

```env
# URL base da API REST do TOTVS RM
TOTVS_API_URL=http://servidor:porta/api

# Token de autorização (geralmente Basic Authentication)
TOTVS_API_AUTHORIZATION=Basic base64encodedcredentials
```

### Obtendo o Token de Autorização

O token de autorização geralmente é uma string no formato:

```
Basic [base64(usuario:senha)]
```

Para gerar o token:

```bash
echo -n "usuario:senha" | base64
```

## Funcionalidades Implementadas

### 1. Atualizar Email do Aluno

Atualiza o email cadastrado na ficha da pessoa (PPESSOA.EMAIL) no TOTVS via API REST.

**Método**: `atualizarEmailAluno(coligada: number, cdPessoa: string, email: string)`

**Parâmetros**:

- `coligada`: Código da coligada
- `cdPessoa`: Código da pessoa no TOTVS
- `email`: Novo email da pessoa

**Exemplo de uso**:

```typescript
import { TotvsService } from './modules/integrations/totvs/totvs.service'

@Injectable()
export class ExemploService {
  constructor(private readonly totvsService: TotvsService) {}

  async atualizarEmailAluno() {
    const resultado = await this.totvsService.atualizarEmailAluno(
      1, // coligada
      '00123', // CD_Pessoa
      'aluno@exemplo.com.br',
    )

    if (resultado.status === 'Sucesso') {
      console.log('Email atualizado com sucesso!')
    } else {
      console.error('Erro ao atualizar email:', resultado.data)
    }
  }
}
```

**Retorno**:

```typescript
{
  status: 'Sucesso' | 'Error',
  data: any // Dados retornados pela API TOTVS ou erro
}
```

## Estrutura das Requisições

Todas as requisições seguem o padrão:

1. **URL**: `{TOTVS_API_URL}/rmsrestdataserver/rest/EduPessoaData/{CODCOLIGADA}$_${CD_PESSOA}`
2. **Método**: `PATCH` para atualizações
3. **Headers**:
   - `CODCOLIGADA`: Código da coligada
   - `CODFILIAL`: Código da filial (padrão: '1')
   - `CODTIPOCURSO`: Código do tipo de curso (padrão: '1')
   - `CODSISTEMA`: Código do sistema (padrão: 'S')
   - `Authorization`: Token de autorização
4. **Body**: Objeto com os parâmetros a serem atualizados

## Logs

O serviço registra logs detalhados incluindo:

- Início da operação
- Sucesso da operação
- Erros com detalhes dos parâmetros utilizados

## Próximas Implementações

Outras operações podem ser adicionadas seguindo o mesmo padrão:

- Atualizar telefone do aluno
- Atualizar endereço do aluno
- Criar novo aluno
- Desativar usuário
- etc.
