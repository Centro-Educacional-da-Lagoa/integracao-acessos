# Arquitetura e Estrutura do Projeto: Integração de Acessos

## 1. Visão Geral do Projeto

O sistema tem como objetivo principal gerenciar e integrar acessos de usuários (funcionários, alunos, etc.) entre diferentes plataformas.
Inicialmente, a integração englobará **duas vertentes principais**:

1. **Google Workspace:** Criação e suspensão de e-mails.
2. **TOTVS:** Além de ser a fonte oficial das regras (tabelas e views de RH/Alunos), o sistema também realizará ações de provisionamento ativo na própria TOTVS (criação/suspensão de usuários de sistema, concessão de perfis e acessos).

A arquitetura deve ser extensível para receber novas integrações no futuro.

- **Frontend:** Não contemplado no escopo inicial, mas estruturalmente previsto.
- **Backend:** API robusta responsável por rodar rotinas de sincronização, consultar bases, aplicar regras de negócio e refletir os dados nas plataformas (Google e a própria TOTVS).

## 2. Tecnologias e Ferramentas

- **Gerenciador de Pacotes e Workspace:** PNPM + Turborepo (Monorepo).
- **Backend:** NestJS (Node.js).
- **Banco de Dados:** SQL Server (com Prisma ORM).
- **Observabilidade e Logs:** `nestjs-pino` (Geração de logs estruturados em JSON para envio futuro a Grafana Loki, Seq ou Datadog).

## 3. Padrão Arquitetural

O backend adotará uma arquitetura **Modular** focada na separação de integrações. Cada plataforma externa (TOTVS, Google) viverá em seu próprio módulo, garantindo que as lógicas e contratos (DTOs) não se misturem.

### 3.1. Estrutura de Diretórios (Backend)

```text
apps/backend/
├── prisma/
│   ├── schema.prisma         # Definição do banco SQL Server
│   └── migrations/           # Histórico de alterações do banco
├── src/
│   ├── common/               # Recursos compartilhados
│   │   ├── utils/            # Utilitários gerais
│   │   ├── filters/          # Tratamento global de exceções
│   │   └── interceptors/     # Interceptadores (ex: injeção de Trace ID nos logs)
│   ├── config/               # Configurações de ambiente (.env)
│   ├── core/                 # Lógica core de observabilidade e banco
│   │   ├── prisma/           # Prisma Service
│   │   └── logger/           # Configuração do nestjs-pino
│   ├── modules/              # 🔗 Módulos de Integração e Negócio
│   │   ├── integrations/     # Adaptadores para sistemas externos
│   │   │   ├── totvs/        # Módulo isolado de comunicação/consulta com a TOTVS
│   │   │   └── google/       # Módulo isolado de comunicação com Google Workspace API
│   │   └── sync/             # Orquestrador das regras de negócio
│   │       ├── sync.module.ts
│   │       ├── sync.service.ts # Ex: Busca na TOTVS e envia comando pro módulo do Google
│   │       └── sync.cron.ts  # Rotinas agendadas (Jobs) para disparar a sincronização
│   ├── app.module.ts
│   └── main.ts
```

## 4. Fluxo de Execução Principal

Como o sistema atuará inicialmente lendo a TOTVS, o fluxo de dados principal seguirá o padrão de **Polling / Cron Jobs (Rotinas Agendadas)**:

1. **Gatilho Temporal (Cron Task):** O sistema dispara uma rotina a cada X minutos/horas.
2. **Coleta de Dados (TOTVS Module):** O backend realiza uma query ou consome uma API/View da TOTVS para buscar novos colaboradores ou demissões/cancelamentos.
3. **Processamento (Sync Module):** A lógica de negócio identifica o que precisa ser feito (Criar e-mail? Suspender e-mail? Conceder perfil na TOTVS? Suspender usuário TOTVS?).
4. **Execução (Módulos de Integração):** O módulo respectivo é acionado para executar a ação:
   - Acionar o `GoogleModule` para rotinas de e-mail no Workspace.
   - Acionar o `TotvsModule` para executar rotinas/APIs de concessão de acessos, criação ou suspensão de usuários na TOTVS.
5. **Registro (Database & Logs):** Os resultados, eventuais falhas e sucessos são persistidos no SQL Server e logados via Pino.

> 💡 **Extensibilidade (Webhooks):** A arquitetura modular permite que, no futuro, caso a TOTVS consiga disparar eventos em tempo real, basta criar um `totvs.controller.ts` para receber a requisição POST (Webhook) e reaproveitar todo o fluxo de processamento e execução sem alterar o core do sistema.

## 5. Estratégia de Logs (Observabilidade)

A monitoria será peça fundamental para auditar a criação e bloqueio de acessos. O uso do pacote `nestjs-pino` garantirá que os logs tenham um formato compatível com **Loki/Seq**.

**Informações Obrigatórias nos Logs estruturados:**

- `traceId` / `correlationId`: Para rastrear toda a jornada de um evento específico desde o início do cron até o sucesso no Google.
- `module`: Identificar a origem do log (`totvs-integration`, `google-api`, `sync-job`).
- `action`: Tipo de operação (`CREATE_EMAIL`, `SUSPEND_USER`, `FETCH_TOTVS`).
- `status`: Sucesso ou Falha.
- `metadata`: Dados de contexto como `documento` (CPF), `matriculaTotvs`, ou motivos de erro detalhados.

**Exemplo fictício de log gerado:**

```json
{
  "level": "info",
  "time": 1708812000000,
  "traceId": "req-1a2b3c4d",
  "module": "sync-service",
  "action": "CREATE_EMAIL",
  "status": "SUCCESS",
  "metadata": {
    "matricula": "12345",
    "emailCriado": "joao.silva@escola.edu.br"
  },
  "msg": "E-mail criado com sucesso no Google Workspace"
}
```
