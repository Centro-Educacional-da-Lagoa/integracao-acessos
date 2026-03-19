# Sistema de Filas com Bull e Redis

## Visão Geral

O sistema de sincronização de alunos foi refatorado para usar filas de jobs com **@nestjs/bull** e **Redis**, proporcionando:

- ✅ **Processamento assíncrono** - Jobs são processados em background
- ✅ **Retry automático** - Falhas são retentadas automaticamente com backoff exponencial
- ✅ **Escalabilidade** - Múltiplos workers podem processar jobs em paralelo
- ✅ **Resiliência** - Jobs não são perdidos se a aplicação reiniciar
- ✅ **Monitoramento** - Possibilidade de acompanhar o status dos jobs

## Arquitetura

### Componentes

1. **AlunoSyncCron** (`aluno-sync.cron.ts`)
   - Responsável por agendar a sincronização periódica
   - Adiciona jobs na fila ao invés de executar diretamente

2. **AlunoSyncService** (`aluno-sync.service.ts`)
   - Fornece API programática para adicionar jobs na fila
   - Usado pelo controller para disparos manuais via API

3. **AlunoSyncProcessor** (`aluno-sync.processor.ts`)
   - Processa os jobs enfileirados
   - Contém a lógica de negócio de sincronização

### Tipos de Jobs

#### 1. `sync-all-coligadas`

Sincroniza alunos de todas as coligadas configuradas.

**Payload:**

```typescript
{
  periodoLetivo: string
  coligadas: ColigadaConfig[]
}
```

#### 2. `sync-coligada`

Sincroniza alunos de uma coligada específica.

**Payload:**

```typescript
{
  periodoLetivo: string
  coligada: ColigadaConfig
}
```

#### 3. `sync-aluno`

Sincroniza um aluno específico.

**Payload:**

```typescript
{
  aluno: any
  coligada: ColigadaConfig
}
```

## Configuração

### Variáveis de Ambiente

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Sync Configuration
PERIODO_LETIVO=2026
```

### Instalação do Redis

#### Docker

```bash
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

#### Homebrew (macOS)

```bash
brew install redis
brew services start redis
```

#### APT (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
```

## Uso

### Via Cron

O cron está configurado para executar automaticamente (atualmente comentado):

```typescript
// Descomente para ativar execução à meia-noite
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async handleCron(): Promise<void>
```

### Via API

```bash
# Dispara sincronização manual
curl -X POST http://localhost:3000/sync/alunos
```

Resposta:

```json
{
  "message": "Sincronização de alunos iniciada."
}
```

### Via Código

```typescript
// Sincronizar todas as coligadas
await this.alunoSyncService.syncAlunosPorColigada()

// Sincronizar coligada específica
await this.alunoSyncService.syncColigada(periodoLetivo, coligada)

// Sincronizar aluno específico
await this.alunoSyncService.syncAluno(aluno, coligada)
```

## Configuração de Retry

Todos os jobs são configurados com:

- **attempts**: 3 tentativas
- **backoff**: Exponencial
  - `sync-all-coligadas` e `sync-coligada`: delay inicial de 5 segundos
  - `sync-aluno`: delay inicial de 2 segundos

Exemplo de backoff exponencial:

- 1ª tentativa: imediata
- 2ª tentativa: após 5 segundos
- 3ª tentativa: após 25 segundos (5 × 5)

## Monitoramento

### Bull Board (Recomendado)

Para monitorar as filas visualmente, instale o Bull Board:

```bash
pnpm add @bull-board/api @bull-board/express
```

Configure no `app.module.ts`:

```typescript
import { BullAdapter } from '@bull-board/api/bullAdapter'
import { ExpressAdapter } from '@bull-board/express'
import { createBullBoard } from '@bull-board/api'

// No AppModule
const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath('/admin/queues')

createBullBoard({
  queues: [new BullAdapter(alunoSyncQueue)],
  serverAdapter,
})

// No bootstrap (main.ts)
app.use('/admin/queues', serverAdapter.getRouter())
```

Acesse: `http://localhost:3000/admin/queues`

### Logs

Os logs são gerados com contexto detalhado:

```
[AlunoSyncCron] Cron de sync de alunos iniciado
[AlunoSyncCron] Job de sync adicionado à fila (ID: 1234)
[AlunoSyncProcessor] [Job 1234] Iniciando sync de alunos — período 2026, 2 coligada(s)
[AlunoSyncProcessor] [Coligada 5] Buscando alunos ativos...
[AlunoSyncProcessor] [Coligada 5] 150 aluno(s) encontrado(s)
[AlunoSyncProcessor] [Job 1234] Sync de alunos concluído
```

## Melhores Práticas

1. **Redis em produção**: Use Redis persistente com replicação
2. **Monitoramento**: Configure alertas para jobs falhados
3. **Timeout**: Configure timeout apropriado para jobs longos
4. **Concorrência**: Ajuste número de workers conforme necessário
5. **Cleanup**: Configure limpeza automática de jobs antigos

## Solução de Problemas

### Redis não conecta

```bash
# Verifique se Redis está rodando
redis-cli ping
# Deve responder: PONG

# Verifique logs
docker logs redis  # Se usando Docker
```

### Jobs não são processados

1. Verifique se o processor está registrado no módulo
2. Confirme que o nome da fila está correto
3. Verifique logs de erro do aplicativo

### Jobs falham repetidamente

1. Verifique logs detalhados do processor
2. Aumente o timeout se necessário
3. Revise configuração de retry

## Próximos Passos

- [ ] Implementar Bull Board para monitoramento visual
- [ ] Adicionar métricas (Prometheus/Grafana)
- [ ] Configurar cleanup automático de jobs completados
- [ ] Implementar priorização de jobs
- [ ] Adicionar rate limiting se necessário
