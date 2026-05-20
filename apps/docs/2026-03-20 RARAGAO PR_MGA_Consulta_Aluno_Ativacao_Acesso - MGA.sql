USE [CORPORE_ERP_MANUTENCAO]
GO

--EXEC [dbo].[PR_MGA_Consulta_Aluno_Ativacao_Acesso] '2026', 1


CREATE OR ALTER PROCEDURE [dbo].[PR_MGA_Consulta_Aluno_Ativacao_Acesso]
	( @prm_cd_periodo_letivo	varchar(20)
	, @prm_cd_coligada			smallint
	, @prm_cd_registro_academico varchar(20) = null
	)
AS
BEGIN

	/*
	drop table #tmp_aluno_ativo
	*/

--declare @prm_cd_periodo_letivo	varchar(20) = '2026'
--declare @prm_cd_coligada			smallint     = 5

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
	from	dbo.smatricpl							as mtpl	with (nolock)
	inner	join dbo.spletivo						as prlt	with (nolock)
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
	  and	mtpl.codcoligada = @prm_cd_coligada
	  and	prlt.codperlet = @prm_cd_periodo_letivo

	create clustered index IX_tmp_aluno_ativo
		on #tmp_aluno_ativo ( CD_Coligada, CD_Registro_Academico )

	create index IX_tmp_aluno_ativo_CD_Pessoa
		on #tmp_aluno_ativo ( CD_Pessoa, CD_Periodo_Letivo )

	-- =========================================================================================
	-- 2. Alunos com Matrícula ATIVA SOMENTE no Curso Extra
	-- =========================================================================================
	insert into #tmp_aluno_ativo
	select	 mtpl.codcoligada
			, mtpl.idperlet
			, prlt.codperlet
			, mtpl.codfilial
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
			, 0 as IN_Existe_Matricula_Regular
			, 1 as IN_Inativo_Regular
			, 1 as IN_Existe_Matricula_Extra
			, 0 as IN_Inativo_Extra
	from	dbo.smatricpl							as mtpl	with (nolock)
	inner	join dbo.spletivo						as prlt	with (nolock)
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
	where	(
				( @prm_cd_coligada <> 5 and aln.codcoligada = @prm_cd_coligada )
				or
				( @prm_cd_coligada = 5 and aln.codcoligada = 6 )
			)
	  and	prlt.codperlet = @prm_cd_periodo_letivo
	  and	hblt.complemento = 'CEX'
	  and	stt.descricao = 'Ativo'
	  and	not exists
			(
				select	1
				from	#tmp_aluno_ativo				as tmp
				where	(
							( @prm_cd_coligada <> 5
							  and tmp.CD_Registro_Academico = aln.ra
							  and tmp.CD_Coligada = @prm_cd_coligada
							)
							or
							( @prm_cd_coligada = 5
							  and tmp.CD_Pessoa = aln.codpessoa
							)
						)
			)

	create table #tmp_cex
	(
		CD_Registro_Academico			varchar(50) collate database_default		null
		, CD_Pessoa						int											null
		, CD_Periodo_Letivo				varchar(20) collate database_default		not null
		, QT_Matricula_Extra			int											not null
	)

	if @prm_cd_coligada <> 5
	begin

		insert	into #tmp_cex
			( CD_Registro_Academico
			, CD_Pessoa
			, CD_Periodo_Letivo
			, QT_Matricula_Extra
			)
		select	 mtpl.ra								as CD_Registro_Academico
				, null									as CD_Pessoa
				, prlt.codperlet						as CD_Periodo_Letivo
				, count(*)								as QT_Matricula_Extra
		from	dbo.smatricpl							as mtpl	with (nolock)
		inner	join dbo.saluno							as aln		with (nolock)
		  on	mtpl.codcoligada = aln.codcoligada
		  and	mtpl.ra = aln.ra
		inner	join dbo.spletivo						as prlt	with (nolock)
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
		where	prlt.codperlet = @prm_cd_periodo_letivo
		  and	hblt.complemento = 'CEX'
		  and	stt.descricao = 'Ativo'
		  and	mtpl.codcoligada = @prm_cd_coligada
		group	by mtpl.ra
				, prlt.codperlet

		create clustered index IX_tmp_cex
			on #tmp_cex ( CD_Registro_Academico, CD_Periodo_Letivo )

		update	tmp
		   set	 tmp.IN_Existe_Matricula_Extra =
					case
						when isnull(cex.QT_Matricula_Extra, 0) > 0 then 1
						else 0
					end
				, tmp.IN_Inativo_Extra =
					case
						when isnull(cex.QT_Matricula_Extra, 0) > 0 then 0
						else 1
					end
		from	#tmp_aluno_ativo						as tmp
		left	join #tmp_cex							as cex
		  on	tmp.CD_Registro_Academico = cex.CD_Registro_Academico
		  and	tmp.CD_Periodo_Letivo = cex.CD_Periodo_Letivo
		where	tmp.NM_Tipo_Matricula = 'REGULAR'

	end
	else
	begin

		insert	into #tmp_cex
			( CD_Registro_Academico
			, CD_Pessoa
			, CD_Periodo_Letivo
			, QT_Matricula_Extra
			)
		select	 null									as CD_Registro_Academico
				, aln.codpessoa							as CD_Pessoa
				, prlt.codperlet						as CD_Periodo_Letivo
				, count(*)								as QT_Matricula_Extra
		from	dbo.smatricpl							as mtpl	with (nolock)
		inner	join dbo.saluno							as aln		with (nolock)
		  on	mtpl.codcoligada = aln.codcoligada
		  and	mtpl.ra = aln.ra
		inner	join dbo.spletivo						as prlt	with (nolock)
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
		where	prlt.codperlet = @prm_cd_periodo_letivo
		  and	hblt.complemento = 'CEX'
		  and	stt.descricao = 'Ativo'
		  and	mtpl.codcoligada = 6
		group	by aln.codpessoa
				, prlt.codperlet

		create clustered index IX_tmp_cex
			on #tmp_cex ( CD_Pessoa, CD_Periodo_Letivo )

		update	tmp
		   set	 tmp.IN_Existe_Matricula_Extra =
					case
						when isnull(cex.QT_Matricula_Extra, 0) > 0 then 1
						else 0
					end
				, tmp.IN_Inativo_Extra =
					case
						when isnull(cex.QT_Matricula_Extra, 0) > 0 then 0
						else 0
					end
		from	#tmp_aluno_ativo						as tmp
		left	join #tmp_cex							as cex
		  on	tmp.CD_Pessoa = cex.CD_Pessoa
		  and	tmp.CD_Periodo_Letivo = cex.CD_Periodo_Letivo
		where	tmp.NM_Tipo_Matricula = 'REGULAR'

	end

	drop table #tmp_cex

	select	tmp.*
			, case
					when func.codpessoa is not null then 1
					else 0
			  end				as IN_Funcionario
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
								inner	join dbo.spletivo					as prlt	with (nolock)
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
								  and	(
											(alno.ra <> tmp.CD_Registro_Academico)
											or
											(alno.ra = tmp.CD_Registro_Academico and alno.codcoligada = tmp.CD_Coligada)
										)
								  and	stt.descricao not in ( 'Cancelado', 'Falecido' )
								  and	prlt.codperlet = @prm_cd_periodo_letivo
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
								inner	join dbo.spletivo					as prlt	with (nolock)
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
								  and	(
											(alno.ra <> tmp.CD_Registro_Academico)
											or
											(alno.ra = tmp.CD_Registro_Academico and alno.codcoligada = tmp.CD_Coligada)
										)
								  and	stt.descricao not in ( 'Cancelado', 'Falecido' )
								  and	prlt.codperlet = @prm_cd_periodo_letivo
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
								inner	join dbo.spletivo					as prlt	with (nolock)
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
								  and	(
											(alno.ra <> tmp.CD_Registro_Academico)
											or
											(alno.ra = tmp.CD_Registro_Academico and alno.codcoligada = tmp.CD_Coligada)
										)
								  and	stt.descricao not in ( 'Cancelado', 'Falecido' )
								  and	prlt.codperlet = @prm_cd_periodo_letivo
							) then 1
							  else 0
			  end				as IN_Responsavel
	from	#tmp_aluno_ativo						as tmp	with (nolock)
	left	join dbo.pfunc							as func	with (nolock)
	  on	tmp.CD_Pessoa = func.codpessoa
	  and	func.codsituacao <> 'D'
	left	join dbo.fcfo							as fcfo	with (nolock)
	  on	replace(replace(fcfo.cgccfo, '.', ''), '-', '') = tmp.CD_CPF
	--where	( @prm_cd_registro_academico is null or @prm_cd_registro_academico = tmp.cd_registro_academico)
	where	tmp.CD_Registro_Academico = '2026100999'

END