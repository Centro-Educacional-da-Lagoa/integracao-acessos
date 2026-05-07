USE [CORPORE_ERP_MANUTENCAO]
GO

	/*
	  Observacao importante:
	  Esta consulta utiliza como base a procedure de aluno cancelamento.
	  Garanta que a [PR_MGA_Consulta_Aluno_Cancelamento_Acesso] esteja sem filtro de debug fixo por RA.

	  Regra de coligada deste script:
	  - sempre considera 1 e 5;
	  - quando executa para 5, a procedure de aluno considera extra em 6.

	  Exemplo:
	  EXEC [dbo].[PR_MGA_Consulta_Responsavel_Cancelamento_Acesso] '2026', null, null
	  EXEC [dbo].[PR_MGA_Consulta_Responsavel_Cancelamento_Acesso] '2026', null, null, '2026100999'
	*/

CREATE OR ALTER PROCEDURE [dbo].[PR_MGA_Consulta_Responsavel_Cancelamento_Acesso]
	( @prm_cd_periodo_letivo	varchar(20)
	, @prm_cd_pessoa				int = null
	, @prm_cd_cpf					varchar(20) = null
	, @prm_cd_registro_academico	varchar(100) = null
	)
AS
BEGIN

	set nocount on;

	declare @vr_cd_cpf_filtro varchar(20)
	declare @vr_cd_registro_academico_filtro varchar(100)

	select @vr_cd_cpf_filtro = nullif(replace(replace(replace(replace(ltrim(rtrim(@prm_cd_cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '')
	select @vr_cd_registro_academico_filtro = nullif(ltrim(rtrim(@prm_cd_registro_academico)), '')

	if object_id('tempdb..#tmp_aluno_cancelado_base') is not null drop table #tmp_aluno_cancelado_base
	if object_id('tempdb..#tmp_resp_aluno') is not null drop table #tmp_resp_aluno
	if object_id('tempdb..#tmp_resp_disparo') is not null drop table #tmp_resp_disparo
	if object_id('tempdb..#tmp_resp_identidade') is not null drop table #tmp_resp_identidade
	if object_id('tempdb..#tmp_aluno_ativo_base') is not null drop table #tmp_aluno_ativo_base
	if object_id('tempdb..#tmp_ativo_aca') is not null drop table #tmp_ativo_aca
	if object_id('tempdb..#tmp_ativo_filiacao') is not null drop table #tmp_ativo_filiacao
	if object_id('tempdb..#tmp_ativo_fin') is not null drop table #tmp_ativo_fin
	if object_id('tempdb..#tmp_resp_bloqueado_ativo') is not null drop table #tmp_resp_bloqueado_ativo
	if object_id('tempdb..#tmp_resp_pessoa_aluno_ativo') is not null drop table #tmp_resp_pessoa_aluno_ativo

	create table #tmp_aluno_cancelado_base
	(
		CD_Coligada						smallint				not null
		, CD_Filial						smallint				null
		, ID_Perlet						int						null
		, CD_Periodo_Letivo				varchar(50) collate database_default	null
		, NM_Tipo_Matricula				varchar(50) collate database_default	null
		, CD_Registro_Academico			varchar(100) collate database_default	not null
		, CD_CPF							varchar(50) collate database_default	null
		, NM_Aluno						varchar(400) collate database_default	null
		, CD_Pessoa						int					not null
		, TX_Email_Pessoa				varchar(400) collate database_default	null
		, CD_Usuario						varchar(100) collate database_default	null
		, IN_Usuario_Ativo				int					null
		, TX_Email_Usuario				varchar(400) collate database_default	null
		, DT_Nascimento					varchar(20) collate database_default	null
		, IN_Existe_Matricula_Regular	int					not null
		, IN_Inativo_Regular			int					not null
		, IN_Existe_Matricula_Extra		int					not null
		, IN_Inativo_Extra				int					not null
		, IN_Funcionario				int					null
		, IN_Responsavel				int					null
	)

	insert into #tmp_aluno_cancelado_base
		( CD_Coligada
		, CD_Filial
		, ID_Perlet
		, CD_Periodo_Letivo
		, NM_Tipo_Matricula
		, CD_Registro_Academico
		, CD_CPF
		, NM_Aluno
		, CD_Pessoa
		, TX_Email_Pessoa
		, CD_Usuario
		, IN_Usuario_Ativo
		, TX_Email_Usuario
		, DT_Nascimento
		, IN_Existe_Matricula_Regular
		, IN_Inativo_Regular
		, IN_Existe_Matricula_Extra
		, IN_Inativo_Extra
		, IN_Funcionario
		, IN_Responsavel
		)
	exec [dbo].[PR_MGA_Consulta_Aluno_Cancelamento_Acesso]
		 @prm_cd_periodo_letivo = @prm_cd_periodo_letivo
		, @prm_cd_coligada = 1
		, @prm_cd_registro_academico = null

	insert into #tmp_aluno_cancelado_base
		( CD_Coligada
		, CD_Filial
		, ID_Perlet
		, CD_Periodo_Letivo
		, NM_Tipo_Matricula
		, CD_Registro_Academico
		, CD_CPF
		, NM_Aluno
		, CD_Pessoa
		, TX_Email_Pessoa
		, CD_Usuario
		, IN_Usuario_Ativo
		, TX_Email_Usuario
		, DT_Nascimento
		, IN_Existe_Matricula_Regular
		, IN_Inativo_Regular
		, IN_Existe_Matricula_Extra
		, IN_Inativo_Extra
		, IN_Funcionario
		, IN_Responsavel
		)
	exec [dbo].[PR_MGA_Consulta_Aluno_Cancelamento_Acesso]
		 @prm_cd_periodo_letivo = @prm_cd_periodo_letivo
		, @prm_cd_coligada = 5
		, @prm_cd_registro_academico = null


	create table #tmp_resp_aluno
	(
		CD_Coligada					smallint				not null
		, CD_Filial					smallint				null
		, CD_Pessoa_Aluno				int					not null
		, CD_Registro_Academico			varchar(100) collate database_default	not null
		, CD_Pessoa_Responsavel			int					null
		, CD_CPF_Responsavel			varchar(50) collate database_default	null
		, CD_Agregador_Responsavel		varchar(120) collate database_default	not null
		, TP_Vinculo						varchar(20) collate database_default	not null
		, IN_Existe_Matricula_Regular	int					not null
		, IN_Inativo_Regular			int					not null
		, IN_Existe_Matricula_Extra		int					not null
		, IN_Inativo_Extra				int					not null
	)

	/*
	  VINCULO: FILIACAO
	*/
	insert into #tmp_resp_aluno
		( CD_Coligada
		, CD_Filial
		, CD_Pessoa_Aluno
		, CD_Registro_Academico
		, CD_Pessoa_Responsavel
		, CD_CPF_Responsavel
		, CD_Agregador_Responsavel
		, TP_Vinculo
		, IN_Existe_Matricula_Regular
		, IN_Inativo_Regular
		, IN_Existe_Matricula_Extra
		, IN_Inativo_Extra
		)
	select	 case when acd.CD_Coligada = 6 then 5 else acd.CD_Coligada end as CD_Coligada
			, acd.CD_Filial
			, acd.CD_Pessoa
			, acd.CD_Registro_Academico
			, pfi.codigo as CD_Pessoa_Responsavel
			, nullif(replace(replace(replace(replace(ltrim(rtrim(pfi.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '') as CD_CPF_Responsavel
			, case
					when nullif(replace(replace(replace(replace(ltrim(rtrim(pfi.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '') is not null
					then 'CPF:' + nullif(replace(replace(replace(replace(ltrim(rtrim(pfi.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '')
					else 'PESSOA:' + cast(pfi.codigo as varchar(40))
			  end as CD_Agregador_Responsavel
			, 'FILIACAO' as TP_Vinculo
			, acd.IN_Existe_Matricula_Regular
			, acd.IN_Inativo_Regular
			, acd.IN_Existe_Matricula_Extra
			, acd.IN_Inativo_Extra
	from	#tmp_aluno_cancelado_base	as acd
	inner	join dbo.vfiliacao			as vfi (nolock)
	  on	vfi.codpessoafilho = acd.CD_Pessoa
	inner	join dbo.ppessoa			as pfi (nolock)
	  on	pfi.codigo = vfi.codpessoafiliacao

	/*
	  VINCULO: RESPONSAVEL ACADEMICO
	*/
	insert into #tmp_resp_aluno
		( CD_Coligada
		, CD_Filial
		, CD_Pessoa_Aluno
		, CD_Registro_Academico
		, CD_Pessoa_Responsavel
		, CD_CPF_Responsavel
		, CD_Agregador_Responsavel
		, TP_Vinculo
		, IN_Existe_Matricula_Regular
		, IN_Inativo_Regular
		, IN_Existe_Matricula_Extra
		, IN_Inativo_Extra
		)
	select	 case when acd.CD_Coligada = 6 then 5 else acd.CD_Coligada end as CD_Coligada
			, acd.CD_Filial
			, acd.CD_Pessoa
			, acd.CD_Registro_Academico
			, pra.codigo as CD_Pessoa_Responsavel
			, nullif(replace(replace(replace(replace(ltrim(rtrim(pra.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '') as CD_CPF_Responsavel
			, case
					when nullif(replace(replace(replace(replace(ltrim(rtrim(pra.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '') is not null
					then 'CPF:' + nullif(replace(replace(replace(replace(ltrim(rtrim(pra.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '')
					else 'PESSOA:' + cast(pra.codigo as varchar(40))
			  end as CD_Agregador_Responsavel
			, 'ACADEMICO' as TP_Vinculo
			, acd.IN_Existe_Matricula_Regular
			, acd.IN_Inativo_Regular
			, acd.IN_Existe_Matricula_Extra
			, acd.IN_Inativo_Extra
	from	#tmp_aluno_cancelado_base	as acd
	inner	join dbo.saluno				as aln (nolock)
	  on	aln.codcoligada = acd.CD_Coligada
	  and	aln.ra collate database_default = acd.CD_Registro_Academico collate database_default
	inner	join dbo.ppessoa			as pra (nolock)
	  on	pra.codigo = aln.codpessoaraca

	/*
	  VINCULO: RESPONSAVEL FINANCEIRO (por CPF do CFO)
	*/
	insert into #tmp_resp_aluno
		( CD_Coligada
		, CD_Filial
		, CD_Pessoa_Aluno
		, CD_Registro_Academico
		, CD_Pessoa_Responsavel
		, CD_CPF_Responsavel
		, CD_Agregador_Responsavel
		, TP_Vinculo
		, IN_Existe_Matricula_Regular
		, IN_Inativo_Regular
		, IN_Existe_Matricula_Extra
		, IN_Inativo_Extra
		)
	select	 case when acd.CD_Coligada = 6 then 5 else acd.CD_Coligada end as CD_Coligada
			, acd.CD_Filial
			, acd.CD_Pessoa
			, acd.CD_Registro_Academico
			, pfr.codigo as CD_Pessoa_Responsavel
			, cfo.CD_CPF_Responsavel
			, 'CPF:' + cfo.CD_CPF_Responsavel as CD_Agregador_Responsavel
			, 'FINANCEIRO' as TP_Vinculo
			, acd.IN_Existe_Matricula_Regular
			, acd.IN_Inativo_Regular
			, acd.IN_Existe_Matricula_Extra
			, acd.IN_Inativo_Extra
	from	#tmp_aluno_cancelado_base	as acd
	inner	join dbo.saluno				as aln (nolock)
	  on	aln.codcoligada = acd.CD_Coligada
	  and	aln.ra collate database_default = acd.CD_Registro_Academico collate database_default
	inner	join dbo.fcfo				as fcfo (nolock)
	  on	fcfo.codcfo = aln.codcfo
	cross	apply
		(
			select nullif(replace(replace(replace(replace(ltrim(rtrim(fcfo.cgccfo)), '.', ''), '-', ''), '/', ''), ' ', ''), '') as CD_CPF_Responsavel
		) as cfo
	left	join dbo.ppessoa			as pfr (nolock)
	  on	nullif(replace(replace(replace(replace(ltrim(rtrim(pfr.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '') collate database_default = cfo.CD_CPF_Responsavel collate database_default
	where	cfo.CD_CPF_Responsavel is not null

	create index IX_tmp_resp_aluno_agr on #tmp_resp_aluno (CD_Agregador_Responsavel)
	create index IX_tmp_resp_aluno_alu on #tmp_resp_aluno (CD_Coligada, CD_Filial, CD_Registro_Academico)
	create index IX_tmp_resp_aluno_aca on #tmp_resp_aluno (TP_Vinculo, CD_Pessoa_Responsavel, CD_Agregador_Responsavel)
	create index IX_tmp_resp_aluno_fin on #tmp_resp_aluno (TP_Vinculo, CD_CPF_Responsavel, CD_Agregador_Responsavel)

	/*
	  Filtro por matricula de entrada:
	  - a matricula serve apenas para descobrir os responsaveis do aluno;
	  - apos identificar os agregadores, mantem todas as linhas desses responsaveis
	    para avaliar demais alunos/coligadas/filiais antes de qualquer revogacao.
	*/
	create table #tmp_resp_disparo
	(
		CD_Agregador_Responsavel	varchar(120) collate database_default	not null
		, primary key (CD_Agregador_Responsavel)
	)

	if @vr_cd_registro_academico_filtro is not null
	begin
		insert into #tmp_resp_disparo
			( CD_Agregador_Responsavel )
		select	distinct rsa.CD_Agregador_Responsavel
		from	#tmp_resp_aluno as rsa
		where	rsa.CD_Registro_Academico collate database_default = @vr_cd_registro_academico_filtro collate database_default

		delete	rsa
		from	#tmp_resp_aluno as rsa
		where	not exists
				(
					select	1
					from	#tmp_resp_disparo as dsp
					where	dsp.CD_Agregador_Responsavel = rsa.CD_Agregador_Responsavel
				)
	end



	/*
	  Dedup por responsavel/aluno/tipo para evitar multiplicacao de linhas.
	*/
	;with cte as
	(
		select	 row_number() over
					(
						partition by CD_Coligada, CD_Filial, CD_Agregador_Responsavel, CD_Pessoa_Aluno, CD_Registro_Academico, TP_Vinculo
						order by CD_Pessoa_Responsavel desc
					) as nr_linha
				, *
		from	#tmp_resp_aluno
	)
	delete from cte where nr_linha > 1

	/*
	  Base de identidade por agregador:
	  - Se houver pessoa vinculada, usa menor codigo de pessoa como referencia.
	  - CPF permanece para filtro/merge.
	*/
	create table #tmp_resp_identidade
	(
		CD_Coligada				smallint		not null
		, CD_Filial				smallint		null
		, CD_Agregador_Responsavel	varchar(120) collate database_default	not null
		, CD_Pessoa_Responsavel		int			null
		, CD_CPF_Responsavel		varchar(50) collate database_default	null
	)

	insert into #tmp_resp_identidade
		( CD_Coligada
		, CD_Filial
		, CD_Agregador_Responsavel
		, CD_Pessoa_Responsavel
		, CD_CPF_Responsavel
		)
	select	 rsa.CD_Coligada
			, rsa.CD_Filial
			, rsa.CD_Agregador_Responsavel
			, min(rsa.CD_Pessoa_Responsavel) as CD_Pessoa_Responsavel
			, max(rsa.CD_CPF_Responsavel) as CD_CPF_Responsavel
	from	#tmp_resp_aluno as rsa
	group	by rsa.CD_Coligada
			, rsa.CD_Filial
			, rsa.CD_Agregador_Responsavel

	create unique clustered index IX_tmp_resp_identidade
		on #tmp_resp_identidade (CD_Coligada, CD_Filial, CD_Agregador_Responsavel)

	/*
	  Responsavel bloqueado:
	  Se possuir aluno com matricula ativa (regular ou extra) no periodo,
	  ele nao entra no retorno de cancelamento.
	*/
	create table #tmp_aluno_ativo_base
	(
		CD_Coligada			smallint	not null
		, CD_Filial				smallint	not null
		, CD_Pessoa_Aluno			int			not null
		, CD_Pessoa_Resp_Aca	int			null
		, CD_CodCfo				varchar(25) collate database_default null
	)

	insert into #tmp_aluno_ativo_base
		( CD_Coligada
		, CD_Filial
		, CD_Pessoa_Aluno
		, CD_Pessoa_Resp_Aca
		, CD_CodCfo
		)
	select	distinct
			case when mtpl.codcoligada = 6 then 5 else mtpl.codcoligada end as CD_Coligada
			, mtpl.codfilial as CD_Filial
			, alno.codpessoa
			, alno.codpessoaraca
			, alno.codcfo
	from	dbo.saluno						as alno (nolock)
	inner	join dbo.smatricpl				as mtpl (nolock)
	  on	alno.codcoligada = mtpl.codcoligada
	  and	alno.ra = mtpl.ra
	inner	join dbo.sstatus					as stt (nolock)
	  on	mtpl.codcoligada = stt.codcoligada
	  and	mtpl.codstatus = stt.codstatus
	inner	join dbo.spletivo				as prlt (nolock)
	  on	mtpl.codcoligada = prlt.codcoligada
	  and	mtpl.idperlet = prlt.idperlet
	inner	join dbo.shabilitacaofilial		as hbfl (nolock)
	  on	mtpl.codcoligada = hbfl.codcoligada
	  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
	inner	join dbo.shabilitacao				as hblt (nolock)
	  on	hbfl.codcoligada = hblt.codcoligada
	  and	hbfl.codcurso = hblt.codcurso
	  and	hbfl.codhabilitacao = hblt.codhabilitacao
	where	stt.descricao not in ('Cancelado', 'Falecido', 'Pré-Matrícula Nula (Cancelado)')
	  and	prlt.codperlet = @prm_cd_periodo_letivo
	  and	mtpl.codcoligada in (1, 5, 6)
	  and	hblt.complemento in ('EI', 'EF1', 'EF2', 'EM', 'CEX')

	create index IX_tmp_aluno_ativo_base_col on #tmp_aluno_ativo_base (CD_Coligada)
	create index IX_tmp_aluno_ativo_base_fil on #tmp_aluno_ativo_base (CD_Coligada, CD_Filial)
	create index IX_tmp_aluno_ativo_base_aluno on #tmp_aluno_ativo_base (CD_Pessoa_Aluno)
	create index IX_tmp_aluno_ativo_base_aca on #tmp_aluno_ativo_base (CD_Pessoa_Resp_Aca)
	create index IX_tmp_aluno_ativo_base_cfo on #tmp_aluno_ativo_base (CD_CodCfo)

	create table #tmp_ativo_aca
	(
		CD_Coligada				smallint	not null
		, CD_Filial				smallint	not null
		, CD_Pessoa_Responsavel	int			not null
		, primary key (CD_Coligada, CD_Filial, CD_Pessoa_Responsavel)
	)

	insert into #tmp_ativo_aca
		( CD_Coligada
		, CD_Filial
		, CD_Pessoa_Responsavel
		)
	select distinct atv.CD_Coligada
			, atv.CD_Filial
			, atv.CD_Pessoa_Resp_Aca
	from #tmp_aluno_ativo_base as atv
	where atv.CD_Pessoa_Resp_Aca is not null

	create table #tmp_ativo_filiacao
	(
		CD_Coligada				smallint	not null
		, CD_Filial				smallint	not null
		, CD_Pessoa_Responsavel	int			not null
		, primary key (CD_Coligada, CD_Filial, CD_Pessoa_Responsavel)
	)

	insert into #tmp_ativo_filiacao
		( CD_Coligada
		, CD_Filial
		, CD_Pessoa_Responsavel
		)
	select distinct atv.CD_Coligada
			, atv.CD_Filial
			, vfi.codpessoafiliacao
	from #tmp_aluno_ativo_base	as atv
	inner join dbo.vfiliacao		as vfi (nolock)
	  on vfi.codpessoafilho = atv.CD_Pessoa_Aluno

	create table #tmp_ativo_fin
	(
		CD_Coligada			smallint	not null
		, CD_Filial				smallint	not null
		, CD_CPF_Responsavel	varchar(50) collate database_default not null
		, primary key (CD_Coligada, CD_Filial, CD_CPF_Responsavel)
	)

	insert into #tmp_ativo_fin
		( CD_Coligada
		, CD_Filial
		, CD_CPF_Responsavel
		)
	select distinct atv.CD_Coligada
			, atv.CD_Filial
			, nullif(replace(replace(replace(replace(ltrim(rtrim(fcfo.cgccfo)), '.', ''), '-', ''), '/', ''), ' ', ''), '')
	from #tmp_aluno_ativo_base	as atv
	inner join dbo.fcfo			as fcfo (nolock)
	  on fcfo.codcfo collate database_default = atv.CD_CodCfo collate database_default
	where nullif(replace(replace(replace(replace(ltrim(rtrim(fcfo.cgccfo)), '.', ''), '-', ''), '/', ''), ' ', ''), '') is not null

	create table #tmp_resp_bloqueado_ativo
	(
		CD_Coligada				smallint	not null
		, CD_Filial				smallint	not null
		, CD_Agregador_Responsavel	varchar(120) collate database_default	not null
		, primary key (CD_Coligada, CD_Filial, CD_Agregador_Responsavel)
	)

	insert into #tmp_resp_bloqueado_ativo
		( CD_Coligada
		, CD_Filial
		, CD_Agregador_Responsavel
		)
	select distinct src.CD_Coligada
			, src.CD_Filial
			, src.CD_Agregador_Responsavel
	from
	(
		select rsa.CD_Coligada
				, rsa.CD_Filial
				, rsa.CD_Agregador_Responsavel
		from #tmp_resp_aluno			as rsa
		inner join #tmp_ativo_aca		as a
		  on rsa.TP_Vinculo = 'ACADEMICO'
		 and rsa.CD_Coligada = a.CD_Coligada
		 and rsa.CD_Filial = a.CD_Filial
		 and rsa.CD_Pessoa_Responsavel = a.CD_Pessoa_Responsavel

		union all

		select rsa.CD_Coligada
				, rsa.CD_Filial
				, rsa.CD_Agregador_Responsavel
		from #tmp_resp_aluno			as rsa
		inner join #tmp_ativo_filiacao			as f
		  on rsa.TP_Vinculo = 'FILIACAO'
		 and rsa.CD_Coligada = f.CD_Coligada
		 and rsa.CD_Filial = f.CD_Filial
		 and rsa.CD_Pessoa_Responsavel = f.CD_Pessoa_Responsavel

		union all

		select rsa.CD_Coligada
				, rsa.CD_Filial
				, rsa.CD_Agregador_Responsavel
		from #tmp_resp_aluno			as rsa
		inner join #tmp_ativo_fin		as fn
		  on rsa.TP_Vinculo = 'FINANCEIRO'
		 and rsa.CD_Coligada = fn.CD_Coligada
		 and rsa.CD_Filial = fn.CD_Filial
		 and rsa.CD_CPF_Responsavel collate database_default = fn.CD_CPF_Responsavel collate database_default
	) as src


	/*
	  Responsavel que tambem e aluno ativo no periodo letivo informado.
	  Regra:
	  - chave de partida: CD_Pessoa do responsavel
	  - status ativo: diferente de Cancelado/Falecido
	  - por coligada (1 e 5; 6 e normalizada para 5)
	*/
	create table #tmp_resp_pessoa_aluno_ativo
	(
		CD_Coligada				smallint	not null
		, CD_Filial_Aluno			smallint	not null
		, CD_Pessoa_Responsavel	int			not null
		, primary key (CD_Coligada, CD_Filial_Aluno, CD_Pessoa_Responsavel)
	)

	insert into #tmp_resp_pessoa_aluno_ativo
		( CD_Coligada
		, CD_Filial_Aluno
		, CD_Pessoa_Responsavel
		)
	select	distinct case when mtpl.codcoligada = 6 then 5 else mtpl.codcoligada end as CD_Coligada
			, mtpl.codfilial as CD_Filial_Aluno
			, alno.codpessoa
	from	dbo.saluno						as alno (nolock)
	inner	join dbo.smatricpl				as mtpl (nolock)
	  on	alno.codcoligada = mtpl.codcoligada
	  and	alno.ra = mtpl.ra
	inner	join dbo.sstatus					as stt (nolock)
	  on	mtpl.codcoligada = stt.codcoligada
	  and	mtpl.codstatus = stt.codstatus
	inner	join dbo.spletivo				as prlt (nolock)
	  on	mtpl.codcoligada = prlt.codcoligada
	  and	mtpl.idperlet = prlt.idperlet
	inner	join dbo.shabilitacaofilial		as hbfl (nolock)
	  on	mtpl.codcoligada = hbfl.codcoligada
	  and	mtpl.idhabilitacaofilial = hbfl.idhabilitacaofilial
	inner	join dbo.shabilitacao				as hblt (nolock)
	  on	hbfl.codcoligada = hblt.codcoligada
	  and	hbfl.codcurso = hblt.codcurso
	  and	hbfl.codhabilitacao = hblt.codhabilitacao
	where	stt.descricao not in ('Cancelado', 'Falecido')
	  and	prlt.codperlet = @prm_cd_periodo_letivo
	  and	mtpl.codcoligada in (1, 5, 6)
	  and	hblt.complemento in ('EI', 'EF1', 'EF2', 'EM', 'CEX')



	;with cte_resp as
	(
		select	 rid.CD_Coligada
				, rid.CD_Filial
				, rid.CD_Agregador_Responsavel
				, rid.CD_Pessoa_Responsavel
				, rid.CD_CPF_Responsavel
				, max(case when rsa.TP_Vinculo = 'FILIACAO' then 1 else 0 end) as IN_Filiacao
				, max(case when rsa.TP_Vinculo = 'ACADEMICO' then 1 else 0 end) as IN_Responsavel_Academico
				, max(case when rsa.TP_Vinculo = 'FINANCEIRO' then 1 else 0 end) as IN_Responsavel_Financeiro
				, max(rsa.IN_Existe_Matricula_Regular) as IN_Existe_Matricula_Regular
				, case
						when sum(rsa.IN_Existe_Matricula_Regular) = 0 then 0
						when sum(rsa.IN_Inativo_Regular) = sum(rsa.IN_Existe_Matricula_Regular) then 1
						else 0
				  end as IN_Inativo_Regular
				, max(rsa.IN_Existe_Matricula_Extra) as IN_Existe_Matricula_Extra
				, case
						when sum(rsa.IN_Existe_Matricula_Extra) = 0 then 0
						when sum(rsa.IN_Inativo_Extra) = sum(rsa.IN_Existe_Matricula_Extra) then 1
						else 0
				  end as IN_Inativo_Extra
		from	#tmp_resp_aluno				as rsa
		inner	join #tmp_resp_identidade	as rid
		  on	rid.CD_Coligada = rsa.CD_Coligada
		  and	isnull(rid.CD_Filial, 0) = isnull(rsa.CD_Filial, 0)
		  and	rid.CD_Agregador_Responsavel = rsa.CD_Agregador_Responsavel
		left	join #tmp_resp_bloqueado_ativo as blo
		  on	blo.CD_Coligada = rsa.CD_Coligada
		  and	blo.CD_Filial = isnull(rsa.CD_Filial, 0)
		  and	blo.CD_Agregador_Responsavel = rsa.CD_Agregador_Responsavel
		where	blo.CD_Agregador_Responsavel is null
		group	by rid.CD_Coligada
				, rid.CD_Filial
				, rid.CD_Agregador_Responsavel
				, rid.CD_Pessoa_Responsavel
				, rid.CD_CPF_Responsavel
	)
	select	 ctx.CD_Coligada
			, ctx.CD_Filial
			, case when alu.CD_Pessoa_Responsavel is not null then ctx.CD_Coligada else null end as CD_Coligada_Aluno
			, alu.CD_Filial_Aluno
			, @prm_cd_periodo_letivo as CD_Periodo_Letivo
			, cast(isnull(ctx.CD_Pessoa_Responsavel, pss.codigo) as varchar(20)) as CD_Pessoa
			, pss.codusuario as CD_Usuario
			, ctx.CD_CPF_Responsavel as CD_CPF
			, upper(coalesce(pss.nome, fcf.NM_Responsavel_Financeiro)) as NM_Responsavel
			, coalesce(pss.email, fcf.TX_Email_Responsavel_Financeiro) as TX_Email_Pessoa
			, usr.email as TX_Email_Usuario
			, convert(varchar(10), pss.dtnascimento, 103) as DT_Nascimento
			, isnull(usr.status, 0) as IN_Usuario_Ativo
			, ctx.IN_Existe_Matricula_Regular
			, ctx.IN_Inativo_Regular
			, ctx.IN_Existe_Matricula_Extra
			, ctx.IN_Inativo_Extra
			, case when func.codpessoa is not null then 1 else 0 end as IN_Funcionario
			, case when alu.CD_Pessoa_Responsavel is not null then 1 else 0 end as IN_Aluno
			, ctx.IN_Filiacao
			, ctx.IN_Responsavel_Academico
			, ctx.IN_Responsavel_Financeiro
	from	cte_resp					as ctx
	inner	join #tmp_resp_aluno			as rsa
	  on	rsa.CD_Coligada = ctx.CD_Coligada
	  and	isnull(rsa.CD_Filial, 0) = isnull(ctx.CD_Filial, 0)
	  and	rsa.CD_Agregador_Responsavel = ctx.CD_Agregador_Responsavel
	left	join dbo.ppessoa				as pss (nolock)
	  on	pss.codigo = ctx.CD_Pessoa_Responsavel
	  or	(
			ctx.CD_Pessoa_Responsavel is null
			and nullif(replace(replace(replace(replace(ltrim(rtrim(pss.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '') collate database_default = ctx.CD_CPF_Responsavel collate database_default
		 )
	left	join dbo.gusuario			as usr (nolock)
	  on	usr.codusuario = pss.codusuario
	left	join
		(
			select	 nullif(replace(replace(replace(replace(ltrim(rtrim(fcfo.cgccfo)), '.', ''), '-', ''), '/', ''), ' ', ''), '') collate database_default as CD_CPF_Responsavel
					, max(fcfo.nome) as NM_Responsavel_Financeiro
					, max(fcfo.email) as TX_Email_Responsavel_Financeiro
			from	dbo.fcfo as fcfo (nolock)
			group	by nullif(replace(replace(replace(replace(ltrim(rtrim(fcfo.cgccfo)), '.', ''), '-', ''), '/', ''), ' ', ''), '') collate database_default
		) as fcf
	  on	fcf.CD_CPF_Responsavel = ctx.CD_CPF_Responsavel collate database_default
	left	join dbo.pfunc				as func (nolock)
	  on	func.codpessoa = pss.codigo
	  and	func.codsituacao <> 'D'
	left	join #tmp_resp_pessoa_aluno_ativo	as alu
	  on	alu.CD_Coligada = ctx.CD_Coligada
	  and	alu.CD_Pessoa_Responsavel = ctx.CD_Pessoa_Responsavel
	where	( @prm_cd_pessoa is null or pss.codigo = @prm_cd_pessoa )
	  and	( @vr_cd_cpf_filtro is null or ctx.CD_CPF_Responsavel collate database_default = @vr_cd_cpf_filtro collate database_default )
	group	by ctx.CD_Coligada
			, ctx.CD_Filial
			, case when alu.CD_Pessoa_Responsavel is not null then ctx.CD_Coligada else null end
			, alu.CD_Filial_Aluno
			, isnull(ctx.CD_Pessoa_Responsavel, pss.codigo)
			, pss.codusuario
			, ctx.CD_CPF_Responsavel
			, upper(coalesce(pss.nome, fcf.NM_Responsavel_Financeiro))
			, coalesce(pss.email, fcf.TX_Email_Responsavel_Financeiro)
			, usr.email
			, convert(varchar(10), pss.dtnascimento, 103)
			, isnull(usr.status, 0)
			, ctx.IN_Existe_Matricula_Regular
			, ctx.IN_Inativo_Regular
			, ctx.IN_Existe_Matricula_Extra
			, ctx.IN_Inativo_Extra
			, case when func.codpessoa is not null then 1 else 0 end
			, case when alu.CD_Pessoa_Responsavel is not null then 1 else 0 end
			, ctx.IN_Filiacao
			, ctx.IN_Responsavel_Academico
			, ctx.IN_Responsavel_Financeiro
	order	by upper(coalesce(pss.nome, fcf.NM_Responsavel_Financeiro))

END;
GO
