# Contexto do Projeto (compartilhado entre IAs)

Esta pasta é a **fonte da verdade de contexto** deste projeto, compartilhada por qualquer assistente de IA (Codex, Claude, ou outro). O objetivo é poder **alternar de IA sem perder o entendimento do projeto**: cada uma lê esta pasta ao começar e a atualiza ao terminar.

> Localização padrão no projeto: `docs/contexto/`. É neutra — não pertence a `.claude/` nem a `.codex/`. Ambos apontam para cá.

> **Contexto vs. spec:** esta pasta guarda o *estado e entendimento do projeto* (estável/evolutivo). A *especificação de cada demanda* (o que construir agora: contratos, critérios de aceite, casos) vive em `docs/specs/` (ver `docs/specs/README.md`). A spec referencia o contexto; não o duplica. Decisão cara de reverter tomada durante uma spec vira ADR aqui em `decisoes/`.

## Protocolo de uso (toda IA segue isto)

**No início de uma sessão/demanda:**
1. Leia `estado-atual.md` — onde o trabalho parou, foco, pendências.
2. Leia os arquivos de contexto relevantes à demanda (veja o índice abaixo).
3. Não confie só na sua memória de conversas anteriores; esta pasta é a verdade.

**Durante o trabalho:**
- Tomou uma decisão técnica que é cara de reverter? Registre um ADR em `decisoes/` (use `0000-template.md`).
- Mudou algo estrutural (módulo, integração, comando, regra)? Atualize o arquivo correspondente.

**Ao final da sessão/demanda (handoff):**
1. Atualize `estado-atual.md` (foco, em andamento, próximos passos, bloqueios) — sempre com a data e qual IA atualizou.
2. Adicione uma entrada no topo de `diario.md` (o que foi feito, decisões, arquivos tocados).
3. Se documentou algo novo, reflita no arquivo de contexto certo.

## Regras de manutenção
- **Conciso e factual.** Esta pasta é contexto operacional, não prosa. Frases curtas, listas.
- **Datas absolutas** (`AAAA-MM-DD`), nunca "ontem"/"semana passada".
- **Sem segredos** (tokens, senhas, connection strings). Use referências, não valores.
- **Português do Brasil.** Termos técnicos podem ficar em inglês.
- Atualize em vez de duplicar. Se um fato mudou, corrija onde ele mora.

## Índice
| Arquivo | O que guarda | Frequência de mudança |
|---|---|---|
| `estado-atual.md` | Snapshot do agora: foco, em andamento, próximos passos, bloqueios | A cada sessão |
| `diario.md` | Histórico append-only de sessões/handoffs | A cada sessão |
| `visao-geral.md` | O que é o sistema, domínios, módulos, fluxos críticos | Raramente |
| `arquitetura.md` | Stack real, fronteiras, padrões estruturais | Ocasional |
| `regras-negocio.md` | Regras centrais, invariantes, cálculos sensíveis | Ocasional |
| `integracoes.md` | Sistemas externos, contratos, autenticação, retry | Ocasional |
| `estrutura-repo.md` | Organização de pastas, onde fica o quê | Ocasional |
| `comandos.md` | Rodar, testar, build, deploy, migrations | Ocasional |
| `glossario.md` | Termos do domínio | Ocasional |
| `design.md` | Ponte para o sistema de design (`PRODUCT.md`/`DESIGN.md` da skill `impeccable`) — só com frontend | Ocasional |
| `decisoes/` | ADRs — decisões arquiteturais com contexto e consequências | Por decisão |

## Como instalar em um projeto novo
Copie esta pasta para `docs/contexto/` na raiz do projeto e preencha os campos `[...]`. Os ambientes de Codex e Claude já estão configurados para consultá-la e mantê-la.
