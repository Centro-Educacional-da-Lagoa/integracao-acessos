# Estado Atual

> Snapshot do trabalho em andamento. **Atualize ao final de cada sessão.** É a primeira coisa que qualquer IA lê ao começar.

**Última atualização:** 2026-08-17 por Codex

## Foco atual
Implementada regra de cancelamento de Gmail institucional de concluintes do Ensino Médio com carência de 6 meses.

## Em andamento
- [x] Confirmar data-base oficial do fim do período letivo anterior para conclusão do Ensino Médio: `31/12/<ano>`.
- [x] Confirmar liberação operacional: `30/06` do ano seguinte ao período letivo concluído.
- [x] Aprovar spec `docs/specs/2026-04-cancelamento-email-concluintes-em.md`.
- [x] Implementar `IN_Cancela_Email` na procedure de cancelamento de aluno e no backend.
- [x] Criar query/procedure e cron específicos para cancelamento de Gmail de concluintes EM elegíveis.
- [ ] Validar no stack central Grafana/Loki/Tempo/Error Capture que `trace_id` correlaciona logs, traces e evento de erro.
- [ ] Confirmar contrato real do Error Capture Service em ambiente central.
- [ ] Definir se jobs Bull devem propagar `traceId` da requisição original em evolução futura.
- [ ] Configurar `SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `ERROR_CAPTURE_URL` e `ERROR_CAPTURE_KEY` nos ambientes.
- [ ] Aplicar e validar em SQL Server/TOTVS as procedures alteradas com `JS_Alocacoes_Ativas`.
- [ ] Reprocessar caso com regular cancelado e extra ativo para confirmar criação real de `SUSUARIOFILIAL` na filial/coligada do extra.
- [ ] Reprocessar webhook vindo da coligada 6 para confirmar resolução RA 6 → `CODPESSOA` → RA 5 quando necessário.

## Próximos passos (ordem sugerida)
1. Aplicar e validar em SQL Server/TOTVS as procedures de cancelamento de aluno e concluintes EM.
2. Habilitar o cron `handleCancelamentoEmailConcluintesEnsinoMedioCron` quando o ambiente operacional autorizar.
3. Publicar backend em ambiente com acesso ao Collector/Error Capture central.
4. Disparar requisição válida e erro HTTP para validar correlação por `trace_id` em Loki, Tempo e Error Capture.
5. Configurar variáveis de observabilidade conforme `apps/backend/.env.example`.
6. Publicar em homologação as quatro procedures alteradas em `apps/docs/`.
7. Validar retorno de `JS_Alocacoes_Ativas` para aluno com regular em uma coligada/filial e extra em outra.
8. Confirmar responsável financeiro com filhos em filiais/coligadas diferentes recebendo todas as alocações ativas.
9. Validar se o alias de procedure 6→5 ainda é necessário após evolução das procedures para consulta direta por `CD_Pessoa`.

## Bloqueios / decisões pendentes
- Sem acesso ao SQL Server/TOTVS nesta sessão; validação SQL foi feita por revisão estática e build do backend.
- Sem acesso ao stack central nesta sessão; validação de Grafana/Loki/Tempo/Error Capture ficou pendente para ambiente integrado.

## Pendências conhecidas / dívida técnica
- Contexto do projeto ainda contém vários templates não preenchidos.
- O fluxo de provisionamento marca conclusão mesmo quando `SUSUARIOFILIAL` falha; isso dificulta reprocessamento operacional.
- Procedures ainda mantêm compatibilidade com chamada por RA; evolução ideal é aceitarem `CD_Pessoa` como filtro primário.
- Propagação de contexto OTel para jobs Bull ainda não foi implementada; jobs mantêm logs estruturados, mas não herdam automaticamente o trace da requisição que enfileirou o trabalho.

## Notas de handoff
Entregue spec `2026-04-cancelamento-email-concluintes-em`: `IN_Cancela_Email` na procedure de cancelamento de aluno, procedure específica para concluintes EM elegíveis, guarda no cancelamento de Gmail e cron complementar. Build do backend passou; SQL ainda precisa aplicação/validação no TOTVS.

Implementada observabilidade centralizada: OpenTelemetry em `apps/backend/src/tracing.ts`, logger Pino JSON com `traceId`/`spanId`, sanitização central de logs, `ErrorCaptureService`, filtro global sanitizado e `.env.example`. Build passou e smokes locais confirmaram bootstrap com OTel ligado/desligado, Collector/Error Capture indisponíveis sem crash e logs HTTP com trace ativo.
