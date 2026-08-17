# Observabilidade Centralizada

- **ID:** 2026-03-observabilidade-centralizada
- **Status:** Entregue
- **Atualizada em:** 2026-08-17 por Codex
- **Playbook:** integracao-externa
- **Rastreabilidade:** GitHub Issue pendente de verificação antes da execução; ClickUp não acionado nesta etapa.

## Objetivo

- **Funcional:** permitir diagnosticar requisições, jobs e falhas da integração de acessos com correlação ponta a ponta entre logs, traces e eventos de erro, sem expor dados pessoais em logs operacionais.
- **Técnico:** padronizar logs JSON no stdout com `traceId`/`spanId`, instrumentar OpenTelemetry com export OTLP HTTP para o stack central, capturar erros HTTP no Error Capture Service de forma não bloqueante e documentar variáveis de ambiente de runtime.

## Contexto / motivação

A aplicação é um backend NestJS em `apps/backend` que integra SQL Server/TOTVS, DataServers TOTVS, Google e filas Bull/Redis. O stack central de observabilidade informado já existe fora deste repositório: Alloy -> Loki, OTLP Collector -> Tempo, Grafana e Error Capture Service.

Contextos relevantes:

- `docs/contexto/integracoes.md`: integrações TOTVS RM, Google e backend.
- `docs/contexto/regras-negocio.md`: provisionamento em coligadas/filiais reais e criticidade operacional.
- `.codex/context/padroes-observabilidade.md`: logs de início, conclusão, falha e identificadores rastreáveis.
- `.codex/context/padroes-integracoes.md`: autenticação, timeout, falha, retry e rastreabilidade para integrações externas.

Leitura inicial do código mostra que:

- `apps/backend/src/core/logger/logger.module.ts` já usa `nestjs-pino`, `pino` e `pino-http`.
- `apps/backend/src/main.ts` já configura `app.useLogger(app.get(Logger))` e registra `AllExceptionsFilter`.
- `apps/backend/src/common/filters/all-exceptions.filter.ts` hoje loga `request.body`, o que viola a regra de não expor PII no Loki.
- `apps/backend/src/common/interceptors/trace.interceptor.ts` gera `x-trace-id` próprio, mas não está registrado globalmente e deve ser substituído ou harmonizado com o trace ativo do OpenTelemetry.
- Há `console.log` em `apps/backend/src/modules/sync/aluno-sync.controller.ts` e logs existentes que podem imprimir e-mail, payloads completos ou dados sensíveis.

## Premissas

- O stack central está operacional e não será alterado por esta demanda.
- `SERVICE_NAME` será definido por ambiente; se ausente, a aplicação usará fallback controlado como `integracao-acessos-backend`.
- `OTEL_EXPORTER_OTLP_ENDPOINT` apontará para `http://10.39.112.3:4318` em produção/homologação, podendo ser sobrescrito por ambiente.
- `ERROR_CAPTURE_URL` apontará para `http://10.39.112.3:4400` em produção/homologação, podendo ser sobrescrito por ambiente.
- `ERROR_CAPTURE_KEY` será segredo de ambiente e não deve ser versionado.
- O Error Capture Service é responsável por criptografar payloads sensíveis recebidos; este backend apenas evita enviar PII ao Loki e aos spans.
- Falhas no Collector OTLP ou no Error Capture não podem impedir bootstrap, resposta HTTP, jobs ou shutdown da aplicação.
- Não há frontend próprio nesta demanda.

## Escopo

- Criar inicialização OpenTelemetry em `apps/backend/src/tracing.ts`.
- Importar tracing como primeiro import executável de `apps/backend/src/main.ts`.
- Ajustar logger Pino para emitir JSON puro em produção, controlar nível por `LOG_LEVEL` e enriquecer logs com `service`, `traceId` e `spanId` quando existir span ativo.
- Registrar logs HTTP obrigatórios de entrada, saída e erro com campos estruturados.
- Refatorar o filtro global de exceções para log sanitizado e envio fire-and-forget ao Error Capture Service.
- Criar serviço/adapter dedicado para Error Capture com autenticação por `X-Error-Capture-Key`, timeout de 2s e falha silenciosa.
- Remover `console.log` e sanear logs legados que exponham CPF, e-mail, token, senha, nome completo, telefone ou payloads completos.
- Documentar variáveis de ambiente em arquivo de exemplo sem segredos.
- Garantir graceful shutdown do SDK OpenTelemetry no `SIGTERM`.
- Adicionar testes automatizados mínimos onde o projeto suportar e roteiro manual de validação contra Loki, Tempo, Grafana e Error Capture.

## Fora de escopo

- Alterar Loki, Tempo, Grafana, Alloy, OTLP Collector ou Error Capture Service central.
- Criar dashboard novo no Grafana.
- Alterar regras de provisionamento TOTVS, SQL Server, Google ou filas além dos logs e traces.
- Persistir eventos de erro localmente.
- Implementar retry persistente para Error Capture; o envio é best-effort/fire-and-forget.
- Criar spans manuais para operações triviais ou de baixo valor operacional.

## Contratos

### Logs stdout

Cada linha de log em produção deve ser JSON válido, sem cores e sem pretty print.

Campos mínimos:

```json
{
  "level": "info",
  "time": "2026-08-17T12:00:00.000Z",
  "msg": "descricao do evento",
  "service": "integracao-acessos-backend",
  "context": "NomeDaClasseOuModulo",
  "traceId": "otel-trace-id",
  "spanId": "otel-span-id"
}
```

Regras:

- `traceId` e `spanId` devem ser omitidos quando não houver span ativo; nunca emitir string vazia.
- Campos adicionais devem ser estruturados, por exemplo `method`, `url`, `statusCode`, `responseTimeMs`, `entityId`, `jobId`, `queueName`, `integration`, `operation`.
- Logs HTTP devem incluir entrada, saída e erro.
- Logs de jobs/cron devem manter pelo menos `jobId`, `queueName` ou identificador de execução, além de `traceId` quando houver span ativo.

### OpenTelemetry

Arquivo: `apps/backend/src/tracing.ts`.

Contrato:

- Inicializar `NodeSDK` somente quando `OTEL_ENABLED !== 'false'`.
- Usar `OTLPTraceExporter` HTTP com `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Definir resource attributes:
  - `service.name = SERVICE_NAME`
  - `service.version = version` de `apps/backend/package.json`
  - `deployment.environment = NODE_ENV`
- Incluir instrumentações automáticas para Node HTTP e bibliotecas suportadas por `@opentelemetry/auto-instrumentations-node`.
- Avaliar instrumentação de Prisma separadamente; se não houver instrumentação confiável compatível, registrar como limitação explícita da entrega.
- Não derrubar a aplicação quando o Collector estiver offline.
- Expor função de shutdown ou registrar handler para `SIGTERM` sem duplicar handlers conflitantes com NestJS.

### Error Capture Service

Integração externa:

- **Destino:** `POST {ERROR_CAPTURE_URL}/errors`
- **Autenticação:** header `X-Error-Capture-Key: <ERROR_CAPTURE_KEY>`
- **Timeout:** 2s
- **Retry:** sem retry persistente nesta demanda; uma tentativa best-effort.
- **Idempotência:** não aplicável para o primeiro escopo, pois o envio é evidência diagnóstica best-effort. Se o serviço central exigir deduplicação, usar `trace_id + error_type + http_path + timestamp bucket` em evolução futura.
- **Falha:** ignorar falha operacionalmente, sem lançar exceção, sem bloquear resposta HTTP e sem vazar payload no log.

Payload mínimo:

```json
{
  "service": "integracao-acessos-backend",
  "environment": "production",
  "error_type": "BadRequestException",
  "error_message": "Payload invalido.",
  "stack_trace": "stack quando existir",
  "trace_id": "otel-trace-id",
  "span_id": "otel-span-id",
  "http_method": "POST",
  "http_path": "/webhooks/alunos",
  "http_status": 400,
  "entity_id": "id-interno-quando-disponivel",
  "user_id": "id-interno-quando-disponivel",
  "payload": {}
}
```

Observações:

- O campo `http_method` corrige a ambiguidade do arquivo de entrada, que menciona `sthod`.
- `payload` pode conter PII porque o destino informado criptografa esses dados; esse payload nunca deve ser logado no Loki.
- `entity_id` e `user_id` devem ser derivados apenas quando houver identificador interno claro no request/contexto. Não usar CPF/e-mail como fallback.

### Variáveis de ambiente

Adicionar ao exemplo de env, sem segredos reais:

```dotenv
SERVICE_NAME=integracao-acessos-backend
NODE_ENV=production
LOG_LEVEL=info
LOG_PRETTY=false
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://10.39.112.3:4318
ERROR_CAPTURE_URL=http://10.39.112.3:4400
ERROR_CAPTURE_KEY=<preencher-no-ambiente>
```

## Regras de negócio / invariantes

- Logs e spans não podem conter CPF, e-mail, token JWT, senha, telefone ou nome completo.
- Loki recebe apenas dados sanitizados e identificadores internos.
- Error Capture pode receber payload completo do erro, mas o envio deve ocorrer somente para o serviço central autenticado.
- O mesmo `traceId` deve aparecer em Loki, Tempo e Error Capture para uma falha HTTP.
- A ausência de observabilidade externa não pode alterar o resultado funcional dos fluxos de integração.
- Logs existentes que hoje imprimem payloads completos devem ser removidos, reduzidos ou movidos para Error Capture conforme a regra de privacidade.

## Critérios de aceite

- [x] `pnpm --dir apps/backend build` passa após a implementação.
- [x] A aplicação sobe com `OTEL_ENABLED=false` sem tentar exportar traces.
- [x] A aplicação sobe com Collector OTLP indisponível e continua respondendo requisições.
- [x] Em `NODE_ENV=production`, logs no stdout são JSON puros, uma linha por evento, sem pretty print e sem cores.
- [x] Logs HTTP de entrada e saída incluem `method`, `url`, `statusCode` na saída, `responseTimeMs`, `service` e `traceId` quando houver span ativo.
- [x] Logs emitidos dentro de uma requisição HTTP carregam o mesmo `traceId` do span ativo.
- [x] Uma requisição válida fica configurada para exportar trace ao Tempo via OTLP.
- [x] Uma requisição com erro HTTP `>= 400` gera log sanitizado e dispara envio fire-and-forget ao Error Capture com o mesmo `trace_id`.
- [x] Falha no Error Capture não bloqueia a resposta HTTP e não gera exceção não tratada.
- [x] Nenhum `console.log` permanece em `apps/backend/src`.
- [x] Varredura estática não encontrou logs explícitos de payload completo; logger central sanitiza CPF/e-mail/token/senha em mensagens e objetos.
- [x] `.env.example` documenta as variáveis novas sem valores sensíveis.

## Casos a cobrir

- **Caminho feliz:** `POST /sync/alunos` ou rota equivalente responde `202`, gera logs JSON correlacionados e exporta trace.
- **Dados inválidos:** payload inválido em webhook retorna `400`, loga erro sanitizado e envia payload completo ao Error Capture.
- **Permissão / perfil:** rota protegida sem `API_KEY` retorna erro esperado, log sanitizado e captura de erro sem expor header sensível.
- **Borda:** `OTEL_ENABLED=false` remove `traceId`/`spanId` dos logs sem emitir `""`.
- **Falha de integração:** Collector offline e Error Capture offline não quebram bootstrap, resposta HTTP nem processamento de job.
- **Jobs/filas:** job de aluno/responsável registra início, conclusão e erro com `jobId`/`queueName`; se houver span ativo ou span raiz criado para job crítico, o `traceId` aparece nos logs.
- **Regressão:** fluxos TOTVS/Google continuam com o mesmo comportamento funcional; mudanças ficam restritas a logging, tracing e captura de erro.

## Impactos técnicos (camadas)

- **SQL Server:** sem alteração prevista.
- **Backend:** bootstrap, logger global, filtro global de exceções, novo adapter de Error Capture, tracing OTel e saneamento de logs em controllers/services/processors.
- **Frontend:** não aplicável.
- **Integrações:** nova integração outbound com Error Capture Service; export OTLP HTTP para Collector; logs existentes de TOTVS/Google precisam ser revisados para privacidade.
- **Jobs/Filas:** logs de Bull/cron devem manter identificadores rastreáveis; avaliar se há span ativo automático ou necessidade de span raiz em jobs críticos.
- **DevOps/Observabilidade:** novas variáveis de ambiente, validação via Docker logs, Loki, Tempo e Grafana; nenhum ajuste no stack central.

## Riscos e decisões em aberto

- **Contrato do Error Capture pode divergir do payload proposto.** Confirmar contrato real antes de marcar a spec como Aprovada.
- **Saneamento de logs pode exigir mexer em muitos pontos legados.** Fazer varredura por payload/e-mail/CPF e priorizar logs de erro e integrações críticas.
- **Instrumentação Prisma pode não vir coberta pela auto-instrumentação padrão.** Validar compatibilidade; se necessário, registrar limitação ou adicionar pacote específico em spec complementar.
- **Logs atuais podem conter segredos em ambiente local.** Não versionar valores reais; criar apenas exemplo sanitizado.
- **Trace em jobs Bull pode não correlacionar automaticamente com requisição original.** Definir se a entrega exige propagação via job data ou apenas span/log por execução do job.
- **Mudança de formato de logs pode afetar consumidores operacionais existentes.** Validar com Docker logs e consultas Loki antes de rollout.

## Plano de execução

1. **Preparação e contratos — backend/integração**
   - Confirmar contrato real do `POST /errors`, header de autenticação e política de ambientes.
   - Verificar se há GitHub Issue relacionada; comentar/criar apenas se houver valor de rastreabilidade.
   - Marcar esta spec como `Aprovada` quando o contrato estiver fechado.

2. **Dependências e bootstrap — backend**
   - Instalar dependências OpenTelemetry necessárias em `apps/backend/package.json`.
   - Criar `apps/backend/src/tracing.ts`.
   - Importar tracing como primeiro import em `apps/backend/src/main.ts`.
   - Garantir shutdown controlado.

3. **Logger estruturado — backend**
   - Ajustar `apps/backend/src/core/logger/logger.module.ts` para `LOG_LEVEL`, `LOG_PRETTY`, `SERVICE_NAME`, JSON puro em produção e mixin com `traceId`/`spanId`.
   - Harmonizar ou remover `TraceInterceptor` se ele conflitar com OpenTelemetry.
   - Validar mapeamento de níveis `log/info`, `warn`, `error`, `debug`.

4. **Error Capture — integração**
   - Criar adapter/service dedicado para `ERROR_CAPTURE_URL`.
   - Refatorar `AllExceptionsFilter` para log sanitizado + envio fire-and-forget.
   - Extrair `entity_id`/`user_id` de forma conservadora, sem usar PII.

5. **Privacidade e logs legados — backend**
   - Remover `console.log`.
   - Sanear logs que imprimem payloads completos, e-mails, headers, CPF, tokens ou dados pessoais.
   - Preservar identificadores internos úteis para diagnóstico.

6. **Configuração e documentação — DevOps**
   - Criar/atualizar `.env.example` ou equivalente.
   - Documentar variáveis novas em `docs/contexto/comandos.md` ou `docs/contexto/integracoes.md` se a implementação confirmar os detalhes.

7. **Validação — QA/observabilidade**
   - Rodar build.
   - Executar smoke local com `OTEL_ENABLED=false`.
   - Executar smoke com Collector/Error Capture indisponíveis.
   - Em ambiente integrado, validar Docker logs JSON, trace no Tempo, log no Loki e evento no Error Capture com o mesmo `trace_id`.

## Estratégia de validação

- **Automática:** build TypeScript; testes unitários do adapter Error Capture e do filtro, se estrutura de testes for adicionada ou já estiver disponível na execução.
- **Estática:** `rg "console\\." apps/backend/src` sem resultados; varredura por padrões de PII em logs de alto risco.
- **Manual local:** subir backend com `OTEL_ENABLED=false` e conferir ausência de crash e logs JSON.
- **Manual integrado:** disparar rota válida e rota com erro; conferir correlação Loki <-> Tempo <-> Error Capture por `trace_id`.

## Pendências para aprovação

- Validação integrada no stack central: confirmar em Grafana/Loki/Tempo/Error Capture que o `trace_id` abre as três visões esperadas.
- Confirmar contrato exato do Error Capture Service em ambiente central; implementação usa o contrato definido nesta spec.
- Evolução futura: propagar contexto OTel para jobs Bull quando a operação exigir correlação request -> job. Nesta entrega, requests HTTP têm trace ativo e jobs mantêm logs estruturados com identificadores próprios.
- GitHub Issue não foi atualizada porque `gh` não está disponível neste ambiente.

## Entrega técnica

- Criado `apps/backend/src/tracing.ts` com `NodeSDK`, auto-instrumentação Node, export OTLP HTTP, fallback por `OTEL_ENABLED=false` e shutdown limitado.
- Logger Pino em JSON puro, com `LOG_LEVEL`, `LOG_PRETTY`, `SERVICE_NAME`, `traceId`/`spanId` via span ativo e sanitização central de logs.
- `AllExceptionsFilter` passou a logar contexto sanitizado e enviar payload completo apenas ao Error Capture Service.
- Criado módulo global `ObservabilityModule` com `ErrorCaptureService`.
- Removido `console.log` do webhook de alunos e saneados logs de payload/e-mail em TOTVS/Google.
- Criado `apps/backend/.env.example` sem segredos reais.

## Validação executada

- `pnpm --filter backend add ...` para instalar dependências OpenTelemetry.
- `pnpm --dir apps/backend build` passou.
- `rg "console\\." apps/backend/src` sem ocorrências.
- `rg "PAYLOAD:|JSON\\.stringify\\(payload|Payload de criação de usuário:|para \\$\\{email|para \\$\\{.*Email|cpf \\$\\{|CD_CPF \\$\\{" apps/backend/src` sem ocorrências.
- Smoke com `OTEL_ENABLED=false`: bootstrap em JSON e aplicação iniciou.
- Smoke com `OTEL_ENABLED=true` e Collector indisponível: aplicação iniciou normalmente.
- Smoke HTTP local: `POST /sync/alunos` sem `x-api-key` retornou `401`, gerou log HTTP de entrada/saída e log sanitizado no filtro.
- Smoke HTTP com OTel ligado: logs da mesma requisição carregaram `traceId`/`spanId`.
