import { Actuacion, Archivo, Caso, Escrito } from '../models'
import { carpetaCaso, guardarArchivo, moverArchivo } from './almacenamiento'
import { NOMBRES_ETAPAS, type Etapa } from './constantes'

// =====================================
// EXPEDIENTE DEL CASO EN SHAREPOINT
// Casos/<número interno> <radicado>/<etapa>/
//   Entrada        asignación y datos faltantes
//   Insumos        lo que manda el cliente
//   Escritos/V1    escrito y anexos de cada entrega (V2 después de una devolución)
//   Soportes       otros documentos
// El asistente "organiza y carga documentos a los expedientes" (rol del cliente): la app los deja
// ya en su carpeta y él completa lo que falte desde el caso.
// =====================================

export type Subcarpeta = 'Entrada' | 'Insumos' | 'Soportes' | `Escritos/V${number}`

export const carpetaActuacion = (caso: { numeroInterno: string | null, radicado: string }, etapa: Etapa, sub: Subcarpeta) =>
  `${carpetaCaso(caso)}/${NOMBRES_ETAPAS[etapa]}/${sub}`

const datosActuacion = async (actuacionId: number) => {
  const a = await Actuacion.findByPk(actuacionId, { attributes: ['id', 'casoId', 'etapa'], include: [{ model: Caso, attributes: ['numeroInterno', 'radicado'] }] })
  if (!a?.caso) throw new Error(`Actuación ${actuacionId} sin caso`)
  return a
}

// Sube un documento nuevo al expediente de la actuación
export const guardarEnExpediente = async (d: {
  actuacionId: number, sub: Subcarpeta, nombre: string, contenido: Buffer, tipoMime?: string | null,
  tipo: Archivo['tipo'], escritoId?: number | null, usuarioId?: number | null
}) => {
  const a = await datosActuacion(d.actuacionId)
  const ubicacion = await guardarArchivo(carpetaActuacion(a.caso!, a.etapa, d.sub), d.nombre, d.contenido, d.tipoMime)
  return Archivo.create({
    nombre: d.nombre, tipoMime: d.tipoMime ?? null, tamano: d.contenido.length, tipo: d.tipo, ...ubicacion,
    casoId: a.casoId, actuacionId: a.id, escritoId: d.escritoId ?? null, usuarioId: d.usuarioId ?? null
  })
}

// Pasa los adjuntos de un correo (que llegaron a la bandeja) a la carpeta del caso. Si SharePoint
// falla, el adjunto queda donde estaba y ligado al caso: no se pierde ni frena el registro
export const archivarAdjuntos = async (correoId: number, actuacionId: number, sub: Subcarpeta, tipo: Archivo['tipo'] = 'CORREO', escritoId: number | null = null) => {
  const archivos = await Archivo.findAll({ where: { correoId } })
  if (!archivos.length) return
  const a = await datosActuacion(actuacionId)
  const destino = carpetaActuacion(a.caso!, a.etapa, sub)
  for (const archivo of archivos) {
    const cambios: Partial<Archivo> = { casoId: a.casoId, actuacionId: a.id, tipo, escritoId }
    if (archivo.proveedor && archivo.ruta) {
      try {
        Object.assign(cambios, await moverArchivo({ proveedor: archivo.proveedor, ruta: archivo.ruta, itemId: archivo.itemId, webUrl: archivo.webUrl }, destino))
      } catch (error) {
        console.error('❌ No se pudo mover el adjunto al expediente', archivo.id, error)
      }
    }
    await archivo.update(cambios)
  }
}

// Carpeta del expediente según lo que es la respuesta. Lo que adjunta la entidad al responder una
// entrega (el escrito con observaciones, por ejemplo) queda en la carpeta de esa versión y ligado a ella
export const destinoAdjuntos = async (proposito: string, actuacionId: number): Promise<{ sub: Subcarpeta, tipo: Archivo['tipo'], escritoId: number | null }> => {
  if (proposito === 'RESPUESTA_INSUMOS') return { sub: 'Insumos', tipo: 'INSUMO', escritoId: null }
  if (proposito === 'RESPUESTA_ENTREGA') {
    const escrito = await Escrito.findOne({ where: { actuacionId }, order: [['version', 'DESC']], attributes: ['id', 'version'] })
    return { sub: `Escritos/V${escrito?.version ?? 1}`, tipo: 'RESPUESTA', escritoId: escrito?.id ?? null }
  }
  return { sub: 'Entrada', tipo: 'CORREO', escritoId: null }
}
