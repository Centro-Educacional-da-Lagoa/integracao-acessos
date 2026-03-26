/**
 * Dados mínimos que qualquer integração (alunos, funcionários, responsáveis)
 * deve fornecer ao AccessProvisioningService.
 * Os processadores específicos mapeiam seus DTOs para esta interface.
 *
 * Uma mesma pessoa pode ter mais de um papel ativo simultaneamente
 * (ex: IN_Aluno=1 e IN_Funcionario=1). Os campos IN_* são independentes.
 */
export interface PessoaAcessoContext {
  /** Código da pessoa no TOTVS (PPESSOA.CODPESSOA) */
  CD_Pessoa: string

  /** Login do usuário atualmente atrelado à ficha da pessoa (null = sem usuário) */
  CD_Usuario: string | null

  /** CPF sem máscara — necessário quando IN_Funcionario=1 ou IN_Responsavel=1 */
  CD_CPF: string | null

  /** Identificador principal da entidade (RA para alunos, matrícula para funcionários) */
  CD_Identificador: string

  /** Nome completo */
  NM_Pessoa: string

  /** Data de nascimento no formato DD/MM/YYYY (usada como senha inicial) */
  DT_Nascimento: string | null

  /** E-mail cadastrado na ficha da pessoa */
  TX_Email_Pessoa: string | null

  /** E-mail cadastrado no usuário do sistema */
  TX_Email_Usuario: string | null

  /** Status do usuário de sistema no TOTVS (1 = ativo, 0 = inativo, null = não existe) */
  IN_Usuario_Ativo: number | null

  /** 1 = a pessoa é aluno — definido pelo processador da integração */
  IN_Aluno: number

  /** 1 = a pessoa também é funcionário */
  IN_Funcionario: number

  /** 1 = a pessoa também é responsável */
  IN_Responsavel: number

  /** 1 = possui matrícula regular ativa */
  IN_Existe_Matricula_Regular: number

  /** 1 = matrícula regular inativa */
  IN_Inativo_Regular: number

  IN_Existe_Matricula_Extra?: number

  /** 1 = inativação extra acadêmica */
  IN_Inativo_Extra: number

  /** Código da coligada */
  CD_Coligada: number

  /** Código da filial */
  CD_Filial?: number | null

  /** Domínio institucional configurado para a coligada */
  NM_Dominio_Email_Institucional: string

  /** E-mail institucional calculado pelo processador da integração */
  TX_Email_Institucional: string
}
