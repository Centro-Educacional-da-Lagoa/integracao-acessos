import { z } from 'zod'

export const OrigemDisparoResponsavelSchema = z.enum([
  'BATCH',
  'REPROCESSAMENTO',
  'WEBHOOK',
])

export const CancelamentoResponsavelSchema = z
  .object({
    CD_Periodo_Letivo: z.string().min(1),
    CD_Pessoa: z.number().int().optional(),
    CD_CPF: z.string().min(1).optional(),
    CD_Registro_Academico: z.string().min(1).optional(),
    TP_Origem_Disparo: OrigemDisparoResponsavelSchema.default(
      'REPROCESSAMENTO',
    ),
  })
  .refine(
    (data) =>
      data.CD_Pessoa !== undefined ||
      data.CD_CPF !== undefined ||
      data.CD_Registro_Academico !== undefined,
    {
      message: 'Informe ao menos CD_Pessoa, CD_CPF ou CD_Registro_Academico.',
      path: ['CD_Pessoa'],
    },
  )

export type CancelamentoResponsavelDto = z.infer<
  typeof CancelamentoResponsavelSchema
>

export const AtivacaoResponsavelSchema = CancelamentoResponsavelSchema

export type AtivacaoResponsavelDto = z.infer<typeof AtivacaoResponsavelSchema>
