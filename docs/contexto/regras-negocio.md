# Regras de Negócio

> Regras do domínio que o código deve respeitar. Fonte de verdade para decisões funcionais.

## Regras centrais
- **[RN-01]** — [descrição, condições, exceções]
- **[RN-02]** — [...]
- **Acesso filial por matrícula ativa** — `SUSUARIOFILIAL` deve refletir o conjunto de coligadas/filiais em que a pessoa possui matrícula ativa real, seja regular ou extra. Coligada 6 gera acesso e perfil na própria coligada 6; não deve ser remapeada para 5 para provisionamento.

## Invariantes (nunca podem ser violadas)
- [...]

## Cálculos / totalizadores sensíveis
- [o que é, como é calculado, onde mora] — *atenção redobrada ao alterar SQL que afeta isto.*

## Perfis / permissões
- **[perfil]** — [o que pode / não pode]
- Perfis de aluno/responsável acompanham a coligada real da matrícula ativa retornada em `JS_Alocacoes_Ativas`.
