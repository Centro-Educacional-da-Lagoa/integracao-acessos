/**
 * Constantes para integração com a API REST da TOTVS
 */
export const totvsApiConstants = {
  /**
   * URL base da API REST do TOTVS RM
   * @example 'http://servidor:porta/api'
   */
  urlAPI: process.env.TOTVS_API_URL || '',

  urlPortalAPI: process.env.TOTVS_API_PORTAL_URL || '',

  /**
   * Cabeçalho de autorização para requisições à API
   */
  authorization: `Basic ${process.env.TOTVS_API_AUTHORIZATION || ''}`,

  /**
   * Código do sistema (geralmente 'S' para Sinergia)
   */
  codigoSistema: 'S',

  /**
   * Código da filial padrão
   */
  codigoFilial: '1',

  /**
   * Código do tipo de curso (geralmente '1' para Educacional)
   */
  codigoTipoCurso: '1',
} as const
