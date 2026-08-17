import { Logger } from '@nestjs/common'
import { AlocacaoAtivaContext } from '../access-provisioning/interfaces/pessoa-acesso-context.interface'

type AlocacaoAtivaRaw = {
  CD_Coligada?: unknown
  CD_Filial?: unknown
  TP_Matricula?: unknown
}

export function parseAlocacoesAtivasJson(
  value: string | null | undefined,
  logger: Logger,
  contexto: string,
): AlocacaoAtivaContext[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      logger.warn(`[${contexto}] JS_Alocacoes_Ativas não é array — ignorando`)
      return []
    }

    return deduplicarAlocacoesAtivas(
      parsed.flatMap((item: AlocacaoAtivaRaw) => {
        const CD_Coligada = Number(item.CD_Coligada)
        const CD_Filial = Number(item.CD_Filial)
        if (!Number.isFinite(CD_Coligada) || !Number.isFinite(CD_Filial)) {
          return []
        }

        const TP_Matricula =
          item.TP_Matricula === 'REGULAR' || item.TP_Matricula === 'EXTRA'
            ? item.TP_Matricula
            : undefined

        return [
          {
            CD_Coligada: Math.trunc(CD_Coligada),
            CD_Filial: Math.trunc(CD_Filial),
            TP_Matricula,
          },
        ]
      }),
    )
  } catch (error) {
    logger.warn(
      `[${contexto}] JS_Alocacoes_Ativas inválido — ignorando: ${(error as Error).message}`,
    )
    return []
  }
}

export function deduplicarAlocacoesAtivas(
  alocacoes: AlocacaoAtivaContext[],
): AlocacaoAtivaContext[] {
  const map = new Map<string, AlocacaoAtivaContext>()

  for (const alocacao of alocacoes) {
    const key = `${alocacao.CD_Coligada}:${alocacao.CD_Filial}`
    if (!map.has(key)) {
      map.set(key, alocacao)
    }
  }

  return [...map.values()]
}
