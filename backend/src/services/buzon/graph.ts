import { clienteEntra, ALCANCE_GRAPH_APP } from '../../config/entra'

// =====================================
// MICROSOFT GRAPH CON LAS CREDENCIALES DE LA APP
// Solo se usa para el buzón de tutelas (la política de acceso de Exchange no deja leer otro).
// =====================================

const BASE = 'https://graph.microsoft.com/v1.0'

let token: { valor: string, vence: number } | null = null

const tokenApp = async () => {
  if (token && token.vence > Date.now() + 60_000) return token.valor
  const r = await clienteEntra().acquireTokenByClientCredential({ scopes: ALCANCE_GRAPH_APP })
  if (!r?.accessToken) throw new Error('Entra no devolvió token para Graph')
  token = { valor: r.accessToken, vence: r.expiresOn?.getTime() ?? Date.now() + 30 * 60_000 }
  return token.valor
}

export class ErrorGraph extends Error {
  constructor(public status: number, mensaje: string) { super(mensaje) }
}

export const graph = async <T = any>(ruta: string, opciones: { metodo?: string, cuerpo?: unknown, encabezados?: Record<string, string> } = {}): Promise<T> => {
  const url = ruta.startsWith('http') ? ruta : `${BASE}${ruta}`
  for (let intento = 0; ; intento++) {
    const r = await fetch(url, {
      method: opciones.metodo ?? 'GET',
      headers: {
        Authorization: `Bearer ${await tokenApp()}`,
        ...(opciones.cuerpo !== undefined && { 'Content-Type': 'application/json' }),
        ...opciones.encabezados
      },
      body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined
    })
    // Graph limita las consultas (429) o se cae un momento (503): reintentar con la espera que indique
    if ((r.status === 429 || r.status === 503) && intento < 3) {
      const espera = Number(r.headers.get('Retry-After')) || 5 * (intento + 1)
      await new Promise(res => setTimeout(res, espera * 1000))
      continue
    }
    if (!r.ok) throw new ErrorGraph(r.status, `Graph ${r.status} en ${ruta.split('?')[0]}: ${(await r.text()).slice(0, 300)}`)
    if (r.status === 202 || r.status === 204) return undefined as T
    return r.json() as Promise<T>
  }
}

export const rutaBuzon = () => {
  const buzon = process.env.BUZON_CORREO
  if (!buzon) throw new Error('Falta BUZON_CORREO en el .env')
  return `/users/${encodeURIComponent(buzon)}`
}

// Envía un correo desde el buzón y devuelve su id y su hilo (para emparejar la respuesta).
// Se crea como borrador primero: así Graph devuelve el id y el conversationId antes de enviarlo
export const enviarCorreo = async (datos: {
  para: string[], cc?: string[], asunto: string, html: string,
  adjuntos?: { nombre: string, tipoMime: string, contenido: Buffer }[],
  responderA?: string // graphId del mensaje al que responde (mismo hilo)
}) => {
  const base = rutaBuzon()
  const destinatarios = (lista: string[] = []) => lista.map(address => ({ emailAddress: { address } }))
  const mensaje = {
    subject: datos.asunto,
    body: { contentType: 'HTML', content: datos.html },
    toRecipients: destinatarios(datos.para),
    ccRecipients: destinatarios(datos.cc)
  }
  const borrador = datos.responderA
    ? await graph<{ id: string, conversationId: string }>(`${base}/messages/${datos.responderA}/createReply`, { metodo: 'POST', cuerpo: { message: mensaje } })
    : await graph<{ id: string, conversationId: string }>(`${base}/messages`, { metodo: 'POST', cuerpo: mensaje })
  for (const a of datos.adjuntos ?? []) {
    await graph(`${base}/messages/${borrador.id}/attachments`, {
      metodo: 'POST',
      cuerpo: { '@odata.type': '#microsoft.graph.fileAttachment', name: a.nombre, contentType: a.tipoMime, contentBytes: a.contenido.toString('base64') }
    })
  }
  await graph(`${base}/messages/${borrador.id}/send`, { metodo: 'POST' })
  // La hora del envío es la que cuenta para el ANS ("automático con envío de correo")
  return { graphId: borrador.id, conversationId: borrador.conversationId, enviadoEn: new Date() }
}
