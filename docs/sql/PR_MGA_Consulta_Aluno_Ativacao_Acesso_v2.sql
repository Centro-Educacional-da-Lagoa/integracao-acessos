/* =====================================================================
   PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2  —  proposta de otimização
   ---------------------------------------------------------------------
   Criada como _v2 para rodar LADO A LADO com a original e comparar
   resultado e tempo (script de teste no fim do arquivo). Só depois de
   validado, aplicar o corpo na procedure original.

   Mesma assinatura e mesmas colunas de saída da original.

   O que muda (e por quê):
   1) Filtro pelo RA no INÍCIO, não no SELECT final.
      Antes: toda chamada montava #tmp_aluno_ativo com TODOS os alunos
      ativos da coligada no período e só no fim filtrava o RA
      (≈ 44 s de CPU e 500 mil leituras por chamada de 1 aluno).
      Agora: com RA informado, resolvem-se as PESSOAS donas do RA e todas as
      etapas são restritas a ela. Filtra-se por pessoa (e não por RA)
      para preservar a regra do NOT EXISTS da etapa 2 e da coligada 5,
      que comparam por CD_Pessoa. O SELECT final mantém o filtro por RA,
      então a saída é a mesma.
   2) Períodos letivos resolvidos antes (#perlet com IDPERLET), para o
      SMATRICPL poder ser lido pelo início da chave (CODCOLIGADA,
      IDPERLET...) em vez de varrer e juntar com SPLETIVO.
   3) OPTION (RECOMPILE) nas consultas pesadas: a mesma procedure é
      chamada para 1 aluno e para a coligada inteira; sem isso o plano
      compilado para um caso é reaproveitado no outro.
   4) Junção com FCFO sem REPLACE na coluna. Antes:
         replace(replace(fcfo.cgccfo,'.',''),'-','') = tmp.CD_CPF
      obrigava a ler a FCFO inteira. Agora compara CGCCFO com o CPF
      "puro" e com a máscara 000.000.000-00, permitindo usar índice.
      ⚠ Equivalente desde que CGCCFO esteja só com dígitos ou na
      máscara padrão (confirme com a consulta de checagem no fim).
   5) SET NOCOUNT ON.

   NÃO alterado de propósito (avaliar com o dono da regra):
   - Ramo coligada 5: IN_Inativo_Extra = CASE ... THEN 0 ELSE 0 END
     (sempre 0). No ramo das outras coligadas é THEN 0 ELSE 1.
     Parece erro de cópia — mantido igual para não mudar resultado.
   - LEFT JOIN FCFO pode duplicar o aluno se houver mais de um cliente/
     fornecedor com o mesmo CPF (em coligadas diferentes). Mantido.
   - WITH (NOLOCK) mantido (leitura suja aceita pela regra atual).
   ===================================================================== */
CREATE OR ALTER PROCEDURE [dbo].[PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2]
	( @prm_cd_periodo_letivo	varchar(20)
	, @prm_cd_coligada			smallint
	, @prm_cd_registro_academico varchar(20) = null
	)
AS
BEGIN
	SET NOCOUNT ON;

	-- =========================================================================================
	-- 0a. Períodos letivos do código informado (IDPERLET por coligada)
	-- =========================================================================================
	create table #perlet
	(
		codcoligada		smallint								not null
		, idperlet		int										not null
		, codperlet		varchar(20) collate database_default	not null
		, primary key ( codcoligada, idperlet )
	)

	insert	into #perlet ( codcoligada, idperlet, codperlet )
	select	prlt.codcoligada, prlt.idperlet, prlt.codperlet
	from	dbo.spletivo as prlt with (nolock)
	where	prlt.codperlet = @prm_cd_periodo_letivo

	-- =========================================================================================
	-- 0b. Com RA informado: pessoas donas do RA.
	--     Na coligada 5 o RA pode ser da coligada 6 (alunos só de Curso Extra).
	--     RA informado e não encontrado → retorna vazio sem processar nada.
	-- =========================================================================================
	declare @tem_filtro bit = case when @prm_cd_registro_academico is null then 0 else 1 end

	-- Tabela (e não variável única): o mesmo RA pode existir na coligada 5 e na 6
	-- para pessoas diferentes; a original retornaria as duas.
	create table #pessoa_filtro ( CD_Pessoa int not null primary key )

	if @tem_filtro = 1
		insert	into #pessoa_filtro ( CD_Pessoa )
		select	distinct aln.codpessoa
		from	dbo.saluno as aln with (nolock)
		where	aln.ra = @prm_cd_registro_academico
		  and	( aln.codcoligada = @prm_cd_coligada
				  or ( @prm_cd_coligada = 5 and aln.codcoligada = 6 ) )
		  and	aln.codpessoa is not null
		-- RA não encontrado → #pessoa_filtro vazia → todas as etapas retornam vazio

	-- 0c. Filtro externo opcional: quem chama (ex.: procedure de responsáveis) pode criar
	--     #pessoa_filtro_externo ( CD_Pessoa int ) antes do EXEC para restringir o cálculo
	--     a um conjunto de alunos. Sem a tabela, o comportamento é o de sempre.
	if object_id('tempdb..#pessoa_filtro_externo') is not null
	begin
		if @tem_filtro = 1
			delete	pf
			from	#pessoa_filtro as pf
			where	not exists ( select 1 from #pessoa_filtro_externo as ext where ext.CD_Pessoa = pf.CD_Pessoa )
		else
			insert	into #pessoa_filtro ( CD_Pessoa )
			select	distinct ext.CD_Pessoa
			from	#pessoa_filtro_externo as ext
			where	ext.CD_Pessoa is not null

		set @tem_filtro = 1
	end

	-- =========================================================================================
	-- 1. Alunos Ativos no Ensino Regular
	-- =========================================================================================
	select	 mtpl.codcoligada						as CD_Coligada
			, mtpl.codfilial						as CD_Filial
			, mtpl.idperlet							as ID_Periodo_Letivo
			, prlt.codperlet						as CD_Periodo_Letivo
			, 'REGULAR'								as NM_Tipo_Matricula
			, mtpl.ra								as CD_Registro_Academico
			, pss.cpf								as CD_CPF
			, upper(pss.nome)						as NM_Aluno
			, pss.codigo							as CD_Pessoa
			, pss.email								as TX_Email_Pessoa
			, pss.codusuario						as CD_Usuario
			, isnull(usr.status, 0)					as IN_Usuario_Ativo
			, usr.email								as TX_Email_Usuario
			, convert(varchar(10), pss.dtnascimento, 103)	as DT_Nascimento
			, 1										as IN_Existe_Matricula_Regular
			, 0										as IN_Inativo_Regular
			, 0										as IN_Existe_Matricula_Extra
			, 0										as IN_Inativo_Extra
	into	#tmp_aluno_ativo
	from	#perlet									as prlt
	inner	join dbo.smatricpl						as mtpl	with (nolock)
	  on	mtpl.codcoligada = prlt.codcoligada
	  and	mtpl.idperlet = prlt.idperlet
	inner	join dbo.shabilitacaofilial				as hbfl	with (nolock)
	  on	mtpl.codcoligada = hbfl.codcoligada
	  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
	inner	join dbo.shabilitacao					as hblt	with (nolock)
	  on	hbfl.codcoligada = hblt.codcoligada
	  and	hbfl.codcurso = hblt.codcurso
	  and	hbfl.codhabilitacao = hblt.codhabilitacao
	inner	join dbo.saluno							as aln		with (nolock)
	  on	mtpl.codcoligada = aln.codcoligada
	  and	mtpl.ra = aln.ra
	inner	join dbo.ppessoa						as pss		with (nolock)
	  on	aln.codpessoa = pss.codigo
	inner	join dbo.sstatus						as stt		with (nolock)
	  on	mtpl.codcoligada = stt.codcoligada
	  and	mtpl.codstatus = stt.codstatus
	left	join dbo.gusuario						as usr		with (nolock)
	  on	pss.codusuario = usr.codusuario
	where	hblt.complemento in ( 'EI', 'EF1', 'EF2', 'EM' )
	  and	stt.descricao = 'Ativo'
	  and	prlt.codcoligada = @prm_cd_coligada
	  and	( @tem_filtro = 0 or exists ( select 1 from #pessoa_filtro as pf where pf.CD_Pessoa = aln.codpessoa ) )
	option	( recompile )

	create clustered index IX_tmp_aluno_ativo
		on #tmp_aluno_ativo ( CD_Coligada, CD_Registro_Academico )

	create index IX_tmp_aluno_ativo_CD_Pessoa
		on #tmp_aluno_ativo ( CD_Pessoa, CD_Periodo_Letivo )

	-- =========================================================================================
	-- 2. Alunos com Matrícula ATIVA SOMENTE no Curso Extra
	--    (OR por coligada separado em dois blocos: cada um pode usar índice)
	-- =========================================================================================
	declare @cd_coligada_extra smallint =
		case when @prm_cd_coligada = 5 then 6 else @prm_cd_coligada end

	insert	into #tmp_aluno_ativo
			( CD_Coligada, CD_Filial, ID_Periodo_Letivo, CD_Periodo_Letivo, NM_Tipo_Matricula
			, CD_Registro_Academico, CD_CPF, NM_Aluno, CD_Pessoa, TX_Email_Pessoa, CD_Usuario
			, IN_Usuario_Ativo, TX_Email_Usuario, DT_Nascimento
			, IN_Existe_Matricula_Regular, IN_Inativo_Regular, IN_Existe_Matricula_Extra, IN_Inativo_Extra
			)
	select	 mtpl.codcoligada
			, mtpl.codfilial
			, mtpl.idperlet
			, prlt.codperlet
			, 'EXTRA'
			, mtpl.ra
			, pss.cpf
			, upper(pss.nome)
			, pss.codigo
			, pss.email
			, pss.codusuario
			, isnull(usr.status, 0)
			, usr.email
			, convert(varchar(10), pss.dtnascimento, 103)
			, 0, 1, 1, 0
	from	#perlet									as prlt
	inner	join dbo.smatricpl						as mtpl	with (nolock)
	  on	mtpl.codcoligada = prlt.codcoligada
	  and	mtpl.idperlet = prlt.idperlet
	inner	join dbo.shabilitacaofilial				as hbfl	with (nolock)
	  on	mtpl.codcoligada = hbfl.codcoligada
	  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
	inner	join dbo.shabilitacao					as hblt	with (nolock)
	  on	hbfl.codcoligada = hblt.codcoligada
	  and	hbfl.codcurso = hblt.codcurso
	  and	hbfl.codhabilitacao = hblt.codhabilitacao
	inner	join dbo.saluno							as aln		with (nolock)
	  on	mtpl.codcoligada = aln.codcoligada
	  and	mtpl.ra = aln.ra
	inner	join dbo.ppessoa						as pss		with (nolock)
	  on	aln.codpessoa = pss.codigo
	inner	join dbo.sstatus						as stt		with (nolock)
	  on	mtpl.codcoligada = stt.codcoligada
	  and	mtpl.codstatus = stt.codstatus
	left	join dbo.gusuario						as usr		with (nolock)
	  on	pss.codusuario = usr.codusuario
	where	prlt.codcoligada = @cd_coligada_extra
	  and	hblt.complemento = 'CEX'
	  and	stt.descricao = 'Ativo'
	  and	( @tem_filtro = 0 or exists ( select 1 from #pessoa_filtro as pf where pf.CD_Pessoa = aln.codpessoa ) )
	  -- outras coligadas: já é regular com o mesmo RA na coligada
	  and	( @prm_cd_coligada = 5
			  or not exists ( select 1 from #tmp_aluno_ativo as tmp
							  where tmp.CD_Coligada = @prm_cd_coligada
							    and tmp.CD_Registro_Academico = aln.ra ) )
	  -- coligada 5: já é regular (qualquer RA) a mesma pessoa
	  and	( @prm_cd_coligada <> 5
			  or not exists ( select 1 from #tmp_aluno_ativo as tmp
							  where tmp.CD_Pessoa = aln.codpessoa ) )
	option	( recompile )

	-- =========================================================================================
	-- 3. Contagem de matrículas no Curso Extra para os alunos regulares
	-- =========================================================================================
	create table #tmp_cex
	(
		CD_Registro_Academico			varchar(50) collate database_default		null
		, CD_Pessoa						int											null
		, CD_Periodo_Letivo				varchar(20) collate database_default		not null
		, QT_Matricula_Extra			int											not null
	)

	if @prm_cd_coligada <> 5
	begin

		insert	into #tmp_cex ( CD_Registro_Academico, CD_Pessoa, CD_Periodo_Letivo, QT_Matricula_Extra )
		select	 mtpl.ra
				, null
				, prlt.codperlet
				, count(*)
		from	#perlet									as prlt
		inner	join dbo.smatricpl						as mtpl	with (nolock)
		  on	mtpl.codcoligada = prlt.codcoligada
		  and	mtpl.idperlet = prlt.idperlet
		inner	join dbo.saluno							as aln		with (nolock)
		  on	mtpl.codcoligada = aln.codcoligada
		  and	mtpl.ra = aln.ra
		inner	join dbo.shabilitacaofilial				as hbfl	with (nolock)
		  on	mtpl.codcoligada = hbfl.codcoligada
		  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
		inner	join dbo.shabilitacao					as hblt	with (nolock)
		  on	hbfl.codcoligada = hblt.codcoligada
		  and	hbfl.codcurso = hblt.codcurso
		  and	hbfl.codhabilitacao = hblt.codhabilitacao
		inner	join dbo.sstatus						as stt		with (nolock)
		  on	mtpl.codcoligada = stt.codcoligada
		  and	mtpl.codstatus = stt.codstatus
		where	prlt.codcoligada = @prm_cd_coligada
		  and	hblt.complemento = 'CEX'
		  and	stt.descricao = 'Ativo'
		  and	( @tem_filtro = 0 or exists ( select 1 from #pessoa_filtro as pf where pf.CD_Pessoa = aln.codpessoa ) )
		group	by mtpl.ra, prlt.codperlet
		option	( recompile )

		create clustered index IX_tmp_cex
			on #tmp_cex ( CD_Registro_Academico, CD_Periodo_Letivo )

		update	tmp
		   set	 tmp.IN_Existe_Matricula_Extra =
					case when isnull(cex.QT_Matricula_Extra, 0) > 0 then 1 else 0 end
				, tmp.IN_Inativo_Extra =
					case when isnull(cex.QT_Matricula_Extra, 0) > 0 then 0 else 1 end
		from	#tmp_aluno_ativo						as tmp
		left	join #tmp_cex							as cex
		  on	tmp.CD_Registro_Academico = cex.CD_Registro_Academico
		  and	tmp.CD_Periodo_Letivo = cex.CD_Periodo_Letivo
		where	tmp.NM_Tipo_Matricula = 'REGULAR'

	end
	else
	begin

		insert	into #tmp_cex ( CD_Registro_Academico, CD_Pessoa, CD_Periodo_Letivo, QT_Matricula_Extra )
		select	 null
				, aln.codpessoa
				, prlt.codperlet
				, count(*)
		from	#perlet									as prlt
		inner	join dbo.smatricpl						as mtpl	with (nolock)
		  on	mtpl.codcoligada = prlt.codcoligada
		  and	mtpl.idperlet = prlt.idperlet
		inner	join dbo.saluno							as aln		with (nolock)
		  on	mtpl.codcoligada = aln.codcoligada
		  and	mtpl.ra = aln.ra
		inner	join dbo.shabilitacaofilial				as hbfl	with (nolock)
		  on	mtpl.codcoligada = hbfl.codcoligada
		  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
		inner	join dbo.shabilitacao					as hblt	with (nolock)
		  on	hbfl.codcoligada = hblt.codcoligada
		  and	hbfl.codcurso = hblt.codcurso
		  and	hbfl.codhabilitacao = hblt.codhabilitacao
		inner	join dbo.sstatus						as stt		with (nolock)
		  on	mtpl.codcoligada = stt.codcoligada
		  and	mtpl.codstatus = stt.codstatus
		where	prlt.codcoligada = 6
		  and	hblt.complemento = 'CEX'
		  and	stt.descricao = 'Ativo'
		  and	( @tem_filtro = 0 or exists ( select 1 from #pessoa_filtro as pf where pf.CD_Pessoa = aln.codpessoa ) )
		group	by aln.codpessoa, prlt.codperlet
		option	( recompile )

		create clustered index IX_tmp_cex
			on #tmp_cex ( CD_Pessoa, CD_Periodo_Letivo )

		update	tmp
		   set	 tmp.IN_Existe_Matricula_Extra =
					case when isnull(cex.QT_Matricula_Extra, 0) > 0 then 1 else 0 end
				, tmp.IN_Inativo_Extra =
					case when isnull(cex.QT_Matricula_Extra, 0) > 0 then 0 else 0 end	-- ⚠ igual à original (sempre 0)
		from	#tmp_aluno_ativo						as tmp
		left	join #tmp_cex							as cex
		  on	tmp.CD_Pessoa = cex.CD_Pessoa
		  and	tmp.CD_Periodo_Letivo = cex.CD_Periodo_Letivo
		where	tmp.NM_Tipo_Matricula = 'REGULAR'

	end

	drop table #tmp_cex

	-- =========================================================================================
	-- 4. Alocações ativas (todas as coligadas) das pessoas encontradas
	-- =========================================================================================
	create table #tmp_alocacao_ativa
	(
		CD_Pessoa						int											not null
		, CD_Coligada					smallint									not null
		, CD_Filial						smallint									not null
		, TP_Matricula					varchar(20) collate database_default		not null
	)

	-- Parte da PESSOA, não do período: antes lia todas as matrículas do período em
	-- TODAS as coligadas para depois filtrar pelas pessoas (75 s+ com 1 aluno).
	-- Agora: pessoas de #tmp_aluno_ativo → seus RAs (SALUNO.CODPESSOA) → matrículas.
	-- O EXISTS em #tmp_aluno_ativo da original vira o ponto de partida (mesmo resultado).
	create table #aloc_aluno
	(
		codpessoa		int										not null
		, codcoligada	smallint								not null
		, ra			varchar(50) collate database_default	not null
		, primary key ( codcoligada, ra, codpessoa )
	)

	insert	into #aloc_aluno ( codpessoa, codcoligada, ra )
	select	distinct aln.codpessoa, aln.codcoligada, aln.ra
	from	( select distinct CD_Pessoa from #tmp_aluno_ativo ) as tmp
	inner	join dbo.saluno as aln with (nolock)
	  on	aln.codpessoa = tmp.CD_Pessoa
	option	( recompile )

	insert	into #tmp_alocacao_ativa ( CD_Pessoa, CD_Coligada, CD_Filial, TP_Matricula )
	select	distinct
			 aln.codpessoa
			, mtpl.codcoligada
			, mtpl.codfilial
			, case when hblt.complemento = 'CEX' then 'EXTRA' else 'REGULAR' end
	from	#aloc_aluno								as aln
	inner	join dbo.smatricpl						as mtpl	with (nolock)
	  on	mtpl.codcoligada = aln.codcoligada
	  and	mtpl.ra = aln.ra
	inner	join #perlet							as prlt
	  on	mtpl.codcoligada = prlt.codcoligada
	  and	mtpl.idperlet = prlt.idperlet
	inner	join dbo.shabilitacaofilial				as hbfl	with (nolock)
	  on	mtpl.codcoligada = hbfl.codcoligada
	  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
	inner	join dbo.shabilitacao					as hblt	with (nolock)
	  on	hbfl.codcoligada = hblt.codcoligada
	  and	hbfl.codcurso = hblt.codcurso
	  and	hbfl.codhabilitacao = hblt.codhabilitacao
	inner	join dbo.sstatus						as stt		with (nolock)
	  on	mtpl.codcoligada = stt.codcoligada
	  and	mtpl.codstatus = stt.codstatus
	where	hblt.complemento in ( 'EI', 'EF1', 'EF2', 'EM', 'CEX' )
	  and	stt.descricao = 'Ativo'
	option	( recompile )

	drop table #aloc_aluno

	create index IX_tmp_alocacao_ativa_pes on #tmp_alocacao_ativa ( CD_Pessoa )

	-- =========================================================================================
	-- 5. Resultado
	-- =========================================================================================
	select	tmp.*
			, case when func.codpessoa is not null then 1 else 0 end	as IN_Funcionario
			, case
					when exists
							(
								select	1
								from	dbo.saluno							as alno	with (nolock)
								inner	join dbo.smatricpl					as mtpl	with (nolock)
								  on	alno.codcoligada = mtpl.codcoligada
								  and	alno.ra = mtpl.ra
								inner	join dbo.sstatus					as stt		with (nolock)
								  on	mtpl.codcoligada = stt.codcoligada
								  and	mtpl.codstatus = stt.codstatus
								inner	join #perlet						as prlt
								  on	mtpl.codcoligada = prlt.codcoligada
								  and	mtpl.idperlet = prlt.idperlet
								inner	join dbo.shabilitacaofilial			as hbfl	with (nolock)
								  on	mtpl.codcoligada = hbfl.codcoligada
								  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
								inner	join dbo.shabilitacao				as hblt	with (nolock)
								  on	hbfl.codcoligada = hblt.codcoligada
								  and	hbfl.codcurso = hblt.codcurso
								  and	hbfl.codhabilitacao = hblt.codhabilitacao
								where	alno.codcfo = fcfo.codcfo
								  and	( (alno.ra <> tmp.CD_Registro_Academico)
										  or (alno.ra = tmp.CD_Registro_Academico and alno.codcoligada = tmp.CD_Coligada) )
								  and	stt.descricao not in ( 'Cancelado', 'Falecido' )
							)
						 or exists
							(
								select	1
								from	dbo.saluno							as alno	with (nolock)
								inner	join dbo.smatricpl					as mtpl	with (nolock)
								  on	alno.codcoligada = mtpl.codcoligada
								  and	alno.ra = mtpl.ra
								inner	join dbo.sstatus					as stt		with (nolock)
								  on	mtpl.codcoligada = stt.codcoligada
								  and	mtpl.codstatus = stt.codstatus
								inner	join #perlet						as prlt
								  on	mtpl.codcoligada = prlt.codcoligada
								  and	mtpl.idperlet = prlt.idperlet
								inner	join dbo.shabilitacaofilial			as hbfl	with (nolock)
								  on	mtpl.codcoligada = hbfl.codcoligada
								  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
								inner	join dbo.shabilitacao				as hblt	with (nolock)
								  on	hbfl.codcoligada = hblt.codcoligada
								  and	hbfl.codcurso = hblt.codcurso
								  and	hbfl.codhabilitacao = hblt.codhabilitacao
								where	alno.codpessoaraca = tmp.CD_Pessoa
								  and	( (alno.ra <> tmp.CD_Registro_Academico)
										  or (alno.ra = tmp.CD_Registro_Academico and alno.codcoligada = tmp.CD_Coligada) )
								  and	stt.descricao not in ( 'Cancelado', 'Falecido' )
							)
						 or exists
							(
								select	1
								from	dbo.vfiliacao						as alfi	with (nolock)
								inner	join dbo.saluno						as alno	with (nolock)
								  on	alfi.codpessoafilho = alno.codpessoa
								inner	join dbo.smatricpl					as mtpl	with (nolock)
								  on	alno.codcoligada = mtpl.codcoligada
								  and	alno.ra = mtpl.ra
								inner	join dbo.sstatus					as stt		with (nolock)
								  on	mtpl.codcoligada = stt.codcoligada
								  and	mtpl.codstatus = stt.codstatus
								inner	join #perlet						as prlt
								  on	mtpl.codcoligada = prlt.codcoligada
								  and	mtpl.idperlet = prlt.idperlet
								inner	join dbo.shabilitacaofilial			as hbfl	with (nolock)
								  on	mtpl.codcoligada = hbfl.codcoligada
								  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
								inner	join dbo.shabilitacao				as hblt	with (nolock)
								  on	hbfl.codcoligada = hblt.codcoligada
								  and	hbfl.codcurso = hblt.codcurso
								  and	hbfl.codhabilitacao = hblt.codhabilitacao
								where	alfi.codpessoafiliacao = tmp.CD_Pessoa
								  and	( (alno.ra <> tmp.CD_Registro_Academico)
										  or (alno.ra = tmp.CD_Registro_Academico and alno.codcoligada = tmp.CD_Coligada) )
								  and	stt.descricao not in ( 'Cancelado', 'Falecido' )
							) then 1
					else 0
			  end				as IN_Responsavel
			, (
				select	 alv.CD_Coligada, alv.CD_Filial, alv.TP_Matricula
				from	#tmp_alocacao_ativa as alv
				where	alv.CD_Pessoa = tmp.CD_Pessoa
				for json path
			  )					as JS_Alocacoes_Ativas
	from	#tmp_aluno_ativo						as tmp
	left	join dbo.pfunc							as func	with (nolock)
	  on	tmp.CD_Pessoa = func.codpessoa
	  and	func.codsituacao <> 'D'
	left	join dbo.fcfo							as fcfo	with (nolock)
	  on	fcfo.cgccfo in
			( tmp.CD_CPF
			, substring(tmp.CD_CPF, 1, 3) + '.' + substring(tmp.CD_CPF, 4, 3) + '.'
			  + substring(tmp.CD_CPF, 7, 3) + '-' + substring(tmp.CD_CPF, 10, 2)
			)
	where	( @prm_cd_registro_academico is null or tmp.CD_Registro_Academico = @prm_cd_registro_academico )
	option	( recompile )

END
GO


/* =====================================================================
   TESTE LADO A LADO  (rodar no CORPORE_ERP, fora do pico)
   ---------------------------------------------------------------------
   Compara saída e custo da original x v2. Troque os RAs por RAs reais
   (um regular, um só Curso Extra, um da coligada 5/6).
   Resultado esperado: as duas consultas EXCEPT retornam 0 linhas.
   ===================================================================== */
/*
SET STATISTICS TIME, IO ON;

-- 1) Chamada por RA (caso do webhook)
EXEC dbo.PR_MGA_Consulta_Aluno_Ativacao_Acesso    '2026', 1, '<RA>';
EXEC dbo.PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2 '2026', 1, '<RA>';

-- 2) Comparação completa de resultado (coligada inteira) — a original demora
DROP TABLE IF EXISTS #orig, #v2;
CREATE TABLE #orig (
    CD_Coligada smallint, CD_Filial smallint, ID_Periodo_Letivo int, CD_Periodo_Letivo varchar(20),
    NM_Tipo_Matricula varchar(10), CD_Registro_Academico varchar(50), CD_CPF varchar(30),
    NM_Aluno nvarchar(300), CD_Pessoa int, TX_Email_Pessoa nvarchar(300), CD_Usuario nvarchar(100),
    IN_Usuario_Ativo int, TX_Email_Usuario nvarchar(300), DT_Nascimento varchar(10),
    IN_Existe_Matricula_Regular int, IN_Inativo_Regular int, IN_Existe_Matricula_Extra int, IN_Inativo_Extra int,
    IN_Funcionario int, IN_Responsavel int, JS_Alocacoes_Ativas nvarchar(max));
SELECT * INTO #v2 FROM #orig WHERE 1 = 0;

INSERT INTO #orig EXEC dbo.PR_MGA_Consulta_Aluno_Ativacao_Acesso    '2026', 1;
INSERT INTO #v2   EXEC dbo.PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2 '2026', 1;

SELECT (SELECT COUNT(*) FROM #orig) AS linhas_orig, (SELECT COUNT(*) FROM #v2) AS linhas_v2;
SELECT 'só na original' AS onde, * FROM (SELECT * FROM #orig EXCEPT SELECT * FROM #v2) d;  -- esperado: 0 linhas
SELECT 'só na v2'       AS onde, * FROM (SELECT * FROM #v2   EXCEPT SELECT * FROM #orig) d; -- esperado: 0 linhas
-- Repita trocando a coligada para 5 (regra especial com a coligada 6).
-- Obs.: diferença apenas na ORDEM dos itens de JS_Alocacoes_Ativas não é erro.

SET STATISTICS TIME, IO OFF;
*/


/* =====================================================================
   CHECAGENS DE APOIO
   ===================================================================== */
/*
-- a) Formato do CGCCFO dos CPFs na FCFO (valida a troca do REPLACE).
--    Se aparecer algo além de "so_digitos" e "mascara_cpf", me avise.
SELECT CASE
         WHEN cgccfo LIKE '[0-9][0-9][0-9].[0-9][0-9][0-9].[0-9][0-9][0-9]-[0-9][0-9]' THEN 'mascara_cpf'
         WHEN cgccfo NOT LIKE '%[^0-9]%' AND LEN(cgccfo) = 11 THEN 'so_digitos'
         WHEN LEN(REPLACE(REPLACE(cgccfo,'.',''),'-','')) = 11 THEN 'outro_formato_cpf'
         ELSE 'cnpj_ou_outro'
       END AS formato, COUNT(*) AS qtd
FROM dbo.fcfo WITH (NOLOCK)
GROUP BY CASE
         WHEN cgccfo LIKE '[0-9][0-9][0-9].[0-9][0-9][0-9].[0-9][0-9][0-9]-[0-9][0-9]' THEN 'mascara_cpf'
         WHEN cgccfo NOT LIKE '%[^0-9]%' AND LEN(cgccfo) = 11 THEN 'so_digitos'
         WHEN LEN(REPLACE(REPLACE(cgccfo,'.',''),'-','')) = 11 THEN 'outro_formato_cpf'
         ELSE 'cnpj_ou_outro'
       END;

-- b) Índices que a v2 espera existir (rodar no CORPORE_ERP)
--    SMATRICPL começando por (CODCOLIGADA, IDPERLET); SALUNO por CODPESSOA;
--    FCFO por CGCCFO.
SELECT OBJECT_NAME(i.object_id) AS tabela, i.name AS indice,
       STUFF((SELECT ', ' + c.name FROM sys.index_columns ic
              JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
              ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS colunas_chave
FROM sys.indexes i
WHERE i.object_id IN (OBJECT_ID('dbo.SMATRICPL'), OBJECT_ID('dbo.SALUNO'), OBJECT_ID('dbo.FCFO'))
  AND i.index_id > 0
ORDER BY tabela, i.index_id;
*/
