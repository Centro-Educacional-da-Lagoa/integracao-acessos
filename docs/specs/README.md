# Specs — especificação executável por demanda

Esta pasta guarda a **especificação de cada demanda não-trivial**: o artefato claro, revisável e rastreável sobre o qual a IA executa. É a materialização do **Spec-Driven Development** — a IA não trabalha bem sobre instruções vagas; trabalha sobre uma spec.

> Separação de papéis:
> - **`docs/specs/`** = *o que construir* nesta demanda (objetivo, contratos, critérios de aceite, casos). Uma spec por demanda, com ciclo de vida.
> - **`docs/contexto/`** = *estado e entendimento do projeto* (visão, arquitetura, regras, glossário, handoff). Estável e evolutivo.
>
> A spec **referencia** o contexto (regras, glossário, integrações); não o duplica.

## Quando criar uma spec

- **Demanda não-trivial** (nova funcionalidade, integração externa, rotina agendada, refatoração ampla, mudança que toca mais de uma camada): **escreva a spec antes de implementar**.
- **Trivial** (1 arquivo, sem impacto em contrato/dados/integração/regra): dispensa spec.
- Na dúvida, escreva. Uma spec curta custa pouco e torna a execução previsível.

## Ciclo de vida

O campo **Status** no topo do arquivo controla o estado:

1. **Rascunho** — em escrita/alinhamento. Use `grill-contexto` para afiar terminologia e fechar ambiguidade.
2. **Aprovada** — entendimento fechado, critérios de aceite definidos; pronta para o arquiteto/execução (atende a *Definição de Preparado*).
3. **Em execução** — implementação em andamento sobre a spec.
4. **Entregue** — critérios de aceite satisfeitos e validados; handoff feito.

## Como se encaixa no fluxo

1. Classifique a demanda no playbook (`nova-funcionalidade`, `integracao-externa`, `rotina-agendada`, …).
2. **Escreva/atualize a spec** a partir de `_template.md` (skill `spec-demanda`). Demanda ambígua → `grill-contexto` antes de aprovar.
3. Spec **Aprovada** → desenho (`arquiteto-solucao`) e execução pelos especialistas, **sobre a spec**.
4. Decomposição para trabalho paralelo segue `padroes-orquestracao` (fronteiras de ownership, isolamento, ordem de integração).
5. Validação confere a entrega **contra os critérios de aceite** da spec.
6. Handoff: marque a spec como **Entregue**; decisão cara de reverter vira ADR em `docs/contexto/decisoes/`; mudança estrutural reflete no arquivo de contexto certo.

## Nomeação

`AAAA-NN-<slug>.md` — ano, sequência no ano, descrição em kebab-case.
Ex.: `2026-01-importacao-nf.md`, `2026-02-webhook-pagamentos.md`.

## Índice

| Spec | Status | Demanda |
|---|---|---|
| `2026-01-guardas-provisionamento-totvs.md` | Entregue | Guardas contra provisionamento TOTVS com dados mestre ausentes |
| `2026-02-alocacoes-ativas-regular-extra.md` | Entregue | Alocações ativas reais para regular/extra e webhook coligada 6 |
