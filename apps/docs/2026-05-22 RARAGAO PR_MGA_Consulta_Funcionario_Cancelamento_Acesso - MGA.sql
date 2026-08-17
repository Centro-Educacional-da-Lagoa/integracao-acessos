USE [CORPORE_ERP_MANUTENCAO]
GO

/*
  Consulta de funcionários elegíveis para revogação de acesso TOTVS.

  Regra principal:
  - situação funcional D = desligado

  Retorno simplificado:
  - dados base da pessoa/usuário
  - dados funcionais do vínculo encerrado
  - IN_Funcionario = 0
  - IN_Aluno
  - IN_Responsavel

  Exemplo:
  EXEC [dbo].[PR_MGA_Consulta_Funcionario_Cancelamento_Acesso] '2026', null, null, null
  EXEC [dbo].[PR_MGA_Consulta_Funcionario_Cancelamento_Acesso] '2026', 'MARIA', null, null
  EXEC [dbo].[PR_MGA_Consulta_Funcionario_Cancelamento_Acesso] '2026', null, 1, '000123'
*/

CREATE OR ALTER PROCEDURE [dbo].[PR_MGA_Consulta_Funcionario_Cancelamento_Acesso]
	( @prm_cd_periodo_letivo	varchar(20)
	, @prm_nm_funcionario		varchar(400) = null
	, @prm_cd_coligada			smallint = null
	, @prm_cd_chapa				varchar(30) = null
	)
AS
BEGIN

	set nocount on;

	declare @vr_nm_funcionario varchar(400)
	declare @vr_cd_chapa varchar(30)

	select @vr_nm_funcionario = nullif(upper(ltrim(rtrim(@prm_nm_funcionario))), '')
	select @vr_cd_chapa = nullif(ltrim(rtrim(@prm_cd_chapa)), '')

	if object_id('tempdb..#tmp_funcionario_base') is not null drop table #tmp_funcionario_base

	;with cte_funcionario_base as
	(
		select	 func.codcoligada													as CD_Coligada
				, func.codfilial													as CD_Filial
				, func.codpessoa													as CD_Pessoa
				, func.chapa														as CD_Matricula
				, nullif(replace(replace(replace(replace(ltrim(rtrim(pss.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '') as CD_CPF
				, upper(pss.nome)													as NM_Funcionario
				, pss.codusuario													as CD_Usuario
				, isnull(usr.status, 0)												as IN_Usuario_Ativo
				, pss.email															as TX_Email_Pessoa
				, usr.email															as TX_Email_Usuario
				, convert(varchar(10), pss.dtnascimento, 103)						as DT_Nascimento
				, convert(varchar(10), func.dataadmissao, 103)						as DT_Admissao
				, func.codsituacao													as CD_Situacao_Funcional
				, scao.codigo														as CD_Secao
				, scao.descricao													as NM_Secao
				, dpto.coddepartamento												as CD_Departamento
				, dpto.nome															as NM_Departamento
				, fcao.codigo														as CD_Funcao
				, fcao.nome															as NM_Funcao
				, pssc.ramal														as NR_Ramal
				, case
						when func.cotapcd is not null then 'PCD'
						when func.codtipo = 'Z' then 'JOVEM APRENDIZ'
						when func.codtipo = 'T' then 'ESTAGIARIO'
						when func.codcoligada = 1
						  and func.codsindicato = '01'
						  and func.codtipo in ('N', 'D') then 'ADMINISTRATIVO'
						when func.codcoligada in (3, 5, 8)
						  and func.codsindicato = '1'
						  and func.codtipo in ('N', 'D') then 'ADMINISTRATIVO'
						when func.codcoligada = 1
						  and func.codsindicato = '02'
						  and func.codtipo = 'N' then 'DOCENTE'
						when func.codcoligada in (3, 5, 8)
						  and func.codsindicato = '2'
						  and func.codtipo = 'N' then 'DOCENTE'
						else 'XXX'
				  end																as NM_Classificacao
				, row_number() over
					(
						partition by func.codcoligada, func.codfilial, func.codpessoa
						order by func.dataadmissao desc
								, func.chapa desc
					)																as NR_Linha
		from	dbo.pfunc															as func	with (nolock)
		inner	join dbo.ppessoa													as pss	with (nolock)
		  on	func.codpessoa = pss.codigo
		left	join dbo.psecao														as scao	with (nolock)
		  on	func.codcoligada = scao.codcoligada
		  and	func.codsecao = scao.codigo
		left	join dbo.gdepto														as dpto	with (nolock)
		  on	scao.codcoligada = dpto.codcoligada
		  and	scao.codfilial = dpto.codfilial
		  and	scao.coddepto = dpto.coddepartamento
		left	join dbo.pfuncao													as fcao	with (nolock)
		  on	func.codcoligada = fcao.codcoligada
		  and	func.codfuncao = fcao.codigo
		left	join dbo.gusuario													as usr	with (nolock)
		  on	pss.codusuario = usr.codusuario
		left	join dbo.vpcompl													as pssc	with (nolock)
		  on	pssc.codpessoa = pss.codigo
		where	func.codsituacao = 'D'
		  and	( @vr_nm_funcionario is null or upper(pss.nome) like '%' + @vr_nm_funcionario + '%' )
		  and	( @prm_cd_coligada is null or func.codcoligada = @prm_cd_coligada )
		  and	( @vr_cd_chapa is null or ltrim(rtrim(func.chapa)) = @vr_cd_chapa )
	)
	select	 CD_Coligada
			, CD_Filial
			, CD_Pessoa
			, CD_Matricula
			, CD_CPF
			, NM_Funcionario
			, CD_Usuario
			, IN_Usuario_Ativo
			, TX_Email_Pessoa
			, TX_Email_Usuario
			, DT_Nascimento
			, DT_Admissao
			, CD_Situacao_Funcional
			, CD_Secao
			, NM_Secao
			, CD_Departamento
			, NM_Departamento
			, CD_Funcao
			, NM_Funcao
			, NR_Ramal
			, NM_Classificacao
	into	#tmp_funcionario_base
	from	cte_funcionario_base
	where	NR_Linha = 1

	create clustered index IX_tmp_funcionario_base
		on #tmp_funcionario_base (CD_Pessoa, CD_Coligada, CD_Filial)

	select	 bas.CD_Coligada
			, bas.CD_Filial
			, cast(bas.CD_Pessoa as varchar(40))									as CD_Pessoa
			, bas.CD_Matricula
			, bas.CD_CPF
			, bas.NM_Funcionario
			, bas.CD_Usuario
			, bas.IN_Usuario_Ativo
			, bas.TX_Email_Pessoa
			, bas.TX_Email_Usuario
			, bas.DT_Nascimento
			, bas.DT_Admissao
			, bas.CD_Situacao_Funcional
			, bas.CD_Secao
			, bas.NM_Secao
			, bas.CD_Departamento
			, bas.NM_Departamento
			, bas.CD_Funcao
			, bas.NM_Funcao
			, bas.NR_Ramal
			, bas.NM_Classificacao
			, 0																	as IN_Funcionario
			, case
					when exists
						(
							select	1
							from	dbo.saluno													as aln	with (nolock)
							inner	join dbo.smatricpl											as mtpl	with (nolock)
							  on	aln.codcoligada = mtpl.codcoligada
							  and	aln.ra = mtpl.ra
							inner	join dbo.spletivo											as prlt	with (nolock)
							  on	mtpl.codcoligada = prlt.codcoligada
							  and	mtpl.idperlet = prlt.idperlet
							inner	join dbo.shabilitacaofilial									as hbfl	with (nolock)
							  on	mtpl.codcoligada = hbfl.codcoligada
							  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
							inner	join dbo.shabilitacao										as hblt	with (nolock)
							  on	hbfl.codcoligada = hblt.codcoligada
							  and	hbfl.codcurso = hblt.codcurso
							  and	hbfl.codhabilitacao = hblt.codhabilitacao
							inner	join dbo.sstatus											as stt	with (nolock)
							  on	mtpl.codcoligada = stt.codcoligada
							  and	mtpl.codstatus = stt.codstatus
							where	aln.codpessoa = bas.CD_Pessoa
							  and	prlt.codperlet = @prm_cd_periodo_letivo
							  and	stt.descricao not in ('Cancelado', 'Falecido', 'Pré-Matrícula Nula (Cancelado)')
							  and	hblt.complemento in ('EI', 'EF1', 'EF2', 'EM', 'CEX')
						) then 1
					else 0
			  end																as IN_Aluno
			, case
					when exists
						(
							select	1
							from	dbo.saluno													as alno	with (nolock)
							inner	join dbo.smatricpl											as mtpl	with (nolock)
							  on	alno.codcoligada = mtpl.codcoligada
							  and	alno.ra = mtpl.ra
							inner	join dbo.sstatus											as stt	with (nolock)
							  on	mtpl.codcoligada = stt.codcoligada
							  and	mtpl.codstatus = stt.codstatus
							inner	join dbo.spletivo											as prlt	with (nolock)
							  on	mtpl.codcoligada = prlt.codcoligada
							  and	mtpl.idperlet = prlt.idperlet
							inner	join dbo.shabilitacaofilial									as hbfl	with (nolock)
							  on	mtpl.codcoligada = hbfl.codcoligada
							  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
							inner	join dbo.shabilitacao										as hblt	with (nolock)
							  on	hbfl.codcoligada = hblt.codcoligada
							  and	hbfl.codcurso = hblt.codcurso
							  and	hbfl.codhabilitacao = hblt.codhabilitacao
							where	alno.codpessoaraca = bas.CD_Pessoa
							  and	prlt.codperlet = @prm_cd_periodo_letivo
							  and	stt.descricao not in ('Cancelado', 'Falecido', 'Pré-Matrícula Nula (Cancelado)')
							  and	hblt.complemento in ('EI', 'EF1', 'EF2', 'EM', 'CEX')
						)
						or exists
						(
							select	1
							from	dbo.vfiliacao												as alfi	with (nolock)
							inner	join dbo.saluno												as alno	with (nolock)
							  on	alfi.codpessoafilho = alno.codpessoa
							inner	join dbo.smatricpl											as mtpl	with (nolock)
							  on	alno.codcoligada = mtpl.codcoligada
							  and	alno.ra = mtpl.ra
							inner	join dbo.sstatus											as stt	with (nolock)
							  on	mtpl.codcoligada = stt.codcoligada
							  and	mtpl.codstatus = stt.codstatus
							inner	join dbo.spletivo											as prlt	with (nolock)
							  on	mtpl.codcoligada = prlt.codcoligada
							  and	mtpl.idperlet = prlt.idperlet
							inner	join dbo.shabilitacaofilial									as hbfl	with (nolock)
							  on	mtpl.codcoligada = hbfl.codcoligada
							  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
							inner	join dbo.shabilitacao										as hblt	with (nolock)
							  on	hbfl.codcoligada = hblt.codcoligada
							  and	hbfl.codcurso = hblt.codcurso
							  and	hbfl.codhabilitacao = hblt.codhabilitacao
							where	alfi.codpessoafiliacao = bas.CD_Pessoa
							  and	prlt.codperlet = @prm_cd_periodo_letivo
							  and	stt.descricao not in ('Cancelado', 'Falecido', 'Pré-Matrícula Nula (Cancelado)')
							  and	hblt.complemento in ('EI', 'EF1', 'EF2', 'EM', 'CEX')
						)
						or exists
						(
							select	1
							from	dbo.fcfo													as fcfo	with (nolock)
							inner	join dbo.saluno												as alno	with (nolock)
							  on	fcfo.codcfo = alno.codcfo
							inner	join dbo.smatricpl											as mtpl	with (nolock)
							  on	alno.codcoligada = mtpl.codcoligada
							  and	alno.ra = mtpl.ra
							inner	join dbo.sstatus											as stt	with (nolock)
							  on	mtpl.codcoligada = stt.codcoligada
							  and	mtpl.codstatus = stt.codstatus
							inner	join dbo.spletivo											as prlt	with (nolock)
							  on	mtpl.codcoligada = prlt.codcoligada
							  and	mtpl.idperlet = prlt.idperlet
							inner	join dbo.shabilitacaofilial									as hbfl	with (nolock)
							  on	mtpl.codcoligada = hbfl.codcoligada
							  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
							inner	join dbo.shabilitacao										as hblt	with (nolock)
							  on	hbfl.codcoligada = hblt.codcoligada
							  and	hbfl.codcurso = hblt.codcurso
							  and	hbfl.codhabilitacao = hblt.codhabilitacao
							where	nullif(replace(replace(replace(replace(ltrim(rtrim(fcfo.cgccfo)), '.', ''), '-', ''), '/', ''), ' ', ''), '') = bas.CD_CPF
							  and	prlt.codperlet = @prm_cd_periodo_letivo
							  and	stt.descricao not in ('Cancelado', 'Falecido', 'Pré-Matrícula Nula (Cancelado)')
							  and	hblt.complemento in ('EI', 'EF1', 'EF2', 'EM', 'CEX')
						) then 1
					else 0
			  end																as IN_Responsavel
	from	#tmp_funcionario_base												as bas
	order	by bas.CD_Coligada
			, bas.CD_Filial
			, bas.NM_Funcionario

END
GO
