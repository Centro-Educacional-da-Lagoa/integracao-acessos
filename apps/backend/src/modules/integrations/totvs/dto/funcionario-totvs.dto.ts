import { z } from 'zod'

export const FuncionarioTotvsSchema = z.object({
  matricula: z.string(),
  nome: z.string(),
  emailPessoal: z.string().email(),
  cpf: z.string(),
  situacao: z.enum(['ATIVO', 'DEMITIDO', 'AFASTADO']),

  // Expanda conforme os dados reais da procedure/view da TOTVS. Ex:
  // centroCusto: z.string().optional(),
  // cargo: z.string().optional(),
  // filial: z.string().optional(),
})

export type FuncionarioTotvsDto = z.infer<typeof FuncionarioTotvsSchema>
