import { google, Auth } from 'googleapis'

class GoogleConstants {
  /**
   * Cria um JWT autenticado para a coligada informada.
   * As credenciais são lidas de env vars nomeadas por coligada:
   *   GOOGLE_CLIENT_KEY_{id}    — e-mail da service account
   *   GOOGLE_KEY_{id}           — chave privada da service account
   *   GOOGLE_IMPERSONATOR_{id}  — e-mail do admin a impersonar
   */
  async JwtAuth(scopes: string[], coligada: number): Promise<Auth.JWT> {
    const clientEmail =
      coligada === 5
        ? process.env.GOOGLE_CLIENTKEY_LICEU
        : process.env.GOOGLE_CLIENTKEY_CEL
    const privateKey =
      coligada === 5 ? process.env.GOOGLE_KEY_LICEU : process.env.GOOGLE_KEY_CEL
    const subject =
      coligada === 5
        ? process.env.IMPERSONATOR_LICEU
        : process.env.IMPERSONATOR_CEL

    if (!clientEmail || !privateKey || !subject) {
      throw new Error(
        `Credenciais Google não configuradas para coligada ${coligada}. ` +
          `Verifique as variáveis GOOGLE_CLIENT_KEY_${coligada}, GOOGLE_KEY_${coligada} e GOOGLE_IMPERSONATOR_${coligada}.`,
      )
    }

    return new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes,
      subject,
    })
  }
}

const GoogleConstantObj = new GoogleConstants()
export default GoogleConstantObj
