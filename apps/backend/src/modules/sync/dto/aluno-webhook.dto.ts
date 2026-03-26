import { z } from 'zod'

export const WebhookAlunoSchema = z.object({
  CD_Registro_Academico: z.string().min(1),
  CD_Coligada: z.number().int().optional(),
  CD_Periodo_Letivo: z.string().min(1).optional(),
})

export type WebhookAlunoDto = z.infer<typeof WebhookAlunoSchema>
