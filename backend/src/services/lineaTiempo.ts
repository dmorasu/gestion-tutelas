import { Op } from 'sequelize'
import { Actuacion, Alerta, Archivo, Caso, Correo, HistorialCaso, Usuario } from '../models'
import type { CambioCampo } from '../models/correos'
import { NOMBRES_CRITICIDAD, NOMBRES_ETAPAS, type Criticidad, type Etapa } from './constantes'
import { NOMBRES_ALERTA } from './alertas'

// =====================================
// LÍNEA DE TIEMPO DEL CASO (mismo diseño que el historial de trámites de Nodex)
// Junta la bitácora (cambios de caso, actuación, insumos, escritos, devoluciones, radicación) con
// los correos que entraron y salieron, los documentos que se subieron y las alertas. Cada evento
// lleva un tipo (de ahí el ícono y el filtro), un título en lenguaje natural, quién y cuándo, la
// etapa a la que pertenece y, si aplica, el antes → después de cada campo.
// =====================================

export type EventoCaso = {
  clave: string
  fecha: string
  tipo: 'CREADO' | 'ESTADO' | 'ASIGNACION' | 'PLAZOS' | 'INSUMO' | 'ESCRITO' | 'DEVOLUCION' | 'RADICACION' | 'CORREO_SALIDA' | 'CORREO_ENTRADA' | 'DOCUMENTO' | 'ALERTA' | 'DATOS'
  titulo: string
  detalle: string | null
  cambios: CambioCampo[]
  usuario: string | null
  origen: string | null
  etapa: string | null
}

// La bitácora guarda los códigos: aquí se traducen para leerlos
const ESTADOS_ACTUACION: Record<string, string> = {
  POR_ASUMIR: 'Por asumir', EN_ANALISIS: 'En análisis', EN_INSUMOS: 'Esperando insumos', EN_PROYECCION: 'En proyección',
  EN_REVISION: 'Con el revisor', AJUSTE_INTERNO: 'Ajuste pedido por el revisor', ENTREGADO: 'Entregado a la entidad',
  DEVUELTO: 'Devuelto por la entidad', APROBADO: 'Aprobado por la entidad', RADICADO: 'Radicado', CERRADA: 'Cerrada',
  ABIERTO: 'Abierto', CERRADO: 'Cerrado'
}
const ESTADOS_ESCRITO: Record<string, string> = {
  BORRADOR: 'En elaboración', EN_REVISION: 'Con el revisor', AJUSTE_INTERNO: 'Ajuste pedido por el revisor',
  ENTREGADO: 'Entregado', DEVUELTO: 'Devuelto por la entidad', APROBADO: 'Aprobado'
}
const TIPOS_DEVOLUCION: Record<string, string> = { FONDO: 'de fondo', SOPORTE: 'por falta de soporte', CRITERIO: 'por criterio institucional', ESTILO: 'de estilo', SIN_CLASIFICAR: 'sin clasificar' }
const PROPOSITOS: Record<string, string> = {
  ACUSE_ASIGNACION: 'la confirmación de recibido', ACUSE_PAQUETE: 'la confirmación del paquete', SOLICITUD_DATOS_FALTANTES: 'la solicitud de datos faltantes',
  ACUSE_DATOS_FALTANTES: 'la confirmación de datos recibidos', SOLICITUD_INSUMOS: 'la solicitud de insumos', ACUSE_INSUMOS: 'la confirmación de insumos recibidos',
  ENTREGA_V1: 'la entrega V1', ENTREGA_V2: 'la entrega corregida', ALERTA: 'una alerta', LIBRE: 'un correo'
}
const ENTRANTES: Record<string, string> = {
  ASIGNACION: 'Llegó la asignación', SEGUIMIENTO: 'Llegó un correo del caso', RESPUESTA_INSUMOS: 'Llegaron insumos',
  RESPUESTA_DATOS_FALTANTES: 'Llegaron los datos faltantes', RESPUESTA_ENTREGA: 'La entidad respondió la entrega',
  ACUSE_ENTIDAD: 'La entidad acusó recibido', APROBACION_ENTIDAD: 'La entidad aprobó el escrito', DEVOLUCION_ENTIDAD: 'La entidad devolvió el escrito'
}
const TIPOS_DOC: Record<string, string> = { ESCRITO: 'el escrito', ANEXO: 'un anexo', INSUMO: 'un insumo', SOPORTE: 'un soporte', RESPUESTA: 'una respuesta de la entidad', CORREO: 'un documento' }

const legible = (campo: string, valor: string | null) => {
  if (valor === null) return null
  if (campo === 'Estado' || campo === 'Etapa actual') return ESTADOS_ACTUACION[valor] ?? NOMBRES_ETAPAS[valor as Etapa] ?? valor
  if (campo === 'Estado del escrito') return ESTADOS_ESCRITO[valor] ?? valor
  if (campo === 'Criticidad') return NOMBRES_CRITICIDAD[valor as Criticidad] ?? valor
  if (campo === 'Tipo de devolución') return TIPOS_DEVOLUCION[valor] ?? valor
  return valor
}
const traducir = (cambios: CambioCampo[]) => cambios.map(c => ({ campo: c.campo, antes: legible(c.campo, c.antes), despues: legible(c.campo, c.despues) }))
const cambio = (cambios: CambioCampo[], campo: string) => cambios.find(c => c.campo === campo)

// Título y tipo de cada registro de la bitácora
const describir = (h: HistorialCaso, etapa: string | null): Pick<EventoCaso, 'tipo' | 'titulo'> => {
  const c = h.cambios
  const de = etapa ? ` de ${etapa.toLowerCase()}` : ''
  switch (h.seccion) {
    case 'CASO':
      if (h.accion === 'CREADO') return { tipo: 'CREADO', titulo: 'Registró el caso' }
      if (cambio(c, 'Estado')) return { tipo: 'ESTADO', titulo: cambio(c, 'Estado')!.despues === 'CERRADO' ? 'Cerró el caso' : 'Reabrió el caso' }
      return { tipo: 'DATOS', titulo: 'Editó los datos del caso' }
    case 'ACTUACION': {
      if (h.accion === 'CREADO') return { tipo: 'CREADO', titulo: `Abrió la actuación${de}` }
      const estado = cambio(c, 'Estado')
      if (estado) return { tipo: 'ESTADO', titulo: `Pasó a ${(ESTADOS_ACTUACION[estado.despues ?? ''] ?? estado.despues ?? '').toLowerCase()}` }
      const responsable = cambio(c, 'Auxiliar') ?? cambio(c, 'Revisor')
      if (responsable) {
        const quien = responsable.campo.toLowerCase()
        return { tipo: 'ASIGNACION', titulo: !responsable.antes ? `Asignó el ${quien}` : !responsable.despues ? `Quitó el ${quien}` : `Cambió el ${quien}` }
      }
      if (c.some(x => ['Vencimiento', 'Vencimiento informado', 'Fecha límite ANS', 'Notificación', 'Término', 'Criticidad'].includes(x.campo))) return { tipo: 'PLAZOS', titulo: 'Actualizó plazos o criticidad' }
      return { tipo: 'DATOS', titulo: 'Editó la actuación' }
    }
    case 'INSUMO':
      if (h.accion === 'CREADO') return { tipo: 'INSUMO', titulo: 'Pidió un insumo' }
      if (cambio(c, 'Recibido')?.despues) return { tipo: 'INSUMO', titulo: 'Recibió un insumo' }
      return { tipo: 'INSUMO', titulo: 'Actualizó un insumo' }
    case 'ESCRITO': {
      const version = cambio(c, 'Versión')?.despues
      if (h.accion === 'CREADO') return { tipo: 'ESCRITO', titulo: `Empezó el escrito V${version ?? ''}` }
      const estado = cambio(c, 'Estado del escrito')?.despues
      const titulos: Record<string, string> = {
        EN_REVISION: 'Envió el escrito al revisor', AJUSTE_INTERNO: 'El revisor pidió ajustes', ENTREGADO: 'Entregó el escrito a la entidad',
        DEVUELTO: 'El escrito quedó devuelto', APROBADO: 'El escrito quedó aprobado'
      }
      if (estado && titulos[estado]) return { tipo: 'ESCRITO', titulo: titulos[estado] }
      if (cambio(c, 'Acuse de la entidad')) return { tipo: 'ESCRITO', titulo: 'La entidad acusó recibido del escrito' }
      return { tipo: 'ESCRITO', titulo: 'Actualizó el escrito' }
    }
    case 'DEVOLUCION': {
      const tipo = cambio(c, 'Tipo de devolución')?.despues
      if (h.accion === 'CREADO') return { tipo: 'DEVOLUCION', titulo: `Registró una devolución ${TIPOS_DEVOLUCION[tipo ?? ''] ?? ''}`.trim() }
      return { tipo: 'DEVOLUCION', titulo: cambio(c, 'Nueva entrega') ? 'Corrigió la devolución' : 'Actualizó la devolución' }
    }
    case 'RADICACION': return { tipo: 'RADICACION', titulo: 'Registró la radicación en el juzgado' }
    case 'DECISION': return { tipo: 'RADICACION', titulo: 'Registró una decisión judicial' }
    default: return { tipo: 'DATOS', titulo: 'Cambio en el caso' }
  }
}

const iso = (d: Date | string) => new Date(d).toISOString()

export const lineaTiempo = async (casoId: number): Promise<EventoCaso[]> => {
  const [caso, bitacora, actuaciones, correos, documentos, alertas] = await Promise.all([
    Caso.findByPk(casoId, { attributes: ['id'] }),
    HistorialCaso.findAll({ where: { casoId }, order: [['createdAt', 'DESC']], limit: 1000 }),
    Actuacion.findAll({ where: { casoId }, attributes: ['id', 'etapa'] }),
    Correo.findAll({
      where: { casoId },
      attributes: ['id', 'direccion', 'buzon', 'proposito', 'asunto', 'estado', 'remitente', 'fechaCorreo', 'actuacionId'],
      include: [{ model: Usuario, attributes: ['nombre'] }]
    }),
    // Lo que subió una persona (lo que llegó por correo sale con su correo)
    Archivo.findAll({ where: { casoId, correoId: null, usuarioId: { [Op.ne]: null } }, attributes: ['id', 'nombre', 'tipo', 'actuacionId', 'usuarioId', 'createdAt'] }),
    Alerta.findAll({ where: { casoId }, include: [{ model: Usuario, attributes: ['nombre'] }] })
  ])
  if (!caso) return []
  const etapaDe = new Map(actuaciones.map(a => [a.id, NOMBRES_ETAPAS[a.etapa]]))
  const etapa = (id: number | null | undefined) => (id ? etapaDe.get(id) ?? null : null)
  const usuarios = new Map((await Usuario.findAll({ where: { id: [...new Set(documentos.map(d => d.usuarioId!))] }, attributes: ['id', 'nombre'] })).map(u => [u.id, u.nombre]))

  const eventos: EventoCaso[] = []
  for (const h of bitacora) {
    const e = etapa(h.actuacionId)
    eventos.push({
      clave: `bitacora-${h.id}`, fecha: iso(h.get('createdAt') as Date), ...describir(h, e),
      // Al crear, lo que vale la pena leer es el insumo pedido o la observación de la devolución
      detalle: h.accion === 'CREADO' ? cambio(h.cambios, 'Insumo')?.despues ?? cambio(h.cambios, 'Observación')?.despues ?? null : null,
      // La creación repite todos los campos: en el historial solo se muestran los cambios
      cambios: h.accion === 'CREADO' ? [] : traducir(h.cambios),
      usuario: h.nombreUsuario, origen: h.origen, etapa: e
    })
  }
  for (const c of correos) {
    const saliente = c.direccion === 'SALIENTE'
    const titulo = saliente
      ? `${c.estado === 'SIMULADO' ? 'Registró (simulado)' : c.estado === 'ERROR' ? 'No pudo enviar' : 'Envió'} ${PROPOSITOS[c.proposito ?? ''] ?? 'un correo'}`
      : ENTRANTES[c.proposito ?? ''] ?? 'Llegó un correo'
    eventos.push({
      clave: `correo-${c.id}`, fecha: iso(c.fechaCorreo), tipo: saliente ? 'CORREO_SALIDA' : 'CORREO_ENTRADA', titulo,
      detalle: c.asunto, cambios: [], usuario: saliente ? c.usuario?.nombre ?? null : c.remitente, origen: saliente ? null : 'BUZON', etapa: etapa(c.actuacionId)
    })
  }
  for (const d of documentos) {
    eventos.push({
      clave: `documento-${d.id}`, fecha: iso(d.get('createdAt') as Date), tipo: 'DOCUMENTO', titulo: `Subió ${TIPOS_DOC[d.tipo] ?? 'un documento'}`,
      detalle: d.nombre, cambios: [], usuario: usuarios.get(d.usuarioId!) ?? null, origen: null, etapa: etapa(d.actuacionId)
    })
  }
  for (const a of alertas) {
    eventos.push({
      clave: `alerta-${a.id}`, fecha: iso(a.fechaDeteccion), tipo: 'ALERTA', titulo: `Alerta: ${NOMBRES_ALERTA[a.tipo].toLowerCase()}`,
      detalle: a.mensaje, cambios: [], usuario: null, origen: 'SISTEMA', etapa: etapa(a.actuacionId)
    })
    if (a.estado !== 'PENDIENTE') {
      eventos.push({
        clave: `alerta-${a.id}-${a.estado}`, fecha: iso(a.fechaEmision ?? a.get('updatedAt') as Date), tipo: 'ALERTA',
        titulo: a.estado === 'EMITIDA' ? 'Emitió la alerta al cliente' : 'Descartó la alerta', detalle: a.motivoDescarte,
        cambios: [], usuario: a.usuario?.nombre ?? null, origen: null, etapa: etapa(a.actuacionId)
      })
    }
  }
  return eventos.sort((a, b) => b.fecha.localeCompare(a.fecha))
}
