import fs from 'node:fs/promises'
import path from 'node:path'
import { graph, graphRespuesta, ErrorGraph } from './buzon/graph'
import { entraConfigurado } from '../config/entra'

// =====================================
// EXPEDIENTES EN SHAREPOINT
// El manual operativo (§23) exige custodiar todo en una biblioteca de SharePoint o Teams con
// permisos por grupos, sin OneDrive personal y compartiendo por enlace solo con los dominios del
// cliente. Por eso el repositorio único es SharePoint: la app sube, lee, mueve y comparte por Graph
// con el permiso Sites.Selected (solo ese sitio). No se guardan copias en otro lado: así la
// devolución y supresión de la información al terminar el contrato es borrar el sitio.
//
// Sin SharePoint configurado (desarrollo) los archivos van a una carpeta local
// (ALMACEN_LOCAL, por defecto backend/almacen-local): el flujo se prueba igual.
// =====================================

export type Ubicacion = { proveedor: 'SHAREPOINT' | 'LOCAL', ruta: string, itemId: string | null, webUrl: string | null }

const sharepointConfigurado = () => entraConfigurado() && !!process.env.SHAREPOINT_SITIO
export const proveedorAlmacen = () => (sharepointConfigurado() ? 'SHAREPOINT' : 'LOCAL')

const carpetaLocal = () => path.resolve(process.env.ALMACEN_LOCAL || path.join(__dirname, '../../almacen-local'))

// Nombres válidos en SharePoint y en disco: sin  " * : < > ? / \ |  ni espacios al final
export const limpiarNombre = (nombre: string) =>
  nombre.normalize('NFC').replace(/["*:<>?/\\|#%]+/g, '_').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '').slice(-150) || 'archivo'

const unirRuta = (...partes: string[]) => partes.flatMap(p => p.split('/')).map(p => p.trim()).filter(Boolean).map(limpiarNombre).join('/')

// ── SharePoint ──
let unidad: { driveId: string } | null = null

// SHAREPOINT_SITIO: "empresa.sharepoint.com:/sites/Tutelas". SHAREPOINT_BIBLIOTECA: nombre de la
// biblioteca (vacío = la de documentos por defecto)
const driveId = async () => {
  if (unidad) return unidad.driveId
  const sitio = await graph<{ id: string }>(`/sites/${process.env.SHAREPOINT_SITIO}`)
  const biblioteca = process.env.SHAREPOINT_BIBLIOTECA?.trim()
  if (biblioteca) {
    const { value } = await graph<{ value: { id: string, name: string }[] }>(`/sites/${sitio.id}/drives?$select=id,name`)
    const encontrada = value.find(d => d.name.toLowerCase() === biblioteca.toLowerCase())
    if (!encontrada) throw new Error(`No existe la biblioteca "${biblioteca}" en el sitio de SharePoint`)
    unidad = { driveId: encontrada.id }
  } else {
    unidad = { driveId: (await graph<{ id: string }>(`/sites/${sitio.id}/drive?$select=id`)).id }
  }
  return unidad.driveId
}

const rutaCodificada = (ruta: string) => ruta.split('/').map(encodeURIComponent).join('/')

// Crea la carpeta y sus padres si no existen; devuelve su id
const asegurarCarpetaSharepoint = async (ruta: string) => {
  const d = await driveId()
  let padre = 'root'
  let actual = ''
  for (const parte of ruta.split('/').filter(Boolean)) {
    actual = actual ? `${actual}/${parte}` : parte
    try {
      padre = (await graph<{ id: string }>(`/drives/${d}/root:/${rutaCodificada(actual)}?$select=id`)).id
    } catch (error) {
      if (!(error instanceof ErrorGraph && error.status === 404)) throw error
      padre = (await graph<{ id: string }>(`/drives/${d}/items/${padre}/children`, {
        metodo: 'POST', cuerpo: { name: parte, folder: {}, '@microsoft.graph.conflictBehavior': 'replace' }
      })).id
    }
  }
  return padre
}

type ItemGraph = { id: string, name: string, webUrl: string, parentReference?: { path?: string } }

const TROZO = 320 * 1024 * 10 // las cargas por sesión van en múltiplos de 320 KiB

const subirSharepoint = async (carpeta: string, nombre: string, contenido: Buffer, tipoMime?: string | null): Promise<ItemGraph> => {
  const d = await driveId()
  const ruta = rutaCodificada(`${carpeta}/${nombre}`)
  // Mismo nombre en la carpeta: SharePoint le agrega un número (no se pisa un escrito anterior)
  if (contenido.length <= 4 * 1024 * 1024) {
    return graph<ItemGraph>(`/drives/${d}/root:/${ruta}:/content?@microsoft.graph.conflictBehavior=rename`, {
      metodo: 'PUT', crudo: contenido, encabezados: { 'Content-Type': tipoMime || 'application/octet-stream' }
    })
  }
  const sesion = await graph<{ uploadUrl: string }>(`/drives/${d}/root:/${ruta}:/createUploadSession`, {
    metodo: 'POST', cuerpo: { item: { '@microsoft.graph.conflictBehavior': 'rename' } }
  })
  let item: ItemGraph | null = null
  for (let inicio = 0; inicio < contenido.length; inicio += TROZO) {
    const fin = Math.min(inicio + TROZO, contenido.length)
    const r = await graphRespuesta(sesion.uploadUrl, {
      metodo: 'PUT', sinToken: true, crudo: contenido.subarray(inicio, fin),
      encabezados: { 'Content-Range': `bytes ${inicio}-${fin - 1}/${contenido.length}` }
    })
    if (r.status === 200 || r.status === 201) item = await r.json() as ItemGraph
  }
  if (!item) throw new Error('SharePoint no confirmó la carga del archivo')
  return item
}

// ── Interfaz común ──

export const guardarArchivo = async (carpeta: string, nombre: string, contenido: Buffer, tipoMime?: string | null): Promise<Ubicacion> => {
  const dir = unirRuta(carpeta)
  const limpio = limpiarNombre(nombre)
  if (sharepointConfigurado()) {
    const item = await subirSharepoint(dir, limpio, contenido, tipoMime)
    return { proveedor: 'SHAREPOINT', ruta: `${dir}/${item.name}`, itemId: item.id, webUrl: item.webUrl }
  }
  const destino = path.join(carpetaLocal(), dir)
  await fs.mkdir(destino, { recursive: true })
  // Igual que SharePoint: no pisar un archivo con el mismo nombre
  let final = limpio
  for (let n = 1; await fs.stat(path.join(destino, final)).then(() => true, () => false); n++) {
    const ext = path.extname(limpio)
    final = `${path.basename(limpio, ext)} ${n}${ext}`
  }
  await fs.writeFile(path.join(destino, final), contenido)
  return { proveedor: 'LOCAL', ruta: `${dir}/${final}`, itemId: null, webUrl: null }
}

export const leerArchivo = async (u: { proveedor: string | null, ruta: string | null, itemId: string | null }): Promise<Buffer | null> => {
  if (!u.ruta && !u.itemId) return null
  if (u.proveedor === 'SHAREPOINT') {
    const d = await driveId()
    const r = await graphRespuesta(u.itemId ? `/drives/${d}/items/${u.itemId}/content` : `/drives/${d}/root:/${rutaCodificada(u.ruta!)}:/content`)
    return Buffer.from(await r.arrayBuffer())
  }
  return fs.readFile(path.join(carpetaLocal(), u.ruta!)).catch(() => null)
}

// Confirma que el archivo sigue en SharePoint con el tamaño esperado (antes de borrar la otra copia)
export const existeEnSharepoint = async (itemId: string, tamano: number | null) => {
  if (!sharepointConfigurado()) return false
  try {
    const item = await graph<{ size?: number, file?: object }>(`/drives/${await driveId()}/items/${itemId}?$select=size,file`)
    return !!item.file && (tamano === null || item.size === tamano)
  } catch (error) {
    if (error instanceof ErrorGraph && error.status === 404) return false
    throw error
  }
}

// Lleva el archivo a otra carpeta (de la bandeja al expediente del caso)
export const moverArchivo = async (u: Ubicacion, carpeta: string): Promise<Ubicacion> => {
  const dir = unirRuta(carpeta)
  const nombre = u.ruta.split('/').pop() as string
  if (u.ruta === `${dir}/${nombre}`) return u
  if (u.proveedor === 'SHAREPOINT' && u.itemId) {
    const d = await driveId()
    const padre = await asegurarCarpetaSharepoint(dir)
    const item = await graph<ItemGraph>(`/drives/${d}/items/${u.itemId}?@microsoft.graph.conflictBehavior=rename`, {
      metodo: 'PATCH', cuerpo: { parentReference: { id: padre } }
    })
    return { proveedor: 'SHAREPOINT', ruta: `${dir}/${item.name}`, itemId: item.id, webUrl: item.webUrl }
  }
  const destino = path.join(carpetaLocal(), dir)
  await fs.mkdir(destino, { recursive: true })
  await fs.rename(path.join(carpetaLocal(), u.ruta), path.join(destino, nombre))
  return { ...u, ruta: `${dir}/${nombre}` }
}

// Enlace de la entrega (correo del cliente, punto 3.2): da permiso de lectura a los destinatarios
// sobre la carpeta del escrito y devuelve su dirección. Con la invitación (y no un enlace anónimo)
// solo entran ellos, con su cuenta, y el permiso vence a los "dias" indicados
export const compartirCarpeta = async (carpeta: string, correos: string[], dias: number) => {
  const dir = unirRuta(carpeta)
  if (!sharepointConfigurado()) return { enlace: `(sin SharePoint) ${dir}`, compartido: false }
  const d = await driveId()
  const id = await asegurarCarpetaSharepoint(dir)
  const vence = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString()
  await graph(`/drives/${d}/items/${id}/invite`, {
    metodo: 'POST',
    cuerpo: { recipients: correos.map(email => ({ email })), requireSignIn: true, sendInvitation: false, roles: ['read'], expirationDateTime: vence }
  })
  const item = await graph<ItemGraph>(`/drives/${d}/items/${id}?$select=webUrl`)
  return { enlace: item.webUrl, compartido: true }
}

// ── Organización del expediente ──
// Casos/GPA-2026-00001 76001310300120260012300/Contestación/{Entrada|Insumos|Escritos/V1}
export const carpetaCaso = (caso: { numeroInterno: string | null, radicado: string }) =>
  `Casos/${caso.numeroInterno ?? 'Sin número'} ${caso.radicado}`

export const carpetaBandeja = (correoId: number, fecha: Date) =>
  `Bandeja/${fecha.getUTCFullYear()}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}/${correoId}`
