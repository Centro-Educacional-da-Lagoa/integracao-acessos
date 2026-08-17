# Arquitetura

## Stack real (preencher só o que existe)
- **Backend:** Node.js, NestJS, TypeScript.
- **Frontend:** não identificado neste repositório.
- **Banco:** SQL Server · **Acesso a dados:** Prisma e SQL nativo via procedures TOTVS.
- **Filas/Cache:** Bull, Redis · **Container/Plataforma:** Docker.
- **Auth:** `x-api-key` em rotas protegidas, com exceções por decorator `@Public()`.
- **Observabilidade:** `nestjs-pino`/Pino JSON em stdout, OpenTelemetry Node SDK via OTLP HTTP, Error Capture Service externo.

## Fronteiras e camadas
[Como o sistema se divide: módulos de domínio, camadas (controller → service → repositório), o que é síncrono vs assíncrono, onde ficam as integrações externas.]

## Padrões estruturais adotados
- [padrão] — [onde se aplica]

## Sistema de design (frontend)
Se o projeto tem frontend, o sistema de design vive em `PRODUCT.md`/`DESIGN.md` (skill `impeccable`) — ver `design.md`.

## Decisões arquiteturais
Decisões caras de reverter ficam em `decisoes/` (ADRs). Resumo das principais:
- [ADR-XXXX] [título] — [decisão em uma linha]
