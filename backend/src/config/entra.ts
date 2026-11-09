import 'dotenv/config'
import { ConfidentialClientApplication, LogLevel } from '@azure/msal-node'

// =====================================
// ENTRA ID: SOLO PARA EL BUZÓN DE TUTELAS
// Los usuarios NO entran con Microsoft 365 (el login es propio). Esto es únicamente la credencial
// de la app para leer y enviar correo del buzón de tutelas por Microsoft Graph. La política de
// acceso de Exchange (New-ApplicationAccessPolicy) la limita a ese buzón: no puede leer ningún otro.
// =====================================

export const entraConfigurado = () =>
  Boolean(process.env.ENTRA_TENANT_ID && process.env.ENTRA_CLIENT_ID && process.env.ENTRA_CLIENT_SECRET)

let cliente: ConfidentialClientApplication | null = null

export const clienteEntra = () => {
  if (!entraConfigurado()) throw new Error('Faltan ENTRA_TENANT_ID, ENTRA_CLIENT_ID o ENTRA_CLIENT_SECRET en el .env')
  cliente ??= new ConfidentialClientApplication({
    auth: {
      clientId: process.env.ENTRA_CLIENT_ID as string,
      clientSecret: process.env.ENTRA_CLIENT_SECRET as string,
      authority: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}`
    },
    system: { loggerOptions: { logLevel: LogLevel.Error, loggerCallback: (_n, mensaje) => console.error(mensaje) } }
  })
  return cliente
}

export const ALCANCE_GRAPH_APP = ['https://graph.microsoft.com/.default']
