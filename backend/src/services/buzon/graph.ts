import { clienteEntra, ALCANCE_GRAPH_APP } from '../../config/entra'
import { BUZONES, VARIABLE_BUZON, type Buzon } from '../constantes'

// =====================================
// MICROSOFT GRAPH CON LAS CREDENCIALES DE LA APP
// Se usa para los tres buzones del servicio (la política de acceso de Exchange no deja leer otro) y
// para el sitio de SharePoint de los expedientes (permiso Sites.Selected: solo ese sitio).
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

type OpcionesGraph = { metodo?: string, cuerpo?: unknown, crudo?: Buffer, encabezados?: Record<string, string>, sinToken?: boolean }

// Petición a Graph con reintentos. Devuelve la respuesta tal cual (para contenido binario)
export const graphRespuesta = async (ruta: string, opciones: OpcionesGraph = {}): Promise<Response> => {
  const url = ruta.startsWith('http') ? ruta : `${BASE}${ruta}`
  // En los buzones, ids inmutables: si alguien mueve el correo de carpeta, el id guardado sigue sirviendo
  // (para responder en el hilo o quitarle los adjuntos más adelante)
  const encabezados = { ...opciones.encabezados }
  if (url.includes('/users/')) encabezados.Prefer = [encabezados.Prefer, 'IdType="ImmutableId"'].filter(Boolean).join(', ')
  for (let intento = 0; ; intento++) {
    const r = await fetch(url, {
      method: opciones.metodo ?? 'GET',
      headers: {
        // Las URL de carga de SharePoint ya traen su autorización y rechazan el token
        ...(!opciones.sinToken && { Authorization: `Bearer ${await tokenApp()}` }),
        ...(opciones.cuerpo !== undefined && { 'Content-Type': 'application/json' }),
        ...encabezados
      },
      body: opciones.crudo ?? (opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined)
    })
    // Graph limita las consultas (429) o se cae un momento (503): reintentar con la espera que indique
    if ((r.status === 429 || r.status === 503) && intento < 3) {
      const espera = Number(r.headers.get('Retry-After')) || 5 * (intento + 1)
      await new Promise(res => setTimeout(res, espera * 1000))
      continue
    }
    if (!r.ok) throw new ErrorGraph(r.status, `Graph ${r.status} en ${ruta.split('?')[0]}: ${(await r.text()).slice(0, 300)}`)
    return r
  }
}

export const graph = async <T = any>(ruta: string, opciones: OpcionesGraph = {}): Promise<T> => {
  const r = await graphRespuesta(ruta, opciones)
  if (r.status === 202 || r.status === 204) return undefined as T
  return r.json() as Promise<T>
}

// Dirección de cada buzón (asignaciones, insumos, entregas) según el .env
export const direccionBuzon = (buzon: Buzon) => process.env[VARIABLE_BUZON[buzon]]?.trim().toLowerCase() || null

export const buzonesConfigurados = () =>
  BUZONES.map(buzon => ({ buzon, direccion: direccionBuzon(buzon) })).filter((b): b is { buzon: Buzon, direccion: string } => !!b.direccion)

export const rutaBuzon = (buzon: Buzon) => {
  const direccion = direccionBuzon(buzon)
  if (!direccion) throw new Error(`Falta ${VARIABLE_BUZON[buzon]} en el .env`)
  return `/users/${encodeURIComponent(direccion)}`
}

// Envía un correo desde el buzón y devuelve su id y su hilo (para emparejar la respuesta).
// Se crea como borrador primero: así Graph devuelve el id y el conversationId antes de enviarlo
export const enviarCorreo = async (buzon: Buzon, datos: {
  para: string[], cc?: string[], asunto: string, html: string,
  // contentId: imagen incrustada en el cuerpo (el logo, referido como cid:…)
  adjuntos?: { nombre: string, tipoMime: string, contenido: Buffer, contentId?: string }[],
  responderA?: string // graphId del mensaje al que responde (mismo hilo)
}) => {
  const base = rutaBuzon(buzon)
  const destinatarios = (lista: string[] = []) => lista.map(address => ({ emailAddress: { address } }))
  const mensaje = {
    subject: datos.asunto,
    body: { contentType: 'HTML', content: datos.html },
    toRecipients: destinatarios(datos.para),
    ccRecipients: destinatarios(datos.cc)
  }
  // Al responder, Graph arma el borrador con el hilo y el texto citado; luego se le pone el asunto,
  // el cuerpo y los destinatarios propios
  const borrador = datos.responderA
    ? await graph<{ id: string, conversationId: string }>(`${base}/messages/${datos.responderA}/createReply`, { metodo: 'POST', cuerpo: { comment: '' } })
    : await graph<{ id: string, conversationId: string }>(`${base}/messages`, { metodo: 'POST', cuerpo: mensaje })
  if (datos.responderA) await graph(`${base}/messages/${borrador.id}`, { metodo: 'PATCH', cuerpo: mensaje })
  for (const a of datos.adjuntos ?? []) {
    await graph(`${base}/messages/${borrador.id}/attachments`, {
      metodo: 'POST',
      cuerpo: {
        '@odata.type': '#microsoft.graph.fileAttachment', name: a.nombre, contentType: a.tipoMime, contentBytes: a.contenido.toString('base64'),
        ...(a.contentId && { isInline: true, contentId: a.contentId })
      }
    })
  }
  await graph(`${base}/messages/${borrador.id}/send`, { metodo: 'POST' })
  // La hora del envío es la que cuenta para el ANS ("automático con envío de correo")
  return { graphId: borrador.id, conversationId: borrador.conversationId, enviadoEn: new Date() }
}
