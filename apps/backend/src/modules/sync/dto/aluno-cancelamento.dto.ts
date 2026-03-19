import { z } from 'zod'

export const OrigemDisparoSchema = z.enum(['BATCH', 'REPROCESSAMENTO'])

export const CancelamentoLoteSchema = z.object({
  CD_Periodo_Letivo: z.string().min(1),
  CD_Coligada: z.number().int(),
})

export const CancelamentoAlunoSchema = z.object({
  CD_Registro_Academico: z.string().min(1),
  CD_Coligada: z.number().int(),
  CD_Periodo_Letivo: z.string().min(1),
  TP_Origem_Disparo: OrigemDisparoSchema.default('REPROCESSAMENTO'),
})

export type CancelamentoLoteDto = z.infer<typeof CancelamentoLoteSchema>
export type CancelamentoAlunoDto = z.infer<typeof CancelamentoAlunoSchema>
