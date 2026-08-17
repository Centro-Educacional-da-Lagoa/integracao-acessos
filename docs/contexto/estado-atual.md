# Estado Atual

> Snapshot do trabalho em andamento. **Atualize ao final de cada sessão.** É a primeira coisa que qualquer IA lê ao começar.

**Última atualização:** 2026-08-17 por Codex

## Foco atual
Alocações ativas regular/extra implementadas no backend e scripts SQL versionados para corrigir acesso filial/perfil em coligadas reais, incluindo extra na coligada 6.

## Em andamento
- [ ] Aplicar e validar em SQL Server/TOTVS as procedures alteradas com `JS_Alocacoes_Ativas`.
- [ ] Reprocessar caso com regular cancelado e extra ativo para confirmar criação real de `SUSUARIOFILIAL` na filial/coligada do extra.
- [ ] Reprocessar webhook vindo da coligada 6 para confirmar resolução RA 6 → `CODPESSOA` → RA 5 quando necessário.

## Próximos passos (ordem sugerida)
1. Publicar em homologação as quatro procedures alteradas em `apps/docs/`.
2. Validar retorno de `JS_Alocacoes_Ativas` para aluno com regular em uma coligada/filial e extra em outra.
3. Confirmar responsável financeiro com filhos em filiais/coligadas diferentes recebendo todas as alocações ativas.
4. Validar se o alias de procedure 6→5 ainda é necessário após evolução das procedures para consulta direta por `CD_Pessoa`.

## Bloqueios / decisões pendentes
- Sem acesso ao SQL Server/TOTVS nesta sessão; validação SQL foi feita por revisão estática e build do backend.

## Pendências conhecidas / dívida técnica
- Contexto do projeto ainda contém vários templates não preenchidos.
- O fluxo de provisionamento marca conclusão mesmo quando `SUSUARIOFILIAL` falha; isso dificulta reprocessamento operacional.
- Procedures ainda mantêm compatibilidade com chamada por RA; evolução ideal é aceitarem `CD_Pessoa` como filtro primário.

## Notas de handoff
Implementado contrato `JS_Alocacoes_Ativas`, parser seguro no backend, uso de alocações reais para `SUSUARIOFILIAL` e perfis, remoção do alias 6→5 no provisionamento e resolução de webhook coligada 6 por identidade (`RA 6 -> CODPESSOA -> RA 5`). Build passou com `pnpm --dir apps/backend build`.
