# Levantamento para Implementação da Integração de Acessos de Funcionários

## 1. Entendimento

Este levantamento consolida o que já existe no repositório para integrações de acesso, o que pode ser reaproveitado para funcionários e o que ainda precisa ser definido com negócio, TOTVS e operação antes de implementar a trilha funcional de ponta a ponta.

Objetivo funcional:

- automatizar concessão, ajuste e revogação de acessos de funcionários com TOTVS como fonte de verdade;
- reutilizar o core já existente de usuário, perfis e usuário-filial;
- evitar regressão nas trilhas já existentes de aluno e responsável.

Objetivo técnico:

- mapear fontes de consulta, regras de negócio, rotas, contratos, dependências, lacunas e riscos para uma implementação segura.

## 2. Premissas

- O projeto é backend-only e opera via API + Bull + Redis.
- TOTVS RM é a fonte de verdade para elegibilidade de acesso.
- O core de provisionamento já trata cenários multipapel (`ALUNO`, `FUNCIONARIO`, `RESPONSAVEL`).
- Hoje só existem fluxos operacionais completos para aluno e responsável.
- Não existe documentação versionada de procedure SQL de funcionário neste repositório.
- Não existe rota, fila, processor ou documentação funcional completa para funcionário neste estado atual.

## 3. Escopo

- levantamento de fontes internas e externas necessárias;
- levantamento de regras já inferíveis do código;
- levantamento das rotas atuais e proposta de rotas futuras;
- identificação de lacunas de contrato, dados, segurança, observabilidade e operação;
- plano de implementação recomendado.

## 4. Fora de Escopo

- implementação do fluxo de funcionários nesta etapa;
- alteração de procedure no banco TOTVS;
- definição final de regra de RH sem validação do negócio;
- configuração de credenciais ou deploy.

## 5. Estado Atual do Sistema

### 5.1 Módulos e fluxos existentes

- `SyncModule`: possui filas `aluno-sync` e `responsavel-sync`.
- `AccessProvisioningService`: centraliza criação/reativação/inativação de usuário, vínculo pessoa-usuário, usuário-filial e perfis.
- `TotvsService`: já expõe operações reutilizáveis de usuário, perfis e `EduUsuarioFilialData`.
- `GoogleService`: hoje é usado só na trilha de aluno.

### 5.2 Rotas operacionais existentes

- `POST /sync/alunos`
- `POST /sync/alunos/cancelamentos`
- `POST /sync/alunos/cancelamentos/aluno`
- `POST /webhooks/alunos`
- `POST /sync/responsaveis`
- `POST /sync/responsaveis/responsavel`
- `POST /sync/responsaveis/cancelamentos`
- `POST /sync/responsaveis/cancelamentos/responsavel`
- `GET /totvs/usuario/:codigo`
- rotas auxiliares Google existem no módulo, mas não fazem parte da trilha funcional de funcionários hoje.

### 5.3 Segurança atual

- Todas as rotas exigem `x-api-key`, exceto `POST /webhooks/alunos`.
- Não existe webhook público para funcionário.

### 5.4 Reuso já pronto para funcionário

- login correto por CPF quando `IN_Funcionario = 1`;
- `garantirUsuarioFilial` já diferencia acesso funcional com `acesso = '2'`;
- transferência e preservação de perfis em cenários de troca de login;
- preservação de múltiplos papéis ativos na mesma pessoa;
- revogação seletiva de perfis por tipo de entidade;
- deduplicação e retry no padrão Bull.

### 5.5 Lacunas evidentes no código

- `apps/backend/src/modules/integrations/totvs/dto/funcionario-totvs.dto.ts` é apenas um schema provisório e não representa o contrato real do RM.
- `TotvsService.fetchUsersToSync()` retorna `[]`.
- `TotvsService.grantProfileAccess()` está com `TODO`.
- Não existe `FuncionarioSyncService`, `FuncionarioSyncProcessor`, `FuncionarioSyncController` nem fila `funcionario-sync`.
- `PERFIS_ACESSO` não possui entradas `FUNCIONARIO`.
- `PessoaAcessoContext.TP_Origem_Revogacao` aceita só `ALUNO` e `RESPONSAVEL`; para cancelamento funcional precisará aceitar `FUNCIONARIO`.
- Não há documento versionado equivalente a:
  - `PR_MGA_Consulta_Funcionario_Ativacao_Acesso`
  - `PR_MGA_Consulta_Funcionario_Cancelamento_Acesso`
  caso essas procedures existam no desenho alvo.

## 6. Fontes de Consulta Necessárias

### 6.1 Fontes internas já disponíveis

- Contexto do projeto:
  - `.codex/project-context/visao-geral-projeto.md`
  - `.codex/project-context/regras-negocio.md`
  - `.codex/project-context/integracoes.md`
- Código:
  - `apps/backend/src/modules/sync/access-provisioning/access-provisioning.service.ts`
  - `apps/backend/src/modules/integrations/totvs/totvs.service.ts`
  - `apps/backend/src/modules/sync/aluno-sync.*`
  - `apps/backend/src/modules/sync/responsavel-sync.*`
- Documentação funcional já madura:
  - `apps/docs/mapeamento-integracao-alunos.md`
  - `apps/docs/mapeamento-integracao-responsaveis.md`
  - `apps/docs/plano-testes-totvs-sincronizacoes-alunos.md`
  - `apps/docs/plano-testes-totvs-sincronizacoes-responsaveis.md`

### 6.2 Fontes internas ausentes ou incompletas

- documento funcional da integração de funcionários;
- plano de testes de funcionários;
- SQL versionado da consulta de ativação de funcionário;
- SQL versionado da consulta de cancelamento de funcionário;
- mapeamento de perfis funcionais por coligada/sistema;
- contrato real do DTO de funcionário retornado pelo TOTVS.

### 6.3 Fontes externas que precisam ser levantadas

- RH/negócio:
  - quais vínculos funcionais são elegíveis;
  - o que significa ativo, afastado, desligado, transferido, licenciado;
  - quando conceder, reativar, reduzir ou revogar acesso;
  - política para multi-vínculo e multi-filial.
- TOTVS RM:
  - nome da procedure ou view oficial de ativação;
  - nome da procedure ou view oficial de cancelamento;
  - assinatura exata dos parâmetros;
  - dicionário de colunas retornadas;
  - regra de `CODFILIAL` e `CODCOLIGADA` para funcionário;
  - perfis funcionais esperados por sistema.
- Google Workspace:
  - funcionário terá e-mail institucional provisionado por este serviço ou não;
  - se sim, qual domínio, senha inicial, política de suspensão e reativação.
- Operação/Infra:
  - origem do disparo: manual, cron, webhook, integração externa ou híbrido;
  - volume esperado por lote;
  - SLA e janela operacional;
  - necessidade de reprocessamento unitário.

## 7. Regras de Negócio Já Inferíveis do Código

### 7.1 Regras certas ou muito fortes

- TOTVS prevalece como fonte de verdade.
- Funcionário usa CPF como login correto no usuário TOTVS.
- Quando `IN_Funcionario = 1`, o acesso de usuário-filial é funcional (`acesso = '2'`), diferente do acesso portal de aluno/responsável (`acesso = '1'`).
- Pessoa pode acumular papéis; a implementação não assume exclusividade entre aluno, funcionário e responsável.
- Se a pessoa já estiver vinculada ao usuário errado, o core:
  - cria ou reativa o usuário correto;
  - vincula à pessoa;
  - transfere perfis elegíveis;
  - inativa o usuário antigo.
- Perfis podem ser preservados entre papéis ativos, desde que estejam mapeados.

### 7.2 Regras que ainda dependem de confirmação

- funcionário recebe ou não Gmail institucional por este serviço;
- se recebe Gmail, qual evento gera criação, reativação ou suspensão;
- desligamento implica inativação total do usuário TOTVS ou apenas remoção de perfis funcionais quando existir outro papel ativo;
- como tratar afastamento/licença/férias;
- como tratar mudança de filial, centro de custo, unidade ou coligada;
- se existe diferença entre funcionário docente, administrativo, terceirizado e temporário.

## 8. Contrato de Dados Necessário para Funcionário

Para encaixar no `PessoaAcessoContext`, a leitura do TOTVS de funcionário precisa fornecer no mínimo:

- `CD_Pessoa`
- `CD_Usuario`
- `CD_CPF`
- `CD_Identificador` ou matrícula funcional oficial
- `NM_Pessoa`
- `DT_Nascimento`
- `TX_Email_Pessoa`
- `TX_Email_Usuario`
- `IN_Usuario_Ativo`
- `IN_Aluno`
- `IN_Funcionario`
- `IN_Responsavel`
- `CD_Coligada`
- `CD_Filial` ou `CD_Alocacoes`
- estado que permita decidir concessão vs revogação

Campos adicionais recomendados:

- matrícula funcional;
- status funcional bruto do TOTVS;
- tipo de vínculo;
- data de admissão;
- data de desligamento;
- indicador de múltiplas filiais;
- perfis esperados ou grupo funcional de acesso;
- e-mail institucional esperado, se houver trilha Google.

## 9. Rotas Recomendadas para o Fluxo de Funcionários

Para manter simetria com aluno e responsável:

- `POST /sync/funcionarios`
  - dispara concessão em lote.
- `POST /sync/funcionarios/funcionario`
  - dispara concessão unitária.
- `POST /sync/funcionarios/cancelamentos`
  - dispara cancelamento em lote.
- `POST /sync/funcionarios/cancelamentos/funcionario`
  - dispara cancelamento unitário.

Payload mínimo sugerido para unitário:

- `CD_Pessoa?: number`
- `CD_CPF?: string`
- `CD_Matricula?: string`
- `TP_Origem_Disparo: 'BATCH' | 'REPROCESSAMENTO' | 'WEBHOOK'`

Regra sugerida:

- exigir pelo menos um identificador;
- proteger por `x-api-key`;
- só criar webhook público se houver sistema emissor confiável e contrato fechado.

## 10. Componentes Técnicos que Precisarão Ser Criados

- DTO real de ativação de funcionário.
- DTO real de cancelamento de funcionário.
- `FuncionarioSyncController`.
- `FuncionarioSyncService`.
- `FuncionarioSyncProcessor`.
- registro da fila `funcionario-sync` no `SyncModule`.
- métodos de leitura no `TotvsService`:
  - `fetchFuncionariosAtivos(...)`
  - `fetchFuncionariosCancelamento(...)`
  - `fetchFuncionarioAtivo(...)`
  - `fetchFuncionarioCancelamento(...)`
- mapeamento `Funcionario -> PessoaAcessoContext`.
- extensão do enum/origem de revogação para `FUNCIONARIO`.
- perfis funcionais em `PERFIS_ACESSO`.
- documento funcional e plano de testes dedicados.

## 11. Riscos

- ausência de contrato SQL real do TOTVS pode gerar implementação em falso.
- ausência de mapeamento de perfis funcionais pode levar a concessão incompleta ou excessiva.
- cancelamento funcional sem regra clara de multipapel pode remover acesso de aluno/responsável indevidamente.
- se houver Gmail funcional, falta hoje definição de domínio e política operacional.
- não existe deduplicação forte por chave de negócio em todos os cenários de lote; concorrência deve ser observada na nova trilha.
- `axios` continua sem política explícita de timeout centralizado.

## 12. Plano de Implementação Recomendado

### Fase 1. Fechamento de contrato e regra

- obter SQL/view oficial de ativação de funcionário;
- obter SQL/view oficial de cancelamento de funcionário;
- validar payload retornado e normalizar nomes de colunas;
- fechar matriz de regras de concessão/revogação com RH/TI;
- fechar perfis funcionais por coligada/sistema.

### Fase 2. Documento funcional

- criar `apps/docs/mapeamento-integracao-funcionarios.md`;
- criar `apps/docs/plano-testes-totvs-sincronizacoes-funcionarios.md`;
- registrar cenários de:
  - funcionário puro;
  - funcionário também aluno;
  - funcionário também responsável;
  - desligado;
  - afastado;
  - transferido de filial/coligada;
  - sem CPF;
  - usuário errado já vinculado.

### Fase 3. Implementação backend

- criar DTOs reais;
- implementar leitura TOTVS;
- criar controller/service/processor;
- registrar fila Bull;
- mapear DTO para `PessoaAcessoContext`;
- estender regras de revogação para origem `FUNCIONARIO`;
- cadastrar perfis funcionais em `PERFIS_ACESSO`.

### Fase 4. Observabilidade e operação

- padronizar logs com identificadores: `job.id`, `CD_Pessoa`, `CPF`, matrícula, coligada, filial, ação;
- definir estratégia de reprocessamento unitário;
- validar comportamento de retry;
- documentar execução operacional.

## 13. Impactos Técnicos

- `SyncModule` ganhará nova fila e novos providers.
- `TotvsService` crescerá com novas leituras de procedure/view.
- `AccessProvisioningService` deve sofrer ajuste controlado para origem `FUNCIONARIO`.
- `PERFIS_ACESSO` ganhará entradas funcionais e passará a influenciar concessão/revogação multipapel.
- cobertura de validação manual precisará crescer, pois o projeto ainda não possui suíte automatizada consolidada.

## 14. Validação Recomendada

- validar consulta de ativação direto no TOTVS com massa real;
- validar consulta de cancelamento direto no TOTVS com massa real;
- testar concessão unitária e em lote;
- testar desligamento unitário e em lote;
- testar preservação de acesso quando funcionário também é aluno;
- testar preservação de acesso quando funcionário também é responsável;
- testar troca de login incorreto para CPF;
- testar funcionário sem CPF para garantir erro rastreável;
- validar `SUSUARIOFILIAL` com acesso funcional (`2`);
- validar perfis funcionais e coexistência com perfis acadêmicos.

## 15. Pendências Objetivas

- confirmar se existe procedure oficial para funcionário e obter SQL exportado.
- confirmar colunas reais retornadas para ativação e cancelamento.
- confirmar regra de Gmail funcional.
- confirmar perfis funcionais por coligada e sistema.
- confirmar critério de cancelamento para afastado/licenciado.
- confirmar identificador primário do disparo unitário: `CD_Pessoa`, `CPF`, matrícula ou combinação.

## 16. Conclusão

Base técnica parcialmente pronta. Core de usuário, vínculo, perfis e usuário-filial já suporta funcionário como papel ativo, mas a trilha operacional de funcionário ainda não existe. O principal bloqueador não é NestJS nem Bull: é falta de contrato funcional e SQL do TOTVS para funcionário. Sem isso, qualquer implementação agora teria alto risco de codificar regra errada.
