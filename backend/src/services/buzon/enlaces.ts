import { Archivo, Correo, EnlaceCorreo } from '../../models'
import { graph, graphRespuesta } from './graph'
import { entraConfigurado } from '../../config/entra'
import { guardarArchivo, carpetaBandeja } from '../almacenamiento'
import { archivarAdjuntos, destinoAdjuntos } from '../expediente'
import { ErrorNegocio } from '../../utils/errores'

// =====================================
// ENLACES DE SHAREPOINT EN LOS CORREOS
// El cliente manda expedientes e insumos como enlace de SharePoint. Cada enlace queda como
// pendiente del correo y se trae al expediente así:
//   1. Por Graph (API de "shares"): sirve cuando el enlace es del sitio de la firma o la app tiene acceso.
//   2. Como descarga directa (`download=1`): sirve para los enlaces de "cualquier persona con el vínculo".
//   3. Si los dos fallan (el enlace pide iniciar sesión en el SharePoint del cliente: una app no puede
//      entrar a otra organización), el asistente lo baja y lo sube a mano en la misma fila.
// Lo que se trae queda como adjunto del correo: si el correo ya es de un caso, pasa a su carpeta.
// =====================================

const TOPE_BYTES = 200 * 1024 * 1024

// Solo SharePoint y OneDrive: los demás enlaces de un correo (firmas, redes, avisos legales) no son
// documentos del caso y no deben quedar como pendientes
export const esEnlaceSharepoint = (url: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.endsWith('.sharepoint.com') || host === '1drv.ms' || host.endsWith('onedrive.live.com')
  } catch {
    return false
  }
}

export const registrarEnlaces = async (correo: Correo) => {
  for (const url of correo.enlaces.filter(esEnlaceSharepoint)) {
    await EnlaceCorreo.findOrCreate({ where: { correoId: correo.id, url }, defaults: { correoId: correo.id, url } })
  }
}

type Descargado = { nombre: string, tipoMime: string, contenido: Buffer }

// "u!" + base64url del enlace: el identificador que pide la API de shares
const idCompartido = (url: string) => `u!${Buffer.from(url).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`

type ItemGraph = { id: string, name: string, size?: number, file?: { mimeType?: string }, folder?: object, parentReference?: { driveId?: string } }

const porGraph = async (url: string): Promise<Descargado[]> => {
  const base = `/shares/${idCompartido(url)}/driveItem`
  const item = await graph<ItemGraph>(`${base}?$select=id,name,size,file,folder,parentReference`)
  const bajar = async (i: ItemGraph, ruta: string): Promise<Descargado> => {
    if ((i.size ?? 0) > TOPE_BYTES) throw new Error(`"${i.name}" pesa más de 200 MB`)
    const r = await graphRespuesta(ruta)
    return { nombre: i.name, tipoMime: i.file?.mimeType ?? 'application/octet-stream', contenido: Buffer.from(await r.arrayBuffer()) }
  }
  if (!item.folder) return [await bajar(item, `${base}/content`)]
  // Un enlace a una carpeta: se traen sus archivos (sin subcarpetas)
  const { value } = await graph<{ value: ItemGraph[] }>(`${base}/children?$select=id,name,size,file,folder,parentReference&$top=200`)
  const archivos = value.filter(v => v.file)
  if (!archivos.length) throw new Error('La carpeta del enlace no tiene archivos')
  const resultado: Descargado[] = []
  for (const a of archivos) resultado.push(await bajar(a, `/drives/${a.parentReference?.driveId}/items/${a.id}/content`))
  return resultado
}

const nombreDeCabecera = (cabecera: string | null) => {
  if (!cabecera) return null
  const utf8 = cabecera.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) return decodeURIComponent(utf8[1])
  return cabecera.match(/filename="?([^";]+)"?/i)?.[1] ?? null
}

const directo = async (url: string): Promise<Descargado[]> => {
  const conDescarga = `${url}${url.includes('?') ? '&' : '?'}download=1`
  // Sin respuesta del servidor (dirección mal copiada, sin red): un mensaje que el asistente entienda
  const r = await fetch(conDescarga, { redirect: 'follow' }).catch(() => { throw new Error('El enlace no responde (revise que esté completo)') })
  const tipo = r.headers.get('content-type') ?? ''
  // Una página web en vez del archivo = pide iniciar sesión o es una carpeta
  if (!r.ok || tipo.includes('text/html')) throw new Error(r.status === 404 ? 'El enlace ya no existe o venció' : 'El enlace pide iniciar sesión en SharePoint')
  if (Number(r.headers.get('content-length') ?? 0) > TOPE_BYTES) throw new Error('El archivo pesa más de 200 MB')
  const nombre = nombreDeCabecera(r.headers.get('content-disposition')) ?? decodeURIComponent(new URL(r.url).pathname.split('/').pop() || 'documento')
  return [{ nombre, tipoMime: tipo || 'application/octet-stream', contenido: Buffer.from(await r.arrayBuffer()) }]
}

// Guarda los documentos como adjuntos del correo; si el correo ya es de un caso, van a su carpeta
const guardarDelCorreo = async (correo: Correo, documentos: Descargado[], usuarioId: number | null) => {
  for (const d of documentos) {
    const ubicacion = await guardarArchivo(carpetaBandeja(correo.id, correo.fechaCorreo), d.nombre, d.contenido, d.tipoMime)
    await Archivo.create({ nombre: d.nombre, tipoMime: d.tipoMime, tamano: d.contenido.length, tipo: 'CORREO', ...ubicacion, correoId: correo.id, usuarioId })
  }
  if (correo.actuacionId) {
    const { sub, tipo, escritoId } = await destinoAdjuntos(correo.proposito ?? '', correo.actuacionId)
    await archivarAdjuntos(correo.id, correo.actuacionId, sub, tipo, escritoId)
  }
}

export const descargarEnlace = async (enlaceId: number, usuarioId: number) => {
  const enlace = await EnlaceCorreo.findByPk(enlaceId, { include: [Correo] })
  if (!enlace?.correo) throw new ErrorNegocio('El enlace no existe', 404)
  if (enlace.estado !== 'PENDIENTE') throw new ErrorNegocio('Este enlace ya se resolvió')
  const fallos: string[] = []
  let documentos: Descargado[] | null = null
  if (entraConfigurado()) {
    documentos = await porGraph(enlace.url).catch(error => { fallos.push(`Graph: ${error instanceof Error ? error.message.slice(0, 160) : error}`); return null })
  }
  documentos ??= await directo(enlace.url).catch(error => { fallos.push(error instanceof Error ? error.message : String(error)); return null })
  if (!documentos) {
    await enlace.update({ error: fallos.at(-1) ?? 'No se pudo descargar', intentadoEn: new Date() })
    throw new ErrorNegocio(`${fallos.at(-1) ?? 'No se pudo descargar'}. Ábralo, descárguelo y súbalo en esta fila.`)
  }
  await guardarDelCorreo(enlace.correo, documentos, usuarioId)
  await enlace.update({ estado: 'DESCARGADO', archivos: documentos.length, error: null, intentadoEn: new Date(), usuarioId })
  return enlace
}

// El asistente lo bajó con su cuenta y lo sube aquí: queda igual que si la app lo hubiera traído
export const subirEnlace = async (enlaceId: number, archivos: { nombre: string, tipoMime: string, contenido: Buffer }[], usuarioId: number) => {
  const enlace = await EnlaceCorreo.findByPk(enlaceId, { include: [Correo] })
  if (!enlace?.correo) throw new ErrorNegocio('El enlace no existe', 404)
  if (!archivos.length) throw new ErrorNegocio('No llegó ningún archivo')
  await guardarDelCorreo(enlace.correo, archivos, usuarioId)
  await enlace.update({ estado: 'DESCARGADO', archivos: enlace.archivos + archivos.length, error: null, usuarioId })
  return enlace
}

export const descartarEnlace = async (enlaceId: number, motivo: string, usuarioId: number) => {
  const enlace = await EnlaceCorreo.findByPk(enlaceId)
  if (!enlace) throw new ErrorNegocio('El enlace no existe', 404)
  if (!motivo.trim()) throw new ErrorNegocio('Indique por qué se descarta')
  await enlace.update({ estado: 'DESCARTADO', error: motivo.trim().slice(0, 500), usuarioId })
}
