USE [BD_SINERGIA]
GO
/****** Object:  StoredProcedure [dbo].[PR_MGA_Buscar_Funcionarios_Ativos]    Script Date: 5/21/2026 4:03:47 PM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE [dbo].[PR_MGA_Buscar_Funcionarios_Ativos]
(
	@prm_tx_email					[TD_NM_80] = null
)
AS
BEGIN
	 
select distinct	pss.codusuario													as CD_Usuario
				, pss.nome														as NM_Usuario
				, pss.email														as TX_Email
				, pss.cpf														as CD_Cpf
				, convert(varchar(10), pss.dtnascimento, 103)					as DT_Nascimento
				, scao.CODIGO													as CD_Secao
				, scao.descricao												as NM_Secao
				, dpto.coddepartamento											as CD_Departamento
				, dpto.nome														as NM_Departamento
				, fcao.codigo													as CD_Funcao
				, fcao.nome														as NM_Funcao
				, pssc.ramal													as NR_Ramal
				,	case 
				when	func.cotapcd is not null			then 'PCD'
				when	func.codtipo = 'Z'					then 'JOVEM APRENDIZ'
				when	func.codtipo = 'T'					then 'ESTAGIÁRIO'
				when	func.codcoligada = 1
				  and	func.codsindicato = '01'
				  and	func.codtipo in ('N', 'D')			then 'ADMINISTRATIVO'
				when	func.codcoligada in ( 3, 5, 8 )
				  and	func.codsindicato = '1' 
				  and	func.codtipo in ('N', 'D')			then 'ADMINISTRATIVO'
				when	func.codcoligada = 1
				  and	func.codsindicato = '02'
				  and	func.codtipo = 'N'					then 'DOCENTE'
				when	func.codcoligada in ( 3, 5, 8 )
				  and	func.codsindicato = '2' 
				  and	func.codtipo = 'N'					then 'DOCENTE'
				else	'XXX'
			end																	as NM_Classificacao
from	corpore_erp.dbo.pfunc		as func (nolock)
inner	join	corpore_erp.dbo.ppessoa						as pss (nolock)
  on	func.codpessoa = pss.codigo
inner	join	corpore_erp.dbo.psecao				as scao	(nolock)
  on	func.codcoligada = scao.codcoligada
  and	func.codsecao = scao.codigo
inner	join	corpore_erp.dbo.gdepto				as dpto	(nolock)
  on	scao.codcoligada = dpto.codcoligada
  and	scao.codfilial = dpto.codfilial
  and	scao.coddepto = dpto.coddepartamento
inner	join	corpore_erp.dbo.pfuncao				as fcao	(nolock)
  on	func.codcoligada = fcao.codcoligada
  and	func.codfuncao = fcao.codigo
inner	join	corpore_erp.dbo.gusuario					as gusr (nolock)
	on	pss.codusuario = gusr.codusuario
left	join corpore_erp.dbo.vpcompl							as pssc (nolock)
   on	pssc.codpessoa = pss.codigo
where	pss.funcionario = 1
  and	(
			func.codsituacao in ('A') 
			or
			(
			func.codsituacao = 'Z' and GETDATE() > func.dataadmissao
			)
		)

END;
