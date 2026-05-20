# Plano de Testes via Webhook - Integração de Responsáveis

## Objetivo

Executar testes criando a situação no TOTVS a partir do aluno e dos vínculos do responsável, aguardando o processamento do webhook do aluno e validando o estado final no TOTVS.

## Regras Fechadas

- responsável usa CPF como login correto;
- integração de responsáveis não cria, reativa nem suspende Gmail institucional;
- filiação concede perfil acadêmico;
- responsável acadêmico concede perfil acadêmico;
- responsável financeiro concede perfil financeiro;
- responsável puro deve manter apenas as filiais permitidas pelo conjunto final de alocações;
- no webhook do aluno, a trilha de responsáveis roda em cancelamento e nova concessão.

## Observações do Core

- no TOTVS, `SUSUARIOFILIAL.ACESSO=1` corresponde a `Portal` e `SUSUARIOFILIAL.ACESSO=2` corresponde a `Sistema/PGE e Portal`;
- perfis de responsável mapeados no core:
  - coligada `1`: `RespAcad_CEL` e `RespFinanc_CEL` no sistema `S`;
  - coligada `5`: `RespAcad_LFB` e `RespFinanc_LFB` no sistema `S`;
  - coligada `6`: `RespAcad_LFB` e `RespFinanc_LFB` no sistema `S`;
- responsável puro entra em saneamento de filiais fora da alocação permitida;
- responsável também aluno preserva filiais de aluno no cancelamento;
- responsável também funcionário preserva o usuário e remove apenas perfis de responsável no cancelamento;
- responsável sem CPF é ignorado na concessão;
- responsável financeiro com correspondência fraca entre `CFO` e `PPESSOA` precisa de teste direcionado.

## Matriz Consolidada

| ID   | Situação | O que a integração faz | Tipos de acesso dados | Validar TOTVS após integração | Validar Google | Responsável | Teste Realizado |
| ---- | -------- | ---------------------- | --------------------- | ----------------------------- | -------------- | ----------- | --------------- |
| R-01 | Responsável puro por filiação, não é aluno nem funcionário | `Usuário TOTVS:` garante usuário correto pelo CPF. `Acessos:` garante usuário-filial, remove filiais excedentes e concede perfil acadêmico. | `Usuário-filial:` `Portal` nas filiais permitidas. `Perfis:` `RespAcad_CEL` na coligada `1` ou `RespAcad_LFB` na coligada `5`. | `PPESSOA.CODUSUARIO=CPF`; `GUSUARIO.STATUS=1`; `SUSUARIOFILIAL` apenas nas filiais permitidas; perfil acadêmico presente; sem perfil financeiro indevido. | Não aplicável. |  |  |
| R-02 | Responsável puro acadêmico, não é aluno nem funcionário | `Usuário TOTVS:` garante usuário correto pelo CPF. `Acessos:` garante usuário-filial e concede perfil acadêmico. | `Usuário-filial:` `Portal`. `Perfis:` perfil acadêmico da coligada. | Usuário ativo; filiais corretas; apenas perfil acadêmico presente. | Não aplicável. |  |  |
| R-03 | Responsável puro financeiro, não é aluno nem funcionário | `Usuário TOTVS:` garante usuário correto pelo CPF. `Acessos:` garante usuário-filial e concede perfil financeiro. | `Usuário-filial:` `Portal`. `Perfis:` `RespFinanc_CEL` ou `RespFinanc_LFB`. | Usuário ativo; filiais corretas; apenas perfil financeiro presente. | Não aplicável. |  |  |
| R-04 | Mesmo responsável com vínculo acadêmico e financeiro | `Usuário TOTVS:` consolida o responsável em um único usuário. `Acessos:` garante filiais finais e concede os dois perfis esperados. | `Usuário-filial:` `Portal`. `Perfis:` acadêmico + financeiro na coligada. | Usuário único por CPF; filiais corretas; os dois perfis presentes sem duplicidade. | Não aplicável. |  |  |
| R-05 | Mesmo responsável com filiação e acadêmico ao mesmo tempo | `Consolidação:` ambos os vínculos resultam em perfil acadêmico. `Acessos:` não deve duplicar perfil. | `Usuário-filial:` `Portal`. `Perfis:` somente acadêmico. | Usuário ativo; filiais corretas; um único perfil acadêmico da coligada. | Não aplicável. |  |  |
| R-06 | Responsável de múltiplos alunos e múltiplas filiais na mesma coligada | `Consolidação:` agrupa vínculos do mesmo CPF. `Acessos:` revoga filiais fora da alocação permitida e garante todas as filiais finais do conjunto. | `Usuário-filial:` `Portal` em todas as filiais válidas. `Perfis:` conforme os vínculos consolidados. | `SUSUARIOFILIAL` somente nas filiais do conjunto final; nenhuma filial excedente; perfis coerentes com os vínculos. | Não aplicável. |  |  |
| R-07 | Responsável da coligada 5 com aluno em extra ativo refletido para a 6 | `Consolidação:` marca extra ativo da coligada `5`. `Acessos:` projeta alocação adicional para `6:1` e concede perfis também na `6` quando aplicável. | `Usuário-filial:` `Portal` na coligada `5` e na `6:1` quando a regra se aplicar. `Perfis:` acadêmico/financeiro em `5` e `6` conforme vínculo. | Filiais e perfis presentes em `5`; reflexo em `6` quando aplicável; sem perda do contexto principal da `5`. | Não aplicável. |  |  |
| R-08 | Responsável também é aluno ativo | `Usuário TOTVS:` mantém o usuário pelo CPF. `Acessos:` pode agregar alocações do papel de aluno. `Perfis:` concede perfis de responsável sem perder os do aluno. | `Usuário-filial:` `Portal` nas filiais de responsável e/ou aluno consolidadas. `Perfis:` responsável + aluno. | Usuário ativo; filiais consolidadas corretas; perfis de responsável e de aluno presentes conforme a regra. | Não aplicável. |  |  |
| R-09 | Responsável também é funcionário | `Usuário TOTVS:` mantém o usuário pelo CPF. `Acessos:` deve preservar acesso funcional. `Perfis:` concede os perfis de responsável além dos já existentes do funcionário. | `Usuário-filial:` tendência de `Sistema/PGE e Portal`; validar a manutenção do acesso funcional. `Perfis:` responsável + perfis funcionais já existentes. | Usuário ativo; acesso funcional preservado; perfis de responsável presentes; sem remoção indevida de acessos funcionais. | Não aplicável. |  |  |
| R-10 | Responsável sem CPF | `Resultado:` processor ignora a concessão. | Nenhum novo acesso deve ser concedido. | Não deve haver criação de usuário, vínculo, `SUSUARIOFILIAL` ou perfis por esse fluxo. | Não aplicável. |  |  |
| R-11 | Responsável financeiro com CPF no CFO, mas sem correspondência consistente em `PPESSOA` | `Usuário TOTVS:` tenta resolver o responsável por CPF. `Risco:` pode falhar na vinculação à pessoa se o cadastro estiver inconsistente. | Não deve haver concessão parcial silenciosa. | Validar se houve falha rastreável em log e ausência de criação parcial indevida em usuário, vínculo, filiais ou perfis. | Não aplicável. |  |  |
| R-12 | Cancelamento de responsável puro, sem papel de aluno nem funcionário | `Usuário-filial:` revoga todos os acessos ativos. `Perfis:` remove perfis de responsável. `Usuário TOTVS:` inativa o usuário. | Remove acessos `Portal` ativos do responsável. Remove perfis de responsável. | `GUSUARIO.STATUS=0`; ausência de `SUSUARIOFILIAL` ativo para o usuário; perfis de responsável removidos. | Não aplicável. |  |  |
| R-13 | Cancelamento de responsável que continua como aluno ativo | `Usuário TOTVS:` preserva o usuário. `Usuário-filial:` recalcula e mantém apenas as filiais de aluno. `Perfis:` remove só os de responsável. | `Usuário-filial:` `Portal` somente nas filiais de aluno. `Perfis:` remove perfis de responsável e preserva os de aluno. | Usuário ativo; filiais ligadas ao aluno preservadas; perfis de responsável removidos; perfis de aluno preservados. | Não aplicável. |  |  |
| R-14 | Cancelamento de responsável que continua como funcionário | `Usuário TOTVS:` preserva o usuário. `Acessos:` preserva o acesso funcional. `Perfis:` remove só os de responsável. | `Usuário-filial:` `Sistema/PGE e Portal` preservado quando já funcional. `Perfis:` remove perfis de responsável. | Usuário ativo; acesso funcional preservado; perfis de responsável removidos; sem inativação indevida. | Não aplicável. |  |  |
| R-15 | Cancelamento de responsável com usuário já inativo | `Usuário TOTVS:` não inativa de novo. `Acessos:` limpa filiais e perfis quando a regra pedir. | Revogação de acessos remanescentes. | Usuário continua inativo; filiais indevidas removidas; perfis de responsável removidos. | Não aplicável. |  |  |
| R-16 | Webhook de um aluno aciona responsável que possui outros vínculos ativos no período | `Consolidação:` o processor agrupa todos os vínculos relevantes do responsável. `Resultado:` não deve cancelar acesso ainda sustentado por outro aluno/vínculo ativo. | `Usuário-filial:` conjunto final consolidado. `Perfis:` conjunto final consolidado. | Usuário final coerente com todos os vínculos ativos do responsável no período; sem remoção indevida por olhar só o aluno do disparo. | Não aplicável. |  |  |
| R-17 | Webhook repetido para o mesmo responsável com estado já correto | `Resultado:` deve ser idempotente. | Mantém acessos finais já corretos. | Sem duplicidade de `SUSUARIOFILIAL`; sem duplicidade de perfis; sem troca indevida de usuário. | Não aplicável. |  |  |
