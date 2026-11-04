/* =====================================================================
   PR_MGA_Consulta_Responsavel_Ativacao_Acesso_v2  —  proposta de otimização
   ---------------------------------------------------------------------
   Pré-requisito: PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2 criada (com o
   bloco "0c" que aceita #pessoa_filtro_externo).

   Mesma assinatura, mesmas colunas e mesma ordenação da original.
   Criada como _v2 para comparar lado a lado (teste no fim do arquivo).

   POR QUE A ORIGINAL É TÃO CARA
   ---------------------------------------------------------------------
   Toda chamada — mesmo com RA, CPF ou pessoa — executa:
     EXEC PR_MGA_Consulta_Aluno_Ativacao_Acesso '2026', 1, NULL   (coligada 1 inteira)
     EXEC PR_MGA_Consulta_Aluno_Ativacao_Acesso '2026', 5, NULL   (coligada 5 inteira)
   e só no fim filtra. Eram exatamente as sessões "'2026', 1" de 270 s
   de CPU vistas no incidente de 04/11: cada webhook de responsável
   recalculava todos os alunos das duas coligadas.
   Além disso:
   - FINANCEIRO: LEFT JOIN PPESSOA por REPLACE(cpf) → PPESSOA inteira
     lida e transformada para cada linha.
   - SELECT final: derivada "fcf" agrupa a FCFO INTEIRA por CPF
     normalizado; e o JOIN com PPESSOA tem OR + REPLACE (varre PPESSOA).

   O QUE MUDA
   ---------------------------------------------------------------------
   1) Com filtro (RA, CPF ou pessoa), antes de chamar a de alunos:
        a. descobre os CPFs dos responsáveis-alvo
           (RA → filiação, responsável acadêmico e financeiro do aluno;
            CPF → o próprio; pessoa → CPF da pessoa);
        b. descobre TODOS os alunos ligados a esses CPFs (como filho,
           como aluno do responsável acadêmico, como aluno do financeiro)
           + as próprias pessoas responsáveis (para IN_Aluno);
        c. passa esse conjunto em #pessoa_filtro_externo → a de alunos
           calcula só eles.
      Mantém a regra "filtro por RA mantém todos os vínculos desses
      responsáveis no período". Os filtros finais da original seguem
      iguais, então a saída é a mesma.
   2) Sem filtro (carga completa): comportamento igual ao da original.
   3) PPESSOA/FCFO comparadas por CPF/CNPJ "puro" OU com máscara
      (000.000.000-00 / 00.000.000/0000-00), sem REPLACE na coluna,
      e a FCFO lida só para os CPFs que interessam.
      ⚠ Equivalente se CPF/CGCCFO estiverem só com dígitos ou na máscara
      padrão — confirme com as checagens no fim do arquivo.

   NÃO alterado de propósito (avaliar com o dono da regra):
   - FINANCEIRO liga FCFO só por CODCFO (sem CODCOLIGADA). Se o mesmo
     CODCFO existir em coligadas diferentes, pode trazer o responsável
     errado. Mantido para não mudar resultado.
   ===================================================================== */
CREATE OR ALTER PROCEDURE [dbo].[PR_MGA_Consulta_Responsavel_Ativacao_Acesso_v2]
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

	declare @tem_filtro bit =
		case when @vr_cd_registro_academico_filtro is not null
				or @vr_cd_cpf_filtro is not null
				or @prm_cd_pessoa is not null
			 then 1 else 0 end

	-- =========================================================================================
	-- 0. Com filtro: restringe o universo de alunos antes de chamar a procedure de alunos
	-- =========================================================================================
	if @tem_filtro = 1
	begin
		-- 0a. CPFs (ou CNPJs) dos responsáveis-alvo, só dígitos + máscara
		create table #cpf_alvo
		(
			CD_CPF			varchar(20) collate database_default	not null primary key
			, CD_CPF_Mask	varchar(20) collate database_default	null
		)

		create table #cpf_bruto ( CD_CPF varchar(20) collate database_default null )

		if @vr_cd_cpf_filtro is not null
			insert into #cpf_bruto values ( @vr_cd_cpf_filtro )

		if @prm_cd_pessoa is not null
			insert	into #cpf_bruto
			select	nullif(replace(replace(replace(replace(ltrim(rtrim(pss.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '')
			from	dbo.ppessoa as pss (nolock)
			where	pss.codigo = @prm_cd_pessoa

		-- alunos com o RA (coligadas usadas pela base: 1, 5 e 6 do Curso Extra); vazia sem filtro de RA
		create table #aluno_ra ( codcoligada smallint, ra varchar(100) collate database_default, codpessoa int, codpessoaraca int null, codcfo varchar(50) collate database_default null )

		if @vr_cd_registro_academico_filtro is not null
		begin
			insert	into #aluno_ra
			select	aln.codcoligada, aln.ra, aln.codpessoa, aln.codpessoaraca, aln.codcfo
			from	dbo.saluno as aln (nolock)
			where	aln.ra = @vr_cd_registro_academico_filtro
			  and	aln.codcoligada in ( 1, 5, 6 )

			-- FILIACAO
			insert	into #cpf_bruto
			select	nullif(replace(replace(replace(replace(ltrim(rtrim(pfi.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '')
			from	#aluno_ra as ar
			inner	join dbo.vfiliacao as vfi (nolock) on vfi.codpessoafilho = ar.codpessoa
			inner	join dbo.ppessoa   as pfi (nolock) on pfi.codigo = vfi.codpessoafiliacao

			-- ACADEMICO
			insert	into #cpf_bruto
			select	nullif(replace(replace(replace(replace(ltrim(rtrim(pra.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '')
			from	#aluno_ra as ar
			inner	join dbo.ppessoa as pra (nolock) on pra.codigo = ar.codpessoaraca
			where	ar.codpessoaraca is not null

			-- FINANCEIRO (mesma regra da original: FCFO só por CODCFO)
			insert	into #cpf_bruto
			select	nullif(replace(replace(replace(replace(ltrim(rtrim(fcfo.cgccfo)), '.', ''), '-', ''), '/', ''), ' ', ''), '')
			from	#aluno_ra as ar
			inner	join dbo.fcfo as fcfo (nolock) on fcfo.codcfo collate database_default = ar.codcfo collate database_default
		end

		insert	into #cpf_alvo ( CD_CPF, CD_CPF_Mask )
		select	distinct b.CD_CPF
				, case len(b.CD_CPF)
					when 11 then stuff(stuff(stuff(b.CD_CPF, 10, 0, '-'), 7, 0, '.'), 4, 0, '.')
					when 14 then stuff(stuff(stuff(stuff(b.CD_CPF, 13, 0, '-'), 9, 0, '/'), 6, 0, '.'), 3, 0, '.')
				  end
		from	#cpf_bruto as b
		where	b.CD_CPF is not null

		-- 0b. Pessoas que têm esses CPFs
		create table #resp_pessoa ( CD_Pessoa int not null primary key )

		insert	into #resp_pessoa ( CD_Pessoa )
		select	distinct pss.codigo
		from	#cpf_alvo as c
		inner	join dbo.ppessoa as pss (nolock)
		  on	pss.cpf in ( c.CD_CPF, c.CD_CPF_Mask )

		-- 0c. Alunos ligados a esses responsáveis (+ os próprios responsáveis, para IN_Aluno)
		create table #pessoa_filtro_externo ( CD_Pessoa int not null primary key )

		insert	into #pessoa_filtro_externo ( CD_Pessoa )
		select	CD_Pessoa from #resp_pessoa
		union
		select	vfi.codpessoafilho
		from	#resp_pessoa as rp
		inner	join dbo.vfiliacao as vfi (nolock) on vfi.codpessoafiliacao = rp.CD_Pessoa
		union
		select	aln.codpessoa
		from	#resp_pessoa as rp
		inner	join dbo.saluno as aln (nolock) on aln.codpessoaraca = rp.CD_Pessoa
		union
		select	aln.codpessoa
		from	#cpf_alvo as c
		inner	join dbo.fcfo   as fcfo (nolock) on fcfo.cgccfo in ( c.CD_CPF, c.CD_CPF_Mask )
		inner	join dbo.saluno as aln  (nolock) on aln.codcfo collate database_default = fcfo.codcfo collate database_default
		union
		select	ar.codpessoa
		from	#aluno_ra as ar		-- o próprio aluno do RA (vazia se o filtro não foi por RA)
	end

	-- =========================================================================================
	-- 1. Base de alunos ativos (restrita ao conjunto acima quando há filtro)
	--    A de alunos enxerga #pessoa_filtro_externo porque é chamada daqui.
	-- =========================================================================================
	create table #tmp_aluno_ativo_base
	(
		CD_Coligada						smallint				not null
		, CD_Filial						smallint				null
		, ID_Perlet						int						null
		, CD_Periodo_Letivo				varchar(50) collate database_default	null
		, NM_Tipo_Matricula				varchar(50) collate database_default	null
		, CD_Registro_Academico			varchar(100) collate database_default	not null
		, CD_CPF						varchar(50) collate database_default	null
		, NM_Aluno						varchar(400) collate database_default	null
		, CD_Pessoa						int						not null
		, TX_Email_Pessoa				varchar(400) collate database_default	null
		, CD_Usuario					varchar(100) collate database_default	null
		, IN_Usuario_Ativo				int						null
		, TX_Email_Usuario				varchar(400) collate database_default	null
		, DT_Nascimento					varchar(20) collate database_default	null
		, IN_Existe_Matricula_Regular	int						not null
		, IN_Inativo_Regular			int						not null
		, IN_Existe_Matricula_Extra		int						not null
		, IN_Inativo_Extra				int						not null
		, IN_Funcionario				int						null
		, IN_Responsavel				int						null
		, JS_Alocacoes_Ativas			varchar(max) collate database_default	null
	)

	insert into #tmp_aluno_ativo_base
	exec [dbo].[PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2]
		 @prm_cd_periodo_letivo = @prm_cd_periodo_letivo
		, @prm_cd_coligada = 1
		, @prm_cd_registro_academico = null

	insert into #tmp_aluno_ativo_base
	exec [dbo].[PR_MGA_Consulta_Aluno_Ativacao_Acesso_v2]
		 @prm_cd_periodo_letivo = @prm_cd_periodo_letivo
		, @prm_cd_coligada = 5
		, @prm_cd_registro_academico = null

	create index IX_tmp_aluno_ativo_base_alu on #tmp_aluno_ativo_base (CD_Coligada, CD_Filial, CD_Registro_Academico)
	create index IX_tmp_aluno_ativo_base_pes on #tmp_aluno_ativo_base (CD_Pessoa)

	-- =========================================================================================
	-- 2. Vínculos aluno x responsável (igual à original, exceto o JOIN do financeiro)
	-- =========================================================================================
	create table #tmp_resp_aluno
	(
		CD_Coligada					smallint				not null
		, CD_Filial					smallint				null
		, CD_Pessoa_Aluno			int						not null
		, CD_Registro_Academico		varchar(100) collate database_default	not null
		, CD_Pessoa_Responsavel		int						null
		, CD_CPF_Responsavel		varchar(50) collate database_default	null
		, CD_Agregador_Responsavel	varchar(120) collate database_default	not null
		, TP_Vinculo				varchar(20) collate database_default	not null
		, IN_Existe_Matricula_Regular	int					not null
		, IN_Inativo_Regular		int						not null
		, IN_Existe_Matricula_Extra	int						not null
		, IN_Inativo_Extra			int						not null
		, TP_Matricula				varchar(20) collate database_default	null
	)

	-- FILIACAO
	insert into #tmp_resp_aluno
	select	 atv.CD_Coligada, atv.CD_Filial, atv.CD_Pessoa, atv.CD_Registro_Academico
			, pfi.codigo
			, cpf.CD_CPF
			, 'CPF:' + cpf.CD_CPF
			, 'FILIACAO'
			, atv.IN_Existe_Matricula_Regular, atv.IN_Inativo_Regular
			, atv.IN_Existe_Matricula_Extra, atv.IN_Inativo_Extra
			, atv.NM_Tipo_Matricula
	from	#tmp_aluno_ativo_base	as atv
	inner	join dbo.vfiliacao		as vfi (nolock)
	  on	vfi.codpessoafilho = atv.CD_Pessoa
	inner	join dbo.ppessoa		as pfi (nolock)
	  on	pfi.codigo = vfi.codpessoafiliacao
	cross	apply ( select nullif(replace(replace(replace(replace(ltrim(rtrim(pfi.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '') as CD_CPF ) as cpf
	where	cpf.CD_CPF is not null

	-- ACADEMICO
	insert into #tmp_resp_aluno
	select	 atv.CD_Coligada, atv.CD_Filial, atv.CD_Pessoa, atv.CD_Registro_Academico
			, pra.codigo
			, cpf.CD_CPF
			, 'CPF:' + cpf.CD_CPF
			, 'ACADEMICO'
			, atv.IN_Existe_Matricula_Regular, atv.IN_Inativo_Regular
			, atv.IN_Existe_Matricula_Extra, atv.IN_Inativo_Extra
			, atv.NM_Tipo_Matricula
	from	#tmp_aluno_ativo_base	as atv
	inner	join dbo.saluno			as aln (nolock)
	  on	aln.codcoligada = atv.CD_Coligada
	  and	aln.ra collate database_default = atv.CD_Registro_Academico collate database_default
	inner	join dbo.ppessoa		as pra (nolock)
	  on	pra.codigo = aln.codpessoaraca
	cross	apply ( select nullif(replace(replace(replace(replace(ltrim(rtrim(pra.cpf)), '.', ''), '-', ''), '/', ''), ' ', ''), '') as CD_CPF ) as cpf
	where	aln.codpessoaraca is not null
	  and	cpf.CD_CPF is not null

	-- FINANCEIRO: PPESSOA por CPF puro ou mascarado (antes: REPLACE na PPESSOA inteira)
	insert into #tmp_resp_aluno
	select	 atv.CD_Coligada, atv.CD_Filial, atv.CD_Pessoa, atv.CD_Registro_Academico
			, pfr.codigo
			, cfo.CD_CPF_Responsavel
			, 'CPF:' + cfo.CD_CPF_Responsavel
			, 'FINANCEIRO'
			, atv.IN_Existe_Matricula_Regular, atv.IN_Inativo_Regular
			, atv.IN_Existe_Matricula_Extra, atv.IN_Inativo_Extra
			, atv.NM_Tipo_Matricula
	from	#tmp_aluno_ativo_base	as atv
	inner	join dbo.saluno			as aln (nolock)
	  on	aln.codcoligada = atv.CD_Coligada
	  and	aln.ra collate database_default = atv.CD_Registro_Academico collate database_default
	inner	join dbo.fcfo			as fcfo (nolock)
	  on	fcfo.codcfo collate database_default = aln.codcfo collate database_default
	cross	apply ( select nullif(replace(replace(replace(replace(ltrim(rtrim(fcfo.cgccfo)), '.', ''), '-', ''), '/', ''), ' ', ''), '') as CD_CPF_Responsavel ) as cfo
	cross	apply ( select case len(cfo.CD_CPF_Responsavel)
							when 11 then stuff(stuff(stuff(cfo.CD_CPF_Responsavel, 10, 0, '-'), 7, 0, '.'), 4, 0, '.')
						  end as CD_CPF_Mask ) as msk
	left	join dbo.ppessoa		as pfr (nolock)
	  on	pfr.cpf collate database_default in ( cfo.CD_CPF_Responsavel collate database_default, msk.CD_CPF_Mask collate database_default )
	where	cfo.CD_CPF_Responsavel is not null
	option	( recompile )

	create index IX_tmp_resp_aluno_agr on #tmp_resp_aluno (CD_Agregador_Responsavel)
	create index IX_tmp_resp_aluno_alu on #tmp_resp_aluno (CD_Coligada, CD_Filial, CD_Registro_Academico)

	-- =========================================================================================
	-- 3. Filtro por RA: mantém só os responsáveis do aluno (com todos os vínculos deles)
	-- =========================================================================================
	create table #tmp_resp_disparo
	(
		CD_Agregador_Responsavel	varchar(120) collate database_default	not null
		, primary key (CD_Agregador_Responsavel)
	)

	if @vr_cd_registro_academico_filtro is not null
	begin
		insert into #tmp_resp_disparo ( CD_Agregador_Responsavel )
		select	distinct rsa.CD_Agregador_Responsavel
		from	#tmp_resp_aluno as rsa
		where	rsa.CD_Registro_Academico collate database_default = @vr_cd_registro_academico_filtro collate database_default

		delete	rsa
		from	#tmp_resp_aluno as rsa
		where	not exists ( select 1 from #tmp_resp_disparo as dsp
							 where dsp.CD_Agregador_Responsavel = rsa.CD_Agregador_Responsavel )
	end

	;with cte as
	(
		select	 row_number() over
					( partition by CD_Coligada, CD_Filial, CD_Agregador_Responsavel, CD_Pessoa_Aluno, CD_Registro_Academico, TP_Vinculo
					  order by CD_Pessoa_Responsavel desc ) as nr_linha
				, *
		from	#tmp_resp_aluno
	)
	delete from cte where nr_linha > 1

	-- =========================================================================================
	-- 4. Identidade do responsável (igual à original)
	-- =========================================================================================
	create table #tmp_resp_identidade
	(
		CD_Coligada					smallint	not null
		, CD_Filial					smallint	null
		, CD_Agregador_Responsavel	varchar(120) collate database_default	not null
		, CD_Pessoa_Responsavel		int			null
		, CD_CPF_Responsavel		varchar(50) collate database_default	null
	)

	insert into #tmp_resp_identidade
	select	 rsa.CD_Coligada, rsa.CD_Filial, rsa.CD_Agregador_Responsavel
			, min(rsa.CD_Pessoa_Responsavel)
			, max(rsa.CD_CPF_Responsavel)
	from	#tmp_resp_aluno as rsa
	group	by rsa.CD_Coligada, rsa.CD_Filial, rsa.CD_Agregador_Responsavel

	create unique clustered index IX_tmp_resp_identidade
		on #tmp_resp_identidade (CD_Coligada, CD_Filial, CD_Agregador_Responsavel)

	create table #tmp_resp_pessoa_aluno_ativo
	(
		CD_Coligada				smallint	not null
		, CD_Filial_Aluno		smallint	not null
		, CD_Pessoa_Responsavel	int			not null
		, primary key (CD_Coligada, CD_Filial_Aluno, CD_Pessoa_Responsavel)
	)

	insert into #tmp_resp_pessoa_aluno_ativo
	select	distinct atv.CD_Coligada, atv.CD_Filial, atv.CD_Pessoa
	from	#tmp_aluno_ativo_base as atv

	-- =========================================================================================
	-- 5. FCFO só dos CPFs que interessam (antes: FCFO inteira agrupada a cada chamada)
	-- =========================================================================================
	create table #fcf
	(
		CD_CPF_Responsavel					varchar(50) collate database_default	not null primary key
		, NM_Responsavel_Financeiro			varchar(400) collate database_default	null
		, TX_Email_Responsavel_Financeiro	varchar(400) collate database_default	null
	)

	;with cpfs as
	(
		select	distinct rid.CD_CPF_Responsavel as CD_CPF
				, case len(rid.CD_CPF_Responsavel)
					when 11 then stuff(stuff(stuff(rid.CD_CPF_Responsavel, 10, 0, '-'), 7, 0, '.'), 4, 0, '.')
					when 14 then stuff(stuff(stuff(stuff(rid.CD_CPF_Responsavel, 13, 0, '-'), 9, 0, '/'), 6, 0, '.'), 3, 0, '.')
				  end as CD_CPF_Mask
		from	#tmp_resp_identidade as rid
		where	rid.CD_CPF_Responsavel is not null
	)
	insert	into #fcf
	select	c.CD_CPF, max(fcfo.nome), max(fcfo.email)
	from	cpfs as c
	inner	join dbo.fcfo as fcfo (nolock)
	  on	fcfo.cgccfo collate database_default in ( c.CD_CPF, c.CD_CPF_Mask )
	group	by c.CD_CPF
	option	( recompile )

	-- =========================================================================================
	-- 6. Resultado (mesmas colunas, filtros e ordem da original)
	-- =========================================================================================
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
				, 0 as IN_Inativo_Regular
				, max(rsa.IN_Existe_Matricula_Extra) as IN_Existe_Matricula_Extra
				, 0 as IN_Inativo_Extra
		from	#tmp_resp_aluno				as rsa
		inner	join #tmp_resp_identidade	as rid
		  on	rid.CD_Coligada = rsa.CD_Coligada
		  and	isnull(rid.CD_Filial, 0) = isnull(rsa.CD_Filial, 0)
		  and	rid.CD_Agregador_Responsavel = rsa.CD_Agregador_Responsavel
		group	by rid.CD_Coligada, rid.CD_Filial, rid.CD_Agregador_Responsavel
				, rid.CD_Pessoa_Responsavel, rid.CD_CPF_Responsavel
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
			, (
				select	distinct rsa2.CD_Coligada, rsa2.CD_Filial, rsa2.TP_Matricula
				from	#tmp_resp_aluno as rsa2
				where	rsa2.CD_Agregador_Responsavel = ctx.CD_Agregador_Responsavel
				for json path
			  ) as JS_Alocacoes_Ativas
	into	#resultado
	from	cte_resp as ctx
	-- PPESSOA: por código quando houver; senão por CPF puro/mascarado (antes: OR + REPLACE)
	outer	apply
		(
			select	p.codigo, p.codusuario, p.nome, p.email, p.dtnascimento
			from	dbo.ppessoa as p (nolock)
			where	ctx.CD_Pessoa_Responsavel is not null
			  and	p.codigo = ctx.CD_Pessoa_Responsavel
			union	all
			select	p.codigo, p.codusuario, p.nome, p.email, p.dtnascimento
			from	dbo.ppessoa as p (nolock)
			where	ctx.CD_Pessoa_Responsavel is null
			  and	p.cpf collate database_default in
					( ctx.CD_CPF_Responsavel collate database_default
					, case len(ctx.CD_CPF_Responsavel)
						when 11 then stuff(stuff(stuff(ctx.CD_CPF_Responsavel, 10, 0, '-'), 7, 0, '.'), 4, 0, '.')
					  end collate database_default )
		) as pss
	left	join dbo.gusuario as usr (nolock)
	  on	usr.codusuario = pss.codusuario
	left	join #fcf as fcf
	  on	fcf.CD_CPF_Responsavel = ctx.CD_CPF_Responsavel collate database_default
	left	join dbo.pfunc as func (nolock)
	  on	func.codpessoa = pss.codigo
	  and	func.codsituacao <> 'D'
	left	join #tmp_resp_pessoa_aluno_ativo as alu
	  on	alu.CD_Coligada = ctx.CD_Coligada
	  and	alu.CD_Pessoa_Responsavel = ctx.CD_Pessoa_Responsavel
	where	ctx.CD_CPF_Responsavel is not null
	  and	( @prm_cd_pessoa is null or pss.codigo = @prm_cd_pessoa )
	  and	( @vr_cd_cpf_filtro is null or ctx.CD_CPF_Responsavel collate database_default = @vr_cd_cpf_filtro collate database_default )
	option	( recompile )

	-- Saída. Se quem chama criou #saida_responsavel (ex.: teste lado a lado),
	-- grava lá — "INSERT ... EXEC" não pode ser aninhado e esta procedure já
	-- usa INSERT EXEC internamente. Sem a tabela, devolve o resultado normal.
	if object_id('tempdb..#saida_responsavel') is not null
		insert	into #saida_responsavel
		select	* from #resultado
	else
		select	* from #resultado
		order	by NM_Responsavel

END;
GO


/* =====================================================================
   TESTE LADO A LADO  (CORPORE_ERP, fora do pico)
   ---------------------------------------------------------------------
   "INSERT INTO ... EXEC" não funciona aqui (erro 8164): a procedure já
   usa INSERT EXEC por dentro. Por isso as duas versões gravam numa
   tabela #saida_responsavel criada antes do EXEC.

   PASSO A — cópia de teste da ORIGINAL (não altera a original):
     1. Gere o script da original (botão direito → Script → CREATE).
     2. Troque o nome para  [dbo].[PR_MGA_Consulta_Responsavel_Ativacao_Acesso_orig_teste]
     3. No SELECT final, troque a primeira linha
            select	 ctx.CD_Coligada
        por
            insert	into #saida_responsavel
            select	 ctx.CD_Coligada
        (o ORDER BY do final pode ficar.)
     4. Execute o CREATE.

   PASSO B — rode o bloco abaixo, trocando '<RA>' (depois repita com
   CPF e com pessoa). Esperado: contagens iguais e EXCEPT com 0 linhas.
   ===================================================================== */
/*
SET STATISTICS TIME ON;

DROP TABLE IF EXISTS #saida_responsavel, #r_orig, #r_v2;
CREATE TABLE #saida_responsavel (
    CD_Coligada smallint, CD_Filial smallint, CD_Coligada_Aluno smallint, CD_Filial_Aluno smallint,
    CD_Periodo_Letivo varchar(20), CD_Pessoa varchar(20), CD_Usuario nvarchar(100), CD_CPF varchar(50),
    NM_Responsavel nvarchar(400), TX_Email_Pessoa nvarchar(400), TX_Email_Usuario nvarchar(400),
    DT_Nascimento varchar(10), IN_Usuario_Ativo int,
    IN_Existe_Matricula_Regular int, IN_Inativo_Regular int, IN_Existe_Matricula_Extra int, IN_Inativo_Extra int,
    IN_Funcionario int, IN_Aluno int, IN_Filiacao int, IN_Responsavel_Academico int, IN_Responsavel_Financeiro int,
    JS_Alocacoes_Ativas nvarchar(max));

-- original (cópia de teste)
EXEC dbo.PR_MGA_Consulta_Responsavel_Ativacao_Acesso_orig_teste '2026', NULL, NULL, '<RA>';
SELECT * INTO #r_orig FROM #saida_responsavel;
TRUNCATE TABLE #saida_responsavel;

-- v2
EXEC dbo.PR_MGA_Consulta_Responsavel_Ativacao_Acesso_v2 '2026', NULL, NULL, '<RA>';
SELECT * INTO #r_v2 FROM #saida_responsavel;

SELECT (SELECT COUNT(*) FROM #r_orig) AS linhas_orig, (SELECT COUNT(*) FROM #r_v2) AS linhas_v2;
SELECT 'só na original' AS onde, * FROM (SELECT * FROM #r_orig EXCEPT SELECT * FROM #r_v2) d;
SELECT 'só na v2'       AS onde, * FROM (SELECT * FROM #r_v2   EXCEPT SELECT * FROM #r_orig) d;
-- Diferença só na ORDEM dos itens de JS_Alocacoes_Ativas não é erro.

SET STATISTICS TIME OFF;

-- Ao terminar:  DROP PROCEDURE dbo.PR_MGA_Consulta_Responsavel_Ativacao_Acesso_orig_teste;
*/


/* =====================================================================
   CHECAGENS DE APOIO
   ===================================================================== */
/*
-- a) Formato do CPF na PPESSOA (valida a troca do REPLACE).
--    Esperado: só "so_digitos" e/ou "mascara_cpf" (e "vazio").
SELECT CASE
         WHEN cpf IS NULL OR LTRIM(RTRIM(cpf)) = '' THEN 'vazio'
         WHEN cpf LIKE '[0-9][0-9][0-9].[0-9][0-9][0-9].[0-9][0-9][0-9]-[0-9][0-9]' THEN 'mascara_cpf'
         WHEN cpf NOT LIKE '%[^0-9]%' THEN 'so_digitos'
         ELSE 'outro'
       END AS formato, COUNT(*) AS qtd
FROM dbo.ppessoa WITH (NOLOCK)
GROUP BY CASE
         WHEN cpf IS NULL OR LTRIM(RTRIM(cpf)) = '' THEN 'vazio'
         WHEN cpf LIKE '[0-9][0-9][0-9].[0-9][0-9][0-9].[0-9][0-9][0-9]-[0-9][0-9]' THEN 'mascara_cpf'
         WHEN cpf NOT LIKE '%[^0-9]%' THEN 'so_digitos'
         ELSE 'outro'
       END;

-- b) Formato do CGCCFO na FCFO (inclui CNPJ, usado no financeiro).
SELECT CASE
         WHEN cgccfo IS NULL OR LTRIM(RTRIM(cgccfo)) = '' THEN 'vazio'
         WHEN cgccfo LIKE '[0-9][0-9][0-9].[0-9][0-9][0-9].[0-9][0-9][0-9]-[0-9][0-9]' THEN 'mascara_cpf'
         WHEN cgccfo LIKE '[0-9][0-9].[0-9][0-9][0-9].[0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]-[0-9][0-9]' THEN 'mascara_cnpj'
         WHEN cgccfo NOT LIKE '%[^0-9]%' THEN 'so_digitos'
         ELSE 'outro'
       END AS formato, COUNT(*) AS qtd
FROM dbo.fcfo WITH (NOLOCK)
GROUP BY CASE
         WHEN cgccfo IS NULL OR LTRIM(RTRIM(cgccfo)) = '' THEN 'vazio'
         WHEN cgccfo LIKE '[0-9][0-9][0-9].[0-9][0-9][0-9].[0-9][0-9][0-9]-[0-9][0-9]' THEN 'mascara_cpf'
         WHEN cgccfo LIKE '[0-9][0-9].[0-9][0-9][0-9].[0-9][0-9][0-9]/[0-9][0-9][0-9][0-9]-[0-9][0-9]' THEN 'mascara_cnpj'
         WHEN cgccfo NOT LIKE '%[^0-9]%' THEN 'so_digitos'
         ELSE 'outro'
       END;

-- c) Índices usados pela v2: PPESSOA(CPF), FCFO(CGCCFO), SALUNO(CODCFO),
--    SALUNO(CODPESSOARACA), VFILIACAO(CODPESSOAFILIACAO / CODPESSOAFILHO).
SELECT OBJECT_NAME(i.object_id) AS tabela, i.name AS indice,
       STUFF((SELECT ', ' + c.name FROM sys.index_columns ic
              JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
              WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
              ORDER BY ic.key_ordinal FOR XML PATH('')), 1, 2, '') AS colunas_chave
FROM sys.indexes i
WHERE i.object_id IN (OBJECT_ID('dbo.PPESSOA'), OBJECT_ID('dbo.FCFO'), OBJECT_ID('dbo.SALUNO'))
  AND i.index_id > 0
ORDER BY tabela, i.index_id;
-- VFILIACAO é view: confira os índices da tabela base dela.
*/
