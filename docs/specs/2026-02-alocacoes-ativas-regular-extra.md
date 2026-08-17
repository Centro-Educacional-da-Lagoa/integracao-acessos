# Alocações Ativas Regular e Extra

**Status:** Entregue  
**Data:** 2026-08-17  
**Responsável:** Codex

## Objetivo

Garantir que a integração use todas as coligadas/filiais com matrícula ativa real da pessoa, seja regular ou extra, para conceder/remover `SUSUARIOFILIAL` e perfis TOTVS.

## Entendimento

O fluxo antigo trata extra da coligada 6 como dependente da coligada 5 e usa flags como `IN_Existe_Matricula_Extra` para preservar acessos. Isso evita remoção indevida, mas não garante a criação do acesso filial real do extra. O problema aparece em aluno/responsável com regular cancelado e extra ativo, especialmente quando o extra está em coligada/filial diferente.

## Premissas

- Coligada 6 deve gerar `SUSUARIOFILIAL` real na coligada 6.
- Perfis acompanham a coligada real da matrícula ativa.
- Procedures podem retornar JSON.
- Durante rollout, o backend deve aceitar ausência do JSON e usar os campos legados como fallback.

## Escopo

- Adicionar `JS_Alocacoes_Ativas` às procedures de aluno e responsável.
- Ajustar DTOs e processors para parsear o JSON.
- Usar alocações ativas como conjunto autoritativo para usuário-filial e perfis.
- Preservar webhook com coligada de origem 6 e resolver RA da coligada 5 por `CODPESSOA` quando a procedure legada exigir RA da 5.

## Fora de Escopo

- Alterar nomes de perfis TOTVS.
- Mudar autenticação, retry ou filas.
- Remover compatibilidade com contrato antigo das procedures nesta entrega.

## Contrato

Campo novo:

```json
[
  { "CD_Coligada": 5, "CD_Filial": 1, "TP_Matricula": "REGULAR" },
  { "CD_Coligada": 6, "CD_Filial": 1, "TP_Matricula": "EXTRA" }
]
```

Nome do campo retornado: `JS_Alocacoes_Ativas`.

## Critérios de Aceite

- Aluno com regular cancelado e extra ativo mantém/cria acesso filial do extra.
- Extra na coligada 6 cria `SUSUARIOFILIAL` e perfil na coligada 6.
- Responsável financeiro recebe todas as filiais dos filhos com matrícula ativa, regular ou extra.
- Responsável com filhos em coligadas/filiais diferentes recebe o conjunto deduplicado.
- Webhook vindo da coligada 6 não consulta RA da 6 contra procedure da 5 sem resolver identidade antes.
- Ausência ou JSON inválido não causa revogação ampla; o backend usa fallback legado e registra log.

## Validação

- `pnpm --dir apps/backend build` executado com sucesso em 2026-08-17.
- Conferir retorno das procedures para casos com regular e extra ativos.
- Reprocessar webhook de aluno da coligada 6 e confirmar resolução por pessoa.
- Validar `SUSUARIOFILIAL` em coligadas 5 e 6 para aluno e responsável financeiro.

## Entrega

- Backend parseia `JS_Alocacoes_Ativas` e usa o conjunto real para usuário-filial e perfis.
- Webhook preserva coligada de origem 6 e resolve RA equivalente na coligada 5 por `CODPESSOA` antes da chamada às procedures legadas.
- Scripts SQL versionados retornam `JS_Alocacoes_Ativas`, corrigem o insert deslocado de extra na ativação de aluno e removem remapeamento 6→5 nas alocações de responsáveis.

## Pendências Operacionais

- Aplicar e validar os scripts SQL no banco TOTVS/homologação.
- Confirmar, com dados reais, que `FOR JSON PATH` está habilitado no ambiente.

## Riscos

- `FOR JSON PATH` exige compatibilidade do SQL Server do ambiente.
- Se o JSON vier incompleto, pode haver revogação indevida; por isso o backend só trata como autoritativo quando há alocação válida parseada.
- Scripts SQL precisam ser aplicados/validados no banco TOTVS, não apenas no repositório.
