# Integrações

> Sistemas externos com que este projeto troca dados.

## [Nome da integração]
- **Origem → destino:** [...]
- **Tipo:** [API REST | SOAP | arquivo | SFTP | webhook | fila]
- **Gatilho:** [evento | cron | manual]
- **Autenticação:** [tipo — sem valores de segredo aqui]
- **Contrato/payload:** [link ou descrição resumida]
- **Retry / idempotência:** [política]
- **Falha:** [comportamento esperado quando o externo cai]
- **Observabilidade:** [onde acompanhar; logs; evidências]

## [Outra integração]
- [...]

## TOTVS RM — Acessos de Alunos e Responsáveis
- **Origem → destino:** procedures SQL Server TOTVS → backend NestJS → DataServers TOTVS (`GlbUsuarioData`, `EduPessoaData`, `EduUsuarioFilialData`) e Google quando aplicável.
- **Gatilho:** jobs em lote, reprocessamentos e webhook de aluno.
- **Contrato relevante:** procedures de aluno/responsável podem retornar `JS_Alocacoes_Ativas` com coligada, filial e tipo de matrícula (`REGULAR`/`EXTRA`).
- **Regra de coligada 6:** webhook deve preservar origem 6; quando a procedure legada exigir RA da 5, o backend resolve `CODPESSOA` pelo RA da 6 e tenta localizar RA equivalente na coligada 5. Provisionamento final usa coligada/filial real da matrícula ativa.
- **Falha:** JSON inválido ou ausente é ignorado com log e o backend mantém fallback legado para evitar revogação ampla.

## Observabilidade central — Loki, Tempo e Error Capture
- **Origem → destino:** backend NestJS → stdout Docker/Alloy/Loki; backend NestJS → OTLP Collector/Tempo; backend NestJS → Error Capture Service.
- **Tipo:** logs JSON em stdout, traces OTLP HTTP e API REST para captura de erros.
- **Gatilho:** requisições HTTP, erros globais, bootstrap e logs de serviços/jobs.
- **Autenticação:** Error Capture usa header `X-Error-Capture-Key`; valor vem de `ERROR_CAPTURE_KEY`.
- **Contrato/payload:** `POST {ERROR_CAPTURE_URL}/errors` com `service`, `environment`, `error_type`, `error_message`, `stack_trace`, `trace_id`, `span_id`, contexto HTTP e `payload` do request.
- **Retry / idempotência:** envio fire-and-forget, sem retry persistente nesta entrega.
- **Falha:** Collector OTLP ou Error Capture indisponíveis não podem derrubar a aplicação nem bloquear resposta HTTP.
- **Observabilidade:** logs usam JSON puro com `service`, `context`, `traceId` e `spanId`; Loki não deve receber CPF, e-mail, token, senha, telefone, nome completo ou payload completo.
