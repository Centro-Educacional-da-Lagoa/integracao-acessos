import { z } from 'zod'

export const AlunoTotvsSchema = z.object({
  /** Código da coligada */
  CD_Coligada: z.number(),

  /** Código da filial */
  CD_Filial: z.number().nullable().optional(),

  /** Código da pessoa no TOTVS */
  CD_Pessoa: z.string(),

  /** Registro Acadêmico — usado para montar o e-mail institucional */
  CD_Registro_Academico: z.string(),

  /** Nome completo do aluno — usado para criação da conta Google */
  NM_Aluno: z.string(),

  /** Data de nascimento — usada como senha inicial no Google (formato DDMMYYYY) */
  DT_Nascimento: z.string().nullable(),

  /** E-mail cadastrado na ficha da pessoa (PPESSOA.EMAIL) */
  TX_Email_Pessoa: z.string().nullable(),

  /** E-mail cadastrado no usuário do sistema (GUSUARIO.EMAIL) */
  TX_Email_Usuario: z.string().nullable(),

  /** Login do usuário no TOTVS (null = usuário ainda não criado) */
  CD_Usuario: z.string().nullable(),

  /** 1 = ativo, 0 = inativo, null = usuário não criado */
  IN_Usuario_Ativo: z.number().nullable(),

  /** 1 = possui matrícula regular ativa */
  IN_Existe_Matricula_Regular: z.number().int().min(0).max(1),

  /** 1 = matrícula regular inativa */
  IN_Inativo_Regular: z.number().int().min(0).max(1),

  /** 1 = a pessoa também é funcionário */
  IN_Funcionario: z.number().int().min(0).max(1),

  /** 1 = a pessoa também é responsável */
  IN_Responsavel: z.number().int().min(0).max(1),

  /** CPF sem máscara — obrigatório quando IN_Funcionario=1 ou IN_Responsavel=1 */
  CD_CPF: z.string().nullable(),
})

export type AlunoTotvsDto = z.infer<typeof AlunoTotvsSchema>
