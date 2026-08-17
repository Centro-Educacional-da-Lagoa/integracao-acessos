import { z } from 'zod'
import { normalizeColigadaId } from '../utils/coligadas-config'

export const CancelamentoEmailConcluinteEmSchema = z
  .object({
    CD_Periodo_Letivo_Anterior: z
      .preprocess(
        (value) => (value === '' ? undefined : value),
        z.string().min(1).optional(),
      )
      .optional(),
    CD_Coligada: z
      .preprocess(
        (value) =>
          typeof value === 'number' && Number.isInteger(value)
            ? normalizeColigadaId(value)
            : value,
        z.number().int().optional(),
      )
      .optional(),
  })
  .default({})

export type CancelamentoEmailConcluinteEmDto = z.infer<
  typeof CancelamentoEmailConcluinteEmSchema
>
