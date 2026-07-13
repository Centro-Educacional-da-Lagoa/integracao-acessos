import { z } from 'zod'
import { normalizeColigadaId } from '../utils/coligadas-config'

export const WebhookAlunoSchema = z.object({
  CD_Registro_Academico: z.string().min(1),
  CD_Coligada: z.preprocess(
    (value) =>
      typeof value === 'number' && Number.isInteger(value)
        ? normalizeColigadaId(value)
        : value,
    z.number().int().optional(),
  ),
  CD_Periodo_Letivo: z.preprocess(
    (value) => (value === '' ? null : value),
    z.string().nullable().optional(),
  ),
})

export type WebhookAlunoDto = z.infer<typeof WebhookAlunoSchema>
