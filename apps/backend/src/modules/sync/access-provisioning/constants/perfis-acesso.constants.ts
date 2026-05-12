import { TipoEntidade } from '../enums/tipo-entidade.enum'

export interface PerfilAcessoEntry {
  /** Nome exato do perfil no TOTVS */
  NM_Perfil: string
  /** Código do sistema TOTVS — ex: 'S' | 'L' */
  CD_Sistema: string
  /** Código da coligada */
  CD_Coligada: number
  /** Tipo da entidade ao qual este perfil pertence */
  TP_Entidade: TipoEntidade
  /** Subtipo de responsável usado para evitar concessão cruzada de perfis */
  TP_Vinculo_Responsavel?: 'ACADEMICO' | 'FINANCEIRO'
}

export const PERFIS_ACESSO: PerfilAcessoEntry[] = [
  {
    NM_Perfil: 'Aluno CEL',
    CD_Sistema: 'S',
    CD_Coligada: 1,
    TP_Entidade: TipoEntidade.ALUNO,
  },
  {
    NM_Perfil: 'Aluno CEL',
    CD_Sistema: 'L',
    CD_Coligada: 1,
    TP_Entidade: TipoEntidade.ALUNO,
  },
  {
    NM_Perfil: 'Aluno LICEU',
    CD_Sistema: 'S',
    CD_Coligada: 5,
    TP_Entidade: TipoEntidade.ALUNO,
  },
  {
    NM_Perfil: 'Aluno LICEU',
    CD_Sistema: 'L',
    CD_Coligada: 5,
    TP_Entidade: TipoEntidade.ALUNO,
  },
  {
    NM_Perfil: 'RespFinanc_CEL',
    CD_Sistema: 'S',
    CD_Coligada: 1,
    TP_Entidade: TipoEntidade.RESPONSAVEL,
    TP_Vinculo_Responsavel: 'FINANCEIRO',
  },
  {
    NM_Perfil: 'RespAcad_CEL',
    CD_Sistema: 'S',
    CD_Coligada: 1,
    TP_Entidade: TipoEntidade.RESPONSAVEL,
    TP_Vinculo_Responsavel: 'ACADEMICO',
  },
  {
    NM_Perfil: 'RespAcad_LFB',
    CD_Sistema: 'S',
    CD_Coligada: 5,
    TP_Entidade: TipoEntidade.RESPONSAVEL,
    TP_Vinculo_Responsavel: 'ACADEMICO',
  },
  {
    NM_Perfil: 'RespFinanc_LFB',
    CD_Sistema: 'S',
    CD_Coligada: 5,
    TP_Entidade: TipoEntidade.RESPONSAVEL,
    TP_Vinculo_Responsavel: 'FINANCEIRO',
  },
  {
    NM_Perfil: 'RespAcad_LFB',
    CD_Sistema: 'S',
    CD_Coligada: 6,
    TP_Entidade: TipoEntidade.RESPONSAVEL,
    TP_Vinculo_Responsavel: 'ACADEMICO',
  },
  {
    NM_Perfil: 'RespFinanc_LFB',
    CD_Sistema: 'S',
    CD_Coligada: 6,
    TP_Entidade: TipoEntidade.RESPONSAVEL,
    TP_Vinculo_Responsavel: 'FINANCEIRO',
  },
]
