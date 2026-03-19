# API: Cancelamento de Acessos de Alunos

## 1. Cancelamento em Lote

- Rota: `POST /sync/alunos/cancelamentos`
- Payload de Envio:

```json
{
  "CD_Periodo_Letivo": "2026/1",
  "CD_Coligada": 1
}
```

- Payload de Resposta:

```json
{
  "message": "Cancelamento de acessos de alunos iniciado."
}
```

## 2. Cancelamento Unitário

- Rota: `POST /sync/alunos/cancelamentos/aluno`
- Payload de Envio:

```json
{
  "CD_Registro_Academico": "202600123",
  "CD_Coligada": 1,
  "CD_Periodo_Letivo": "2026/1",
  "TP_Origem_Disparo": "REPROCESSAMENTO"
}
```

- Payload de Resposta:

```json
{
  "message": "Cancelamento unitário de acesso iniciado."
}
```
