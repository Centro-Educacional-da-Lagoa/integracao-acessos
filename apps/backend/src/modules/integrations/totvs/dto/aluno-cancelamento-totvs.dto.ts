import { z } from 'zod'

export const AlunoCancelamentoTotvsSchema = z.object({
  CD_Coligada: z.number(),
  CD_Periodo_Letivo: z.string().nullable().optional(),
  CD_Pessoa: z.string(),
  CD_Registro_Academico: z.string(),
  CD_Usuario: z.string().nullable(),
  CD_CPF: z.string().nullable(),
  NM_Aluno: z.string(),
  TX_Email_Pessoa: z.string().nullable(),
  TX_Email_Usuario: z.string().nullable(),
  DT_Nascimento: z.string().nullable(),
  IN_Usuario_Ativo: z.number().nullable(),
  IN_Existe_Matricula_Regular: z.number().int().min(0).max(1),
  IN_Inativo_Regular: z.number().int().min(0).max(1),
  IN_Inativo_Extra: z.number().int().min(0).max(1),
  IN_Funcionario: z.number().int().min(0).max(1),
  IN_Responsavel: z.number().int().min(0).max(1),
})

export type AlunoCancelamentoTotvsDto = z.infer<
  typeof AlunoCancelamentoTotvsSchema
>
