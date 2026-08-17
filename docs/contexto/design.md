# Design / Sistema Visual

> Ponte para o sistema de design. Só relevante se o projeto tem **frontend** e usa a skill **`impeccable`**. Se não usa, deixe explícito e ignore.

**Usa a skill `impeccable`?** [ sim | não ]

## Onde mora o sistema de design (fonte da verdade)
O design **não é duplicado aqui** — vive nos artefatos da `impeccable`, na **raiz do projeto**:
- **`PRODUCT.md`** — produto, público, registro (`brand` vs `product`), tom.
- **`DESIGN.md`** — sistema visual: tokens (cor OKLCH, tipografia, espaçamento), componentes, motion.

Mantidos pela própria skill. Qualquer IA (Claude ou Codex) que for mexer em UI deve **ler `PRODUCT.md`/`DESIGN.md`** antes de projetar, e respeitar o que está lá.

## Divisão de responsabilidade
- **`impeccable`** (sob demanda explícita): craft de design — `craft`, `critique`, `audit`, `polish`, etc.
- **`frontend-nextjs`**: integra o design na arquitetura real (Next + Tailwind + PrimeReact/shadcn) e nos contratos do backend.

## Convenções locais
- **UX copy em Português do Brasil** (as regras de copy da impeccable são agnósticas de idioma).
- Em telas administrativas pesadas de PrimeReact, prevalece o register `product` + "use o que já existe".

## Como gerar/atualizar
- `$impeccable init` — cria `PRODUCT.md`/`DESIGN.md` num projeto novo.
- `$impeccable document` — gera `DESIGN.md` a partir do código existente.

## Pré-requisito
A skill precisa estar disponível no projeto (`.agents/skills/impeccable/`) — ela **não** vem no bundle `.claude`/`.codex`/`docs`; instale-a/torne-a disponível separadamente.
