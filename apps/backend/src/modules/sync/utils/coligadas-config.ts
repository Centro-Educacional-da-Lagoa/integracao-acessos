import { BadRequestException } from '@nestjs/common'
import { ColigadaConfig } from '../interfaces/coligada-config.interface'

const COLIGADAS_CONFIG: ColigadaConfig[] = [
  {
    id: 1,
    domain: 'aluno.cel.g12.br',
  },
  {
    id: 5,
    domain: 'aluno.lfb.g12.br',
  },
  {
    id: 6,
    domain: 'aluno.lfb.g12.br',
  },
]

export function listColigadasConfig(): ColigadaConfig[] {
  return [...COLIGADAS_CONFIG]
}

export function getColigadaConfigById(CD_Coligada: number): ColigadaConfig {
  const coligada = COLIGADAS_CONFIG.find((item) => item.id === CD_Coligada)

  if (!coligada) {
    throw new BadRequestException(
      `CD_Coligada ${CD_Coligada} não configurada para sincronização`,
    )
  }

  return coligada
}
