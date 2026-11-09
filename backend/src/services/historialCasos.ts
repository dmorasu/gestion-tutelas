import type { Model, Transaction } from 'sequelize'
import { Caso, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision, HistorialCaso, Usuario, Juzgado } from '../models'
import type { CambioCampo } from '../models/correos'
import { contextoActual, type ContextoPeticion } from '../utils/contextoPeticion'
import { textoFechaHora } from '../utils/fechaColombia'

// =====================================
// HISTORIAL DEL CASO (patrón de Nodex: historialTramites.ts)
// Los cambios se capturan con hooks de los modelos: quedan registrados vengan de la pantalla, del
// buzón o de un cargue, sin tocar cada controlador. Quién los hizo sale del contexto de la petición.
// =====================================

type Formato = 'texto' | 'fecha' | 'fechaHora' | 'siNo'
type Campo = { etiqueta: string, formato?: Formato, referencia?: (id: number) => Promise<string | null> }

const nombreUsuario = async (id: number) => (await Usuario.findByPk(id, { attributes: ['nombre'] }))?.nombre ?? null
const nombreJuzgado = async (id: number) => (await Juzgado.findByPk(id, { attributes: ['nombre'] }))?.nombre ?? null

const CAMPOS: Record<string, Record<string, Campo>> = {
  CASO: {
    tipoSolicitud: { etiqueta: 'Tipo de solicitud' },
    juzgadoId: { etiqueta: 'Juzgado', referencia: nombreJuzgado },
    calidadEntidad: { etiqueta: 'Calidad de la entidad' },
    etapaActual: { etiqueta: 'Etapa actual' },
    estado: { etiqueta: 'Estado' },
    derechosInvolucrados: { etiqueta: 'Derechos involucrados' },
    observaciones: { etiqueta: 'Observaciones' }
  },
  ACTUACION: {
    estado: { etiqueta: 'Estado' },
    fechaNotificacion: { etiqueta: 'Notificación', formato: 'fechaHora' },
    terminoValor: { etiqueta: 'Término' },
    terminoUnidad: { etiqueta: 'Unidad del término' },
    fechaVencimiento: { etiqueta: 'Vencimiento', formato: 'fechaHora' },
    fechaLimiteEntrega: { etiqueta: 'Fecha límite ANS', formato: 'fechaHora' },
    auxiliarId: { etiqueta: 'Auxiliar', referencia: nombreUsuario },
    abogadoId: { etiqueta: 'Abogado', referencia: nombreUsuario },
    requiereRevisionAbogado: { etiqueta: 'Requiere revisión de abogado', formato: 'siNo' },
    requiereInsumos: { etiqueta: 'Requiere insumos', formato: 'siNo' },
    loQueSePide: { etiqueta: 'Lo que se pide al juez' }
  },
  INSUMO: {
    descripcion: { etiqueta: 'Insumo' },
    fechaSolicitud: { etiqueta: 'Solicitado', formato: 'fechaHora' },
    fechaRecepcion: { etiqueta: 'Recibido', formato: 'fechaHora' }
  },
  ESCRITO: {
    estado: { etiqueta: 'Estado del escrito' },
    fechaEntregaEntidad: { etiqueta: 'Entregado a la entidad', formato: 'fechaHora' }
  },
  DEVOLUCION: {
    tipo: { etiqueta: 'Tipo de devolución' },
    observacion: { etiqueta: 'Observación' },
    fechaNuevaEntrega: { etiqueta: 'Nueva entrega', formato: 'fechaHora' }
  },
  RADICACION: { fechaRadicacion: { etiqueta: 'Radicado en el juzgado', formato: 'fechaHora' }, fuente: { etiqueta: 'Fuente' } },
  DECISION: { instancia: { etiqueta: 'Instancia' }, sentido: { etiqueta: 'Sentido' }, favorable: { etiqueta: 'Favorable', formato: 'siNo' } }
}

const vacio = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

const clave = (valor: unknown, campo: Campo) => {
  if (vacio(valor)) return ''
  if (campo.formato === 'fecha' || campo.formato === 'fechaHora') return new Date(String(valor instanceof Date ? valor.toISOString() : valor)).toISOString()
  if (campo.formato === 'siNo') return valor === true || valor === 'true' ? 'si' : ''
  return String(valor).trim()
}

const formatear = async (valor: unknown, campo: Campo): Promise<string | null> => {
  if (vacio(valor)) return null
  if (campo.referencia) return (await campo.referencia(Number(valor))) ?? `#${valor}`
  if (campo.formato === 'fechaHora' || campo.formato === 'fecha') return textoFechaHora(valor as Date)
  if (campo.formato === 'siNo') return valor === true || valor === 'true' ? 'Sí' : 'No'
  return String(valor).trim()
}

type Pendiente = { casoId: number, actuacionId: number | null, seccion: string, accion: HistorialCaso['accion'], crudos: { campo: Campo, antes: unknown, despues: unknown }[] }

const guardar = async (p: Pendiente, contexto: ContextoPeticion) => {
  try {
    const cambios: CambioCampo[] = []
    for (const c of p.crudos) {
      const [antes, despues] = await Promise.all([formatear(c.antes, c.campo), formatear(c.despues, c.campo)])
      if (antes !== despues) cambios.push({ campo: c.campo.etiqueta, antes, despues })
    }
    if (p.accion === 'MODIFICADO' && !cambios.length) return
    await HistorialCaso.create({
      casoId: p.casoId, actuacionId: p.actuacionId, seccion: p.seccion, accion: p.accion, cambios,
      usuarioId: contexto.usuarioId, nombreUsuario: contexto.nombre, origen: contexto.origen
    })
  } catch (error) {
    // El historial nunca frena la operación que lo generó
    console.error('❌ Historial del caso:', error)
  }
}

// Después de confirmar la transacción: si se revierte, no queda rastro de algo que no pasó
const programar = (p: Pendiente, transaction?: Transaction | null) => {
  if (!p.casoId) return
  const contexto = contextoActual()
  if (transaction) transaction.afterCommit(() => guardar(p, contexto))
  else void guardar(p, contexto)
}

type ModeloConHooks = { addHook: (evento: string, nombre: string, fn: (...args: any[]) => unknown) => unknown }

const vigilar = (
  modelo: unknown,
  seccion: string,
  ids: (i: Model) => Promise<{ casoId: number, actuacionId: number | null }>
) => {
  const campos = CAMPOS[seccion]
  const registrar = (accion: Pendiente['accion']) => async (instancia: Model, o: { transaction?: Transaction | null }) => {
    const crudos = Object.entries(campos).flatMap(([atributo, campo]) => {
      const antes = accion === 'CREADO' ? null : instancia.previous(atributo as never)
      const despues = accion === 'ELIMINADO' ? null : instancia.get(atributo)
      return clave(antes, campo) === clave(despues, campo) ? [] : [{ campo, antes, despues }]
    })
    if (accion === 'MODIFICADO' && !crudos.length) return
    const { casoId, actuacionId } = await ids(instancia)
    programar({ casoId, actuacionId, seccion, accion, crudos }, o.transaction)
  }
  const m = modelo as ModeloConHooks
  m.addHook('afterCreate', 'historial', registrar('CREADO'))
  m.addHook('afterUpdate', 'historial', registrar('MODIFICADO'))
  m.addHook('afterDestroy', 'historial', registrar('ELIMINADO'))
  // Model.update(...) en bloque no pasa por los hooks de cada fila si no se pide
  m.addHook('beforeBulkUpdate', 'historial', (o: { individualHooks?: boolean }) => { o.individualHooks = true })
  m.addHook('beforeBulkDestroy', 'historial', (o: { individualHooks?: boolean }) => { o.individualHooks = true })
}

const casoDeActuacion = async (actuacionId: number) => ({
  casoId: (await Actuacion.findByPk(actuacionId, { attributes: ['casoId'] }))?.casoId ?? 0,
  actuacionId
})

let activo = false

export const activarHistorialCasos = () => {
  if (activo) return
  activo = true
  vigilar(Caso, 'CASO', async i => ({ casoId: Number(i.get('id')), actuacionId: null }))
  vigilar(Actuacion, 'ACTUACION', async i => ({ casoId: Number(i.get('casoId')), actuacionId: Number(i.get('id')) }))
  vigilar(SolicitudInsumo, 'INSUMO', async i => casoDeActuacion(Number(i.get('actuacionId'))))
  vigilar(Escrito, 'ESCRITO', async i => casoDeActuacion(Number(i.get('actuacionId'))))
  vigilar(RadicacionJuzgado, 'RADICACION', async i => casoDeActuacion(Number(i.get('actuacionId'))))
  vigilar(Decision, 'DECISION', async i => casoDeActuacion(Number(i.get('actuacionId'))))
  vigilar(Devolucion, 'DEVOLUCION', async i => {
    const escrito = await Escrito.findByPk(Number(i.get('escritoId')), { attributes: ['actuacionId'] })
    return escrito ? casoDeActuacion(escrito.actuacionId) : { casoId: 0, actuacionId: null }
  })
}
