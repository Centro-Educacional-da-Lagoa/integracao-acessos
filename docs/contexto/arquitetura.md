# Arquitetura

## Stack real (preencher só o que existe)
- **Backend:** [Node.js, NestJS, TypeScript, ...]
- **Frontend:** [Next.js, Tailwind, PrimeReact, shadcn/ui, ...]  *(só se houver)*
- **Banco:** [SQL Server] · **Acesso a dados:** [Prisma | Query Builder | SQL nativo]
- **Filas/Cache:** [Bull/BullMQ, Redis] · **Container/Plataforma:** [Docker, CapRover]
- **Auth:** [...] · **Observabilidade:** [...]

## Fronteiras e camadas
[Como o sistema se divide: módulos de domínio, camadas (controller → service → repositório), o que é síncrono vs assíncrono, onde ficam as integrações externas.]

## Padrões estruturais adotados
- [padrão] — [onde se aplica]

## Sistema de design (frontend)
Se o projeto tem frontend, o sistema de design vive em `PRODUCT.md`/`DESIGN.md` (skill `impeccable`) — ver `design.md`.

## Decisões arquiteturais
Decisões caras de reverter ficam em `decisoes/` (ADRs). Resumo das principais:
- [ADR-XXXX] [título] — [decisão em uma linha]
