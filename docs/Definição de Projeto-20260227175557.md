# Definição de Projeto

![](https://t9011207949.p.clickup-attachments.com/t9011207949/3a934df0-b1c2-4a6c-985b-05f2d46f11d1/image.png)

---

| Projeto:              | Acessos - Integração de Usuários e E-mails (Automação)        |
| --------------------- | ------------------------------------------------------------- |
| Participantes:        | TI (Sistemas e Desenvolvimento) - Ryan Aragão e Bruna Kariny. |
| Usuário Chave:        | Coordenações / Equipe de Infraestrutura                       |
| Elaboração:           | Ryan Aragão e Bruna Kariny                                    |
| Data de Início / Fim: | 27/02/2026 / \_\_/\_\_/\_\_\_\_                               |
| Data Acomp. Produção: | \_\_/\_\_/\_\_\_\_ / \_\_/\_\_/\_\_\_\_                       |

---

## 🎯 1. Objetivo do Sistema

O projeto de **Integração de Acessos** tem como objetivo centralizar, automatizar e padronizar o provisionamento de contas e perfis de usuários (Alunos, Funcionários) entre a plataforma **TOTVS** (ERP/Educacional) e o ecossistema do **Google Workspace**.

O sistema atuará como uma ponte orquestradora que lê a situação acadêmica/funcional na base oficial (TOTVS) e reflete essas informações em tempo real criando, ativando, desativando contas de e-mail e gerenciando acessos de login no próprio painel da instituição de forma autônoma.

---

## 📌 2. Escopo

- **Leitura Central:** Buscar automaticamente os alunos que possuem matrícula ativa no período letivo atual diretamente no banco de dados da TOTVS.
- **Gestão no Google Workspace (Alunos):**
  - Criar ou reativar automaticamente contas de e-mails para alunos identificados como ATIVOS no letivo (baseado em um padrão e domínio por Coligada).
  - Suspender contas de e-mails existentes no Google que **não** constem mais na lista de alunos ativos da TOTVS (egressos, trancamentos, etc).
- **Gestão no ERP TOTVS (Alunos):**
  - Criar novo usuário de sistema (login) ou ativar usuário já existente caso o aluno esteja ativo no período.
  - Desativar usuário de sistema para contas que não estiverem na lista do período letivo atual.
  - Conceder perfil de acesso padrão (ex: Portal do Aluno / Sistemas Específicos) aos usuários de alunos ativos que ainda não possuam.
- **Observabilidade e Rastreio:** Todo o ciclo de sincronia deve registrar _trace ids_ e metadados via log (`nestjs-pino`) e base SQL auxiliar, permitindo auditoria no Grafana Loki / Seq.

---

## 👥 3. Stakeholders e Papéis

| Nome / Equipe               | Papel no Projeto                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Equipe de Desenvolvimento   | Responsável por projetar, construir (NestJS, Monorepo, Prisma, SQL Server), testar e manter os robôs de integração. Ryan Aragão e Bruna Kariny.                                |
| Administração de Infra/TI   | Responsáveis pela manutenção das contas do Google Workspace, colhendo os benefícios da automação (não precisarão atuar manualmente nas criações/desativações a cada semestre). |
| Usuários Atendidos (Alunos) | Clientes finais da automação, que terão seus e-mails e acessos ao portal/ERP liberados em tempo recorde assim que a matrícula for concluída.                                   |

---

## ⚙️ 4. Premissas

- A **TOTVS é a fonte absoluta da verdade**. Nenhuma criação de aluno deve ser originada/requisitada diretamente no Google; o Google deve refletir a base TOTVS.
- A leitura da base deverá utilizar chamadas/consultas otimizadas (views do banco de dados) para evitar gargalos na infraestrutura de produção.
- A aplicação possuirá agendamentos (CronJobs) escaláveis.
- Credenciais sensíveis de integração (Token da API do Workspace, credenciais de banco e AD) estarão isoladas via variáveis de ambiente.
- O processamento ocorrerá em background (backend application sem frontend no escopo atual).

---

## 🚫 5. Restrições

- **Não deve** haver deleção/exclusão definitiva de e-mails no Google. O padrão imposto é de Suspensão da conta (garantindo retenção de arquivos de Drive e Histórico em caso de retorno do aluno).
- Não existe interface gráfica de usuário final (Painel WEB) prevista na Fase 1 do projeto, apenas operação da API no backend.
- A coligada do aluno **deve possuir domínio registrado** e preenchido corretamente no padrão estabelecido para provisionamento GSuite.

---

## 📤 6. Saídas/Entregáveis

- Código Fonte em Monorepo (NestJS/PNPM) hospedado com os Adapters de TOTVS e Google estruturados em pastas modulares.
- Job Orquestrador operante sincronizando as massas de alunos.
- Diagramas de Fluxo e Documentações Técnicas de Arquitetura (Arquivos Markdown anexos).
- Ambiente de Logs indexáveis populado em JSON, viabilizando dashboards futuros no Grafana.

---

## 📅 7. Cronograma Macro (Estimado)

| Fase / Módulo                | Descrição                                                                                    | Início     | Fim Estimado |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ---------- | ------------ |
| 0. Setup e Arquitetura       | Estruturação de Base de Dados, Monorepo e Configs.                                           | 27/02/2026 | 27/02/2026   |
| 1. Interface Leitura (TOTVS) | Criação da base SQL de Alunos e Coligadas ativas no período.                                 | —          | —            |
| 2. Google Workspace          | Desenvolvimento de scripts para Criação, Ativação e Suspensão de contas do padrão aluno.     | —          | —            |
| 3. Controle Acesso (TOTVS)   | Algoritmos de Provisionamento, bloqueio e vinculação de perfis aos usuários de login do ERP. | —          | —            |
| 4. Homologação e Monitoria   | Testes das lógicas e deploy integrado aos visualizadores de Log (Loki/Seq).                  | —          | —            |

---

## 🔗 8. Integrações

- **Google Workspace API:** Chamadas HTTP autenticadas via Service Account para o `Admin SDK Directory API` gerindo Contas.
- **TOTVS DB / API:** Consultas SQL Server e Procedures locais do sistema unificadas.

---

## ⚠️ 9. Não Aderências



---

## 📝 10. Observações Adicionais

- **Rollback e Isolamento:** Cada aluno é validado unicamente. Uma falha de rede ao criar um aluno específico não deve parar ou anular o processamento em lote (loop try/catch por CPF/Identificador será implementado).
