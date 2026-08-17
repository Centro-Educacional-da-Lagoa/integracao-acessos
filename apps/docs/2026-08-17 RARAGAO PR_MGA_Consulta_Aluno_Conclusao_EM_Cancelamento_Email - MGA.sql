USE [CORPORE_ERP_MANUTENCAO]
GO

--EXEC [dbo].[PR_MGA_Consulta_Aluno_Conclusao_EM_Cancelamento_Email] '2025', 1

CREATE OR ALTER PROCEDURE [dbo].[PR_MGA_Consulta_Aluno_Conclusao_EM_Cancelamento_Email]
	( @prm_cd_periodo_letivo_anterior varchar(20)
	, @prm_cd_coligada smallint
	, @prm_cd_registro_academico varchar(20) = null
	)
AS
BEGIN

declare	@vr_dt_libera_cancelamento_email date

select	@vr_dt_libera_cancelamento_email = dateadd(month, 6, datefromparts(cast(@prm_cd_periodo_letivo_anterior as int), 12, 31))

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
		, 1										as IN_Inativo_Regular
		, 0										as IN_Existe_Matricula_Extra
		, 0										as IN_Inativo_Extra
		, cast(null as varchar(max))				as JS_Alocacoes_Ativas
		, case
				when exists
						(
							select	1
							from	dbo.pfunc as func with (nolock)
							where	func.codpessoa = pss.codigo
							  and	func.codsituacao <> 'D'
						) then 1
				else 0
		  end									as IN_Funcionario
		, 0										as IN_Responsavel
		, 1										as IN_Cancela_Email
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
where	mtpl.codcoligada = @prm_cd_coligada
  and	prlt.codperlet = @prm_cd_periodo_letivo_anterior
  and	hblt.complemento = 'EM'
  and	mtpl.codstatusres = 5
  and	hblt.codhabilitacao = '3S2'
  and	stt.descricao = 'Ativo'
  and	cast(getdate() as date) >= @vr_dt_libera_cancelamento_email
  and	( @prm_cd_registro_academico is null or @prm_cd_registro_academico = mtpl.ra )

END;
