/* =====================================================================
   VALIDAÇÃO DAS PROCEDURES _v2  (rodar FORA DO PICO — a original é lenta)
   ---------------------------------------------------------------------
   Ideia: rodar a ORIGINAL uma única vez em carga completa, guardar o
   resultado em tabela, e comparar com a v2:
     - carga completa original x carga completa v2;
     - v2 por RA x recorte da carga completa original.
   Resultado esperado em todas as comparações: 0 linhas no EXCEPT.

   Pré-requisitos:
     - Aluno_v2 e Responsavel_v2 criadas (versões mais recentes).
     - Cópia de teste da original de responsáveis:
       PR_MGA_Consulta_Responsavel_Ativacao_Acesso_orig_teste
       (com "insert into #saida_responsavel" antes do SELECT final).
     - Troque [BANCO_APOIO] por um banco onde possa criar tabelas de
       trabalho (não use o CORPORE_ERP do TOTVS).
   ===================================================================== */

USE CORPORE_ERP;
SET NOCOUNT ON;

/* ---------------------------------------------------------------------
   1) ALUNOS — carga completa original x v2 (coligadas 1 e 5)
   --------------------------------------------------------------------- */
DROP TABLE IF EXISTS [BANCO_APOIO].dbo.VAL_ALUNO_ORIG, [BANCO_APOIO].dbo.VAL_ALUNO_V2;

CREATE TABLE [BANCO_APOIO].dbo.VAL_ALUNO_ORIG (
    PARAM_COLIGADA smallint NULL,
    CD_Coligada smallint, CD_Filial smallint, ID_Periodo_Letivo int, CD_Periodo_Letivo varchar(20),
    NM_Tipo_Matricula varchar(10), CD_Registro_Academico varchar(50), CD_CPF varchar(30),
    NM_Aluno nvarchar(300), CD_Pessoa int, TX_Email_Pessoa nvarchar(300), CD_Usuario nvarchar(100),
    IN_Usuario_Ativo int, TX_Email_Usuario nvarchar(300), DT_Nascimento varchar(10),
    IN_Existe_Matricula_Regular int, IN_Inativo_Regular int, IN_Existe_Matricula_Extra int, IN_Inativo_Extra int,
    IN_Funcionario int, IN_Responsavel int, JS_Alocacoes_Ativas nvarchar(max));
SELECT * INTO [BANCO_APOIO].dbo.VAL_ALUNO_V2 FROM [BANCO_APOIO].dbo.VAL_ALUNO_ORIG WHERE 1 = 0;

-- coluna PARAM_COLIGADA fica NULL no INSERT EXEC; preenchida logo depois
DECLARE @col smallint;
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT v FROM (VALUES (1),(5)) t(v);
OPEN c; FETCH NEXT FROM c INTO @col;
WHILE @@FETCH_STATUS = 0
BEGIN
    INSERT INTO [BANCO_APOIO].dbo.VAL_ALUNO_ORIG
      (CD_Coligada, CD_Filial, ID_Periodo_Letivo, CD_Periodo_Letivo, NM_Tipo_Matricula, CD_Registro_Academico,
       CD_CPF, NM_Aluno, CD_Pessoa, TX_Email_Pessoa, CD_Usuario, IN_Usuario_Ativo, TX_Email_Usuario, DT_Nascimento,
       IN_Existe_Matricula_Regular, IN_Inativo_Regular, IN_Existe_Matricula_Extra, IN_Inativo_Extra,
       IN_Funcionario, IN_Responsavel, JS_Alocacoes_Ativas)
    EXEC dbo.PR_MGA_Consulta_Aluno_Ativacao_Acesso '2026', @col;
    UPDATE [BANCO_APOIO].dbo.VAL_ALUNO_ORIG SET PARAM_COLIGADA = @col WHERE PARAM_COLIGADA IS NULL;

    INSERT INTO [BANCO_APOIO].dbo.VAL_ALUNO_V2
      (CD_Coligada, CD_Filial, ID_Periodo_Letivo, CD_Periodo_Letivo, NM_Tipo_Matricula, CD_Registro_Academico,
       CD_CPF, NM_Aluno, CD_Pessoa, TX_Email_Pessoa, CD_Usuario, IN_Usuario_Ativo, TX_Email_Usuario, DT_Nascimento,
       IN_Existe_Matricula_Regular, IN_Inativo_Regular, IN_Existe_Matricula_Extra, IN_Inativo_Extra,
       IN_Funcionario, IN_Responsavel, JS_Alocacoes_Ativas)
    EXEC dbo.PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2 '2026', @col;
    UPDATE [BANCO_APOIO].dbo.VAL_ALUNO_V2 SET PARAM_COLIGADA = @col WHERE PARAM_COLIGADA IS NULL;

    FETCH NEXT FROM c INTO @col;
END
CLOSE c; DEALLOCATE c;

SELECT 'ALUNO completo' AS teste,
       (SELECT COUNT(*) FROM [BANCO_APOIO].dbo.VAL_ALUNO_ORIG) AS linhas_orig,
       (SELECT COUNT(*) FROM [BANCO_APOIO].dbo.VAL_ALUNO_V2)   AS linhas_v2;
SELECT 'só na original' AS onde, * FROM (SELECT * FROM [BANCO_APOIO].dbo.VAL_ALUNO_ORIG EXCEPT SELECT * FROM [BANCO_APOIO].dbo.VAL_ALUNO_V2) d;
SELECT 'só na v2'       AS onde, * FROM (SELECT * FROM [BANCO_APOIO].dbo.VAL_ALUNO_V2   EXCEPT SELECT * FROM [BANCO_APOIO].dbo.VAL_ALUNO_ORIG) d;
-- Se houver diferença só na ordem dos itens de JS_Alocacoes_Ativas, não é erro.


/* ---------------------------------------------------------------------
   2) RESPONSÁVEIS — carga completa original x v2
   --------------------------------------------------------------------- */
DROP TABLE IF EXISTS #saida_responsavel, [BANCO_APOIO].dbo.VAL_RESP_ORIG, [BANCO_APOIO].dbo.VAL_RESP_V2;
CREATE TABLE #saida_responsavel (
    CD_Coligada smallint, CD_Filial smallint, CD_Coligada_Aluno smallint, CD_Filial_Aluno smallint,
    CD_Periodo_Letivo varchar(20), CD_Pessoa varchar(20), CD_Usuario nvarchar(100), CD_CPF varchar(50),
    NM_Responsavel nvarchar(400), TX_Email_Pessoa nvarchar(400), TX_Email_Usuario nvarchar(400),
    DT_Nascimento varchar(10), IN_Usuario_Ativo int,
    IN_Existe_Matricula_Regular int, IN_Inativo_Regular int, IN_Existe_Matricula_Extra int, IN_Inativo_Extra int,
    IN_Funcionario int, IN_Aluno int, IN_Filiacao int, IN_Responsavel_Academico int, IN_Responsavel_Financeiro int,
    JS_Alocacoes_Ativas nvarchar(max));

EXEC dbo.PR_MGA_Consulta_Responsavel_Ativacao_Acesso_orig_teste '2026', NULL, NULL, NULL;
SELECT * INTO [BANCO_APOIO].dbo.VAL_RESP_ORIG FROM #saida_responsavel;
TRUNCATE TABLE #saida_responsavel;

EXEC dbo.PR_MGA_Consulta_Responsavel_Ativacao_Acesso_v2 '2026', NULL, NULL, NULL;
SELECT * INTO [BANCO_APOIO].dbo.VAL_RESP_V2 FROM #saida_responsavel;
TRUNCATE TABLE #saida_responsavel;

SELECT 'RESP completo' AS teste,
       (SELECT COUNT(*) FROM [BANCO_APOIO].dbo.VAL_RESP_ORIG) AS linhas_orig,
       (SELECT COUNT(*) FROM [BANCO_APOIO].dbo.VAL_RESP_V2)   AS linhas_v2;
SELECT 'só na original' AS onde, * FROM (SELECT * FROM [BANCO_APOIO].dbo.VAL_RESP_ORIG EXCEPT SELECT * FROM [BANCO_APOIO].dbo.VAL_RESP_V2) d;
SELECT 'só na v2'       AS onde, * FROM (SELECT * FROM [BANCO_APOIO].dbo.VAL_RESP_V2   EXCEPT SELECT * FROM [BANCO_APOIO].dbo.VAL_RESP_ORIG) d;


/* ---------------------------------------------------------------------
   3) AMOSTRA POR RA — v2 filtrada x recorte da carga completa original
   ---------------------------------------------------------------------
   Pega 50 RAs ao acaso (regulares e extras) e compara:
   - ALUNO: v2(RA) deve ser igual às linhas da original completa com aquele RA.
   - RESP : v2(RA) deve ser igual às linhas da original completa cujos CPFs
            de responsável aparecem no resultado da v2 para o RA
            (regra: "filtro por RA mantém todos os vínculos dos responsáveis").
   --------------------------------------------------------------------- */
DROP TABLE IF EXISTS #amostra, #dif;
SELECT TOP (50) PARAM_COLIGADA, CD_Registro_Academico
INTO #amostra
FROM [BANCO_APOIO].dbo.VAL_ALUNO_ORIG
ORDER BY NEWID();

CREATE TABLE #dif (teste varchar(20), ra varchar(50), so_orig int, so_v2 int);

DECLARE @ra varchar(50), @pcol smallint;
DECLARE a CURSOR LOCAL FAST_FORWARD FOR SELECT PARAM_COLIGADA, CD_Registro_Academico FROM #amostra;
OPEN a; FETCH NEXT FROM a INTO @pcol, @ra;
WHILE @@FETCH_STATUS = 0
BEGIN
    -- ALUNO
    DROP TABLE IF EXISTS #al;
    SELECT TOP 0 CD_Coligada, CD_Filial, ID_Periodo_Letivo, CD_Periodo_Letivo, NM_Tipo_Matricula, CD_Registro_Academico,
           CD_CPF, NM_Aluno, CD_Pessoa, TX_Email_Pessoa, CD_Usuario, IN_Usuario_Ativo, TX_Email_Usuario, DT_Nascimento,
           IN_Existe_Matricula_Regular, IN_Inativo_Regular, IN_Existe_Matricula_Extra, IN_Inativo_Extra,
           IN_Funcionario, IN_Responsavel, JS_Alocacoes_Ativas
    INTO #al FROM [BANCO_APOIO].dbo.VAL_ALUNO_V2;
    INSERT INTO #al EXEC dbo.PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2 '2026', @pcol, @ra;

    INSERT INTO #dif
    SELECT 'ALUNO', @ra,
      (SELECT COUNT(*) FROM (SELECT CD_Coligada, CD_Filial, ID_Periodo_Letivo, CD_Periodo_Letivo, NM_Tipo_Matricula, CD_Registro_Academico,
              CD_CPF, NM_Aluno, CD_Pessoa, TX_Email_Pessoa, CD_Usuario, IN_Usuario_Ativo, TX_Email_Usuario, DT_Nascimento,
              IN_Existe_Matricula_Regular, IN_Inativo_Regular, IN_Existe_Matricula_Extra, IN_Inativo_Extra,
              IN_Funcionario, IN_Responsavel, JS_Alocacoes_Ativas
              FROM [BANCO_APOIO].dbo.VAL_ALUNO_ORIG WHERE PARAM_COLIGADA = @pcol AND CD_Registro_Academico = @ra
              EXCEPT SELECT * FROM #al) x),
      (SELECT COUNT(*) FROM (SELECT * FROM #al
              EXCEPT SELECT CD_Coligada, CD_Filial, ID_Periodo_Letivo, CD_Periodo_Letivo, NM_Tipo_Matricula, CD_Registro_Academico,
              CD_CPF, NM_Aluno, CD_Pessoa, TX_Email_Pessoa, CD_Usuario, IN_Usuario_Ativo, TX_Email_Usuario, DT_Nascimento,
              IN_Existe_Matricula_Regular, IN_Inativo_Regular, IN_Existe_Matricula_Extra, IN_Inativo_Extra,
              IN_Funcionario, IN_Responsavel, JS_Alocacoes_Ativas
              FROM [BANCO_APOIO].dbo.VAL_ALUNO_ORIG WHERE PARAM_COLIGADA = @pcol AND CD_Registro_Academico = @ra) x);

    -- RESPONSÁVEL
    TRUNCATE TABLE #saida_responsavel;
    EXEC dbo.PR_MGA_Consulta_Responsavel_Ativacao_Acesso_v2 '2026', NULL, NULL, @ra;

    INSERT INTO #dif
    SELECT 'RESP', @ra,
      (SELECT COUNT(*) FROM (SELECT * FROM [BANCO_APOIO].dbo.VAL_RESP_ORIG
                             WHERE CD_CPF IN (SELECT CD_CPF FROM #saida_responsavel)
                             EXCEPT SELECT * FROM #saida_responsavel) x),
      (SELECT COUNT(*) FROM (SELECT * FROM #saida_responsavel
                             EXCEPT SELECT * FROM [BANCO_APOIO].dbo.VAL_RESP_ORIG) x);

    FETCH NEXT FROM a INTO @pcol, @ra;
END
CLOSE a; DEALLOCATE a;

-- Esperado: nenhuma linha (todas as diferenças = 0)
SELECT * FROM #dif WHERE so_orig > 0 OR so_v2 > 0 ORDER BY teste, ra;
SELECT teste, COUNT(*) AS ras_testados, SUM(CASE WHEN so_orig = 0 AND so_v2 = 0 THEN 1 ELSE 0 END) AS ras_ok
FROM #dif GROUP BY teste;
