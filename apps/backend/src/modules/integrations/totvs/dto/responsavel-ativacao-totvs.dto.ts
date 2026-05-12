import { z } from 'zod'

export const ResponsavelAtivacaoTotvsSchema = z.object({
  CD_Coligada: z.number(),
  CD_Filial: z.number().nullable().optional(),
  CD_Coligada_Aluno: z.number().nullable().optional(),
  CD_Filial_Aluno: z.number().nullable().optional(),
  CD_Periodo_Letivo: z.string().nullable().optional(),
  CD_Pessoa: z.string().nullable(),
  CD_Usuario: z.string().nullable(),
  CD_CPF: z.string().nullable(),
  NM_Responsavel: z.string(),
  TX_Email_Pessoa: z.string().nullable(),
  TX_Email_Usuario: z.string().nullable(),
  DT_Nascimento: z.string().nullable(),
  IN_Usuario_Ativo: z.number().nullable(),
  IN_Existe_Matricula_Regular: z.number().int().min(0).max(1),
  IN_Inativo_Regular: z.number().int().min(0).max(1),
  IN_Existe_Matricula_Extra: z.number().int().min(0).max(1),
  IN_Inativo_Extra: z.number().int().min(0).max(1),
  IN_Funcionario: z.number().int().min(0).max(1),
  IN_Aluno: z.number().int().min(0).max(1),
  IN_Filiacao: z.number().int().min(0).max(1),
  IN_Responsavel_Academico: z.number().int().min(0).max(1),
  IN_Responsavel_Financeiro: z.number().int().min(0).max(1),
})

export type ResponsavelAtivacaoTotvsDto = z.infer<
  typeof ResponsavelAtivacaoTotvsSchema
>
