import { z } from 'zod'
import { normalizeColigadaId } from '../utils/coligadas-config'

export const OrigemDisparoSchema = z.enum([
  'BATCH',
  'REPROCESSAMENTO',
  'WEBHOOK',
])

export const CancelamentoAlunoSchema = z.object({
  CD_Registro_Academico: z.string().min(1),
  CD_Coligada: z.preprocess(
    (value) =>
      typeof value === 'number' && Number.isInteger(value)
        ? normalizeColigadaId(value)
        : value,
    z.number().int(),
  ),
  CD_Periodo_Letivo: z.string().min(1),
  TP_Origem_Disparo: OrigemDisparoSchema.default('REPROCESSAMENTO'),
})

export type CancelamentoAlunoDto = z.infer<typeof CancelamentoAlunoSchema>
