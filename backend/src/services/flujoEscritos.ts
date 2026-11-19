import { Op } from 'sequelize'
import { Actuacion, Archivo, Caso, Correo, Devolucion, Escrito, ItemCatalogo, RadicacionJuzgado, SolicitudInsumo } from '../models'
import { enviarPlantilla, listaCorreo, NOTA_EXPEDIENTE } from './buzon/correosSalida'
import { generarFicha, solicitudExpediente } from './documentosWord'
import { compartirCarpeta } from './almacenamiento'
import { carpetaActuacion, guardarEnExpediente } from './expediente'
import { asignacionEfectiva, finDeDiasHabilesSiguientes } from './plazos'
import { parametro } from './parametros'
import { recalcularPlazos } from './registroCasos'
import { revisorDeEquipo } from './reparto'
import { textoFechaHora } from '../utils/fechaColombia'
import { tipoEscrito, DOCUMENTOS_ENTREGA, type DocumentoEntrega } from './constantes'
import { ErrorNegocio } from '../utils/errores'

// =====================================
// FLUJO DEL ESCRITO (manual §11 y roles del cliente)
// Auxiliar: pide datos faltantes e insumos, proyecta y envía el paquete al revisor.
// Revisor: lo devuelve con observaciones o lo entrega a la entidad (V1; V2 tras una devolución).
// Entidad: acusa, aprueba o devuelve (fondo, soporte, criterio o estilo); luego informa la radicación.
// Cada paso deja fecha y hora: de ahí salen los ANS.
// =====================================

const cargarActuacion = async (actuacionId: number) => {
  const a = await Actuacion.findByPk(actuacionId, { include: [{ model: Caso, attributes: ['id', 'radicado', 'numeroInterno'] }] })
  if (!a?.caso) throw new ErrorNegocio('La actuación no existe', 404)
  if (a.estado === 'CERRADA') throw new ErrorNegocio('La actuación está cerrada')
  return a
}

const menor = (a: Date, b: Date | null) => (b && b < a ? b : a)

const correosDe = (clave: 'CORREOS_INSUMOS' | 'CORREOS_ENTREGA' | 'CORREOS_COPIA_ENTREGA') => parametro<string[]>(clave).filter(Boolean)

// El correo de salida no salió: no se avanza el estado (se puede reintentar)
const exigirEnviado = (correo: Correo) => {
  if (correo.estado === 'ERROR') throw new ErrorNegocio(`No se pudo enviar el correo: ${correo.error ?? 'error de Graph'}`)
}

// Ítems marcados más lo escrito en "otros" (una línea por ítem), sin repetidos
const unirItems = (items: string[] = [], otros?: string | null) =>
  [...new Set([...items, ...(otros ?? '').split('\n')].map(x => x.trim()).filter(Boolean))]

// ── Datos faltantes de la asignación (buzón de asignaciones, en el hilo de la asignación) ──
// Reunión 18-nov: los pide la asistencia, marcando la lista general de la matriz de insumos
export const solicitarDatosFaltantes = async (d: { actuacionId: number, items?: string[], otros?: string | null, para?: string[], adjuntarExpediente?: boolean, usuarioId: number }) => {
  const a = await cargarActuacion(d.actuacionId)
  const pedidos = unirItems(d.items, d.otros)
  if (!pedidos.length) throw new ErrorNegocio('Marque o escriba qué datos faltan')
  const asignacion = await Correo.findOne({ where: { actuacionId: a.id, proposito: 'ASIGNACION' }, attributes: ['id', 'remitente'] })
  const para = d.para?.length ? d.para : asignacion?.remitente ? [asignacion.remitente] : []
  if (!para.length) throw new ErrorNegocio('La asignación no llegó por correo: indique a quién pedir los datos')
  // Modelo de la firma: va el borrador de solicitud del expediente al despacho (1.1), que también queda
  // en el expediente del caso
  const borrador = d.adjuntarExpediente !== false ? await solicitudExpediente(a.id) : null
  const correo = await enviarPlantilla({
    codigo: 'SOLICITUD_DATOS_FALTANTES', actuacionId: a.id, para, responderACorreoId: asignacion?.id ?? null,
    extra: { detalle: listaCorreo(pedidos), notaExpediente: borrador ? NOTA_EXPEDIENTE : '' }, adjuntos: borrador ? [borrador] : [], usuarioId: d.usuarioId
  })
  exigirEnviado(correo)
  if (borrador) {
    const archivo = await guardarEnExpediente({ actuacionId: a.id, sub: 'Soportes', ...borrador, tipo: 'SOPORTE', usuarioId: d.usuarioId })
      .catch(error => { console.error('❌ Borrador del expediente al expediente del caso', error); return null })
    await archivo?.update({ correoId: correo.id })
  }
  // D6: sin los insumos mínimos de la asignación el ANS no corre hasta que lleguen
  const yaPedidos = new Set(a.datosSolicitados.map(x => x.nombre))
  await a.update({ datosFaltantesPendientes: true, datosSolicitados: [...a.datosSolicitados, ...pedidos.filter(x => !yaPedidos.has(x)).map(nombre => ({ nombre, recibido: false }))] })
  await recalcularPlazos(a.id)
  return correo
}

// Llegaron datos faltantes: se marcan los que vinieron (la confirmación los lista) y, si ya no falta
// nada de lo pedido, el ANS corre desde la llegada de este correo
export const confirmarDatosFaltantes = async (d: { correoId: number, recibidos?: string[], enviarAcuse: boolean, usuarioId: number }) => {
  const correo = await Correo.findByPk(d.correoId)
  if (!correo?.actuacionId) throw new ErrorNegocio('El correo no está asociado a una actuación')
  const a = await Actuacion.findByPk(correo.actuacionId)
  if (!a) throw new ErrorNegocio('La actuación no existe', 404)
  // Sin lista (pedido anterior a las casillas): se entiende que llegó todo
  const recibidos = new Set(d.recibidos ?? a.datosSolicitados.filter(x => !x.recibido).map(x => x.nombre))
  const datosSolicitados = a.datosSolicitados.map(x => (recibidos.has(x.nombre) ? { ...x, recibido: true } : x))
  if (d.enviarAcuse && correo.remitente) {
    exigirEnviado(await enviarPlantilla({
      codigo: 'ACUSE_DATOS_FALTANTES', actuacionId: a.id, para: [correo.remitente], responderACorreoId: correo.id,
      extra: { detalle: listaCorreo([...recibidos], 'La información y los documentos solicitados.') }, usuarioId: d.usuarioId
    }))
  }
  await correo.update({ porRevisar: false, proposito: 'RESPUESTA_DATOS_FALTANTES', usuarioId: d.usuarioId })
  const completos = datosSolicitados.every(x => x.recibido)
  // El ANS cuenta desde la llegada del correo con los datos, no desde que se confirma
  await a.update({ datosSolicitados, ...(completos && { datosFaltantesPendientes: false, fechaDatosCompletos: correo.fechaCorreo }) })
  await recalcularPlazos(a.id)
  return { completos, faltan: datosSolicitados.filter(x => !x.recibido).map(x => x.nombre) }
}

// ── Insumos (buzón de insumos) ──
// El cliente tiene DIAS_SUMINISTRO_INSUMOS días hábiles; en lo crítico, el mismo día (manual §11)
const limiteInsumos = (a: Actuacion, desde: Date) => {
  const inicio = asignacionEfectiva(desde, a.etapa)
  const limite = finDeDiasHabilesSiguientes(inicio, a.criticidad === 'CRITICO' ? 0 : parametro<number>('DIAS_SUMINISTRO_INSUMOS'), a.etapa)
  return menor(limite, a.fechaVencimiento)
}

type InsumoPedido = { descripcion: string, minimo?: boolean, itemCatalogoId?: number | null, clase?: 'DOCUMENTO' | 'INFORMACION' | null }

export const solicitarInsumos = async (d: { actuacionId: number, insumos: InsumoPedido[], usuarioId: number }) => {
  const a = await cargarActuacion(d.actuacionId)
  const items = d.insumos
    .map(i => ({ descripcion: String(i.descripcion ?? '').trim(), minimo: i.minimo !== false, itemCatalogoId: i.itemCatalogoId ? Number(i.itemCatalogoId) : null, clase: i.clase ?? null }))
    .filter(i => i.descripcion)
  if (!items.length) throw new ErrorNegocio('Indique al menos un insumo')
  // El modelo de la firma explica en el correo los derechos y los hechos: sin ellos saldría incompleto
  const caso = await Caso.findByPk(a.casoId, { attributes: ['resumenHechos', 'derechosIds', 'derechosInvolucrados'] })
  if (!caso?.resumenHechos?.trim() || !(caso.derechosIds.length || caso.derechosInvolucrados?.trim())) {
    throw new ErrorNegocio('Registre en el caso el resumen de los hechos y los derechos antes de pedir insumos: van en el correo')
  }
  const para = correosDe('CORREOS_INSUMOS')
  if (!para.length) throw new ErrorNegocio('Falta a quién pedir los insumos: configure CORREOS_INSUMOS en Parámetros')
  const ahora = new Date()
  const limite = limiteInsumos(a, ahora)
  const correo = await enviarPlantilla({
    codigo: 'SOLICITUD_INSUMOS', actuacionId: a.id, para,
    extra: { detalle: listaCorreo(items.map(i => i.descripcion)), venceInsumos: textoFechaHora(limite) }, usuarioId: d.usuarioId
  })
  exigirEnviado(correo)
  await SolicitudInsumo.bulkCreate(items.map(i => ({
    actuacionId: a.id, descripcion: i.descripcion, minimo: i.minimo, itemCatalogoId: i.itemCatalogoId, clase: i.clase,
    fechaSolicitud: correo.fechaCorreo, fechaLimite: limite, conversationId: correo.conversationId
  })))
  const proyectando = ['POR_ASUMIR', 'EN_ANALISIS', 'EN_PROYECCION'].includes(a.estado)
  await a.update({ requiereInsumos: true, ...(proyectando && { estado: 'EN_INSUMOS' }) })
  await recalcularPlazos(a.id)
  return correo
}

// Marca los insumos que llegaron. La hora es la de llegada del correo (no la de la confirmación):
// el ANS no castiga la demora en revisar la bandeja
export const confirmarInsumos = async (d: { actuacionId: number, insumoIds: number[], correoId?: number | null, fecha?: Date | null, enviarAcuse: boolean, usuarioId: number }) => {
  const a = await cargarActuacion(d.actuacionId)
  const correo = d.correoId ? await Correo.findByPk(d.correoId) : null
  const fecha = correo?.fechaCorreo ?? d.fecha ?? new Date()
  if (d.insumoIds.length) {
    await SolicitudInsumo.update({ fechaRecepcion: fecha }, { where: { id: d.insumoIds, actuacionId: a.id, fechaRecepcion: null }, individualHooks: true })
  }
  if (correo) {
    if (d.enviarAcuse && correo.remitente) {
      // La confirmación lista lo que llegó en este correo (lo valida el auxiliar que lo recibe)
      const llegaron = d.insumoIds.length ? await SolicitudInsumo.findAll({ where: { id: d.insumoIds, actuacionId: a.id }, attributes: ['descripcion'] }) : []
      exigirEnviado(await enviarPlantilla({
        codigo: 'ACUSE_INSUMOS', actuacionId: a.id, para: [correo.remitente], responderACorreoId: correo.id,
        extra: { detalle: listaCorreo(llegaron.map(x => x.descripcion), 'Los insumos remitidos en su correo.') }, usuarioId: d.usuarioId
      }))
    }
    await correo.update({ porRevisar: false, proposito: 'RESPUESTA_INSUMOS', usuarioId: d.usuarioId })
  }
  const pendientes = await SolicitudInsumo.count({ where: { actuacionId: a.id, fechaRecepcion: null } })
  if (!pendientes && a.estado === 'EN_INSUMOS') await a.update({ estado: 'EN_PROYECCION' })
  await recalcularPlazos(a.id)
  return { pendientes }
}

// ── Escrito ──
const ABIERTOS = ['BORRADOR', 'EN_REVISION', 'AJUSTE_INTERNO']

// Reunión 18-nov: el escrito de emergencia exige haber pedido insumos antes (no se arma ni avanza sin eso)
const exigirInsumosSiEmergencia = async (a: Actuacion) => {
  if (!a.tipoRespuestaId) return
  const tipo = await ItemCatalogo.findByPk(a.tipoRespuestaId, { attributes: ['codigo', 'nombre'] })
  if (tipo?.codigo === 'EMERGENCIA' && !(await SolicitudInsumo.count({ where: { actuacionId: a.id } }))) {
    throw new ErrorNegocio(`Para el ${tipo.nombre.toLowerCase()} primero hay que pedir los insumos`)
  }
}

// El escrito que se está armando; si no hay o el último fue devuelto, empieza la versión siguiente
export const escritoEnElaboracion = async (actuacionId: number) => {
  const a = await cargarActuacion(actuacionId)
  await exigirInsumosSiEmergencia(a)
  const ultimo = await Escrito.findOne({ where: { actuacionId }, order: [['version', 'DESC']] })
  if (ultimo && ABIERTOS.includes(ultimo.estado)) return ultimo
  if (ultimo && ultimo.estado !== 'DEVUELTO') throw new ErrorNegocio(`La V${ultimo.version} ya se entregó: espere la respuesta de la entidad`)
  const escrito = await Escrito.create({ actuacionId, version: (ultimo?.version ?? 0) + 1, tipo: tipoEscrito(a), estado: 'BORRADOR' })
  if (['POR_ASUMIR', 'EN_ANALISIS', 'DEVUELTO'].includes(a.estado)) await a.update({ estado: 'EN_PROYECCION' })
  return escrito
}

const escritoActual = async (actuacionId: number, estados: string[], mensaje: string) => {
  const escrito = await Escrito.findOne({ where: { actuacionId, estado: estados }, order: [['version', 'DESC']] })
  if (!escrito) throw new ErrorNegocio(mensaje)
  return escrito
}

export const enviarARevision = async (d: { actuacionId: number, usuarioId: number }) => {
  const a = await cargarActuacion(d.actuacionId)
  const escrito = await escritoActual(a.id, ['BORRADOR', 'AJUSTE_INTERNO'], 'No hay un escrito en elaboración: suba primero el escrito')
  if (!(await Archivo.count({ where: { escritoId: escrito.id, tipo: 'ESCRITO' } }))) throw new ErrorNegocio('Suba el escrito (Word) antes de enviarlo a revisión')
  await exigirInsumosSiEmergencia(a)
  const ahora = new Date()
  await escrito.update({ estado: 'EN_REVISION', fechaEnvioRevision: ahora, elaboradoPorId: escrito.elaboradoPorId ?? d.usuarioId })
  const revisorId = a.revisorId ?? await revisorDeEquipo(a.equipoId)
  await a.update({ estado: 'EN_REVISION', fechaEnvioRevision: ahora, revisorId })
  return escrito
}

export const devolverAlAuxiliar = async (d: { actuacionId: number, observacion: string, usuarioId: number }) => {
  const a = await cargarActuacion(d.actuacionId)
  if (!d.observacion.trim()) throw new ErrorNegocio('Indique qué debe ajustar el auxiliar')
  const escrito = await escritoActual(a.id, ['EN_REVISION'], 'El escrito no está en revisión')
  await escrito.update({ estado: 'AJUSTE_INTERNO', observacionRevision: d.observacion.trim(), revisadoPorId: d.usuarioId, fechaRevision: new Date() })
  await a.update({ estado: 'AJUSTE_INTERNO' })
  return escrito
}

// Entrega a la entidad por el buzón de entregas, con enlace a la carpeta del escrito en SharePoint.
// Modelo de la firma: el correo lista los documentos entregados (la ficha técnica siempre) y los anexos
export const entregar = async (d: { actuacionId: number, documentos?: string[], otroDocumento?: string | null, anexos?: string[], otrosAnexos?: string | null, usuarioId: number }) => {
  const a = await cargarActuacion(d.actuacionId)
  const documentos = unirItems([
    DOCUMENTOS_ENTREGA.FICHA,
    ...(d.documentos ?? []).map(k => DOCUMENTOS_ENTREGA[k as DocumentoEntrega]).filter(Boolean)
  ], d.otroDocumento)
  const anexos = unirItems(d.anexos, d.otrosAnexos)
  const escrito = await escritoActual(a.id, ['EN_REVISION'], 'El escrito debe estar revisado (en revisión) para entregarlo')
  if (!(await Archivo.count({ where: { escritoId: escrito.id, tipo: 'ESCRITO' } }))) throw new ErrorNegocio('El paquete no tiene el escrito')
  const para = correosDe('CORREOS_ENTREGA')
  const cc = correosDe('CORREOS_COPIA_ENTREGA')
  if (!para.length) throw new ErrorNegocio('Falta el correo de la dependencia que recibe: configure CORREOS_ENTREGA en Parámetros')

  // La ficha técnica va siempre con el escrito (modelo de entrega): se genera con los datos de este momento
  await generarFicha({ actuacionId: a.id, escritoId: escrito.id, fechaEntrega: new Date(), entregados: [...documentos, ...anexos], usuarioId: d.usuarioId })
  const carpeta = carpetaActuacion(a.caso!, a.etapa, `Escritos/V${escrito.version}`)
  const { enlace } = await compartirCarpeta(carpeta, [...para, ...cc], parametro<number>('DIAS_VIGENCIA_ENLACE'))
  const correo = await enviarPlantilla({
    codigo: escrito.version > 1 ? 'ENTREGA_V2' : 'ENTREGA_V1', actuacionId: a.id, para, cc,
    extra: {
      enlace, version: String(escrito.version), fechaEntrega: textoFechaHora(new Date()),
      documentos: listaCorreo(documentos), anexos: listaCorreo(anexos, 'Sin anexos.')
    },
    usuarioId: d.usuarioId
  })
  exigirEnviado(correo)
  await escrito.update({
    documentosEntregados: documentos, anexosEntregados: anexos,
    estado: 'ENTREGADO', enlace, fechaEntregaEntidad: correo.fechaCorreo, correoEntregaId: correo.id, limiteAns: a.fechaLimiteEntrega,
    revisadoPorId: d.usuarioId, fechaRevision: escrito.fechaRevision ?? correo.fechaCorreo
  })
  // Si es la corrección de una devolución, cierra el plazo de ANS-06
  const anterior = await Escrito.findOne({ where: { actuacionId: a.id, version: escrito.version - 1 }, include: [Devolucion] })
  const devolucion = anterior?.devoluciones?.find(x => !x.fechaNuevaEntrega)
  if (devolucion) await devolucion.update({ fechaNuevaEntrega: correo.fechaCorreo })
  await a.update({ estado: 'ENTREGADO' })
  return { escrito, correo }
}

// ── Respuesta de la entidad (buzón de entregas) ──
export const TIPOS_DEVOLUCION = ['FONDO', 'SOPORTE', 'CRITERIO', 'ESTILO'] as const

export const registrarRespuesta = async (d: {
  actuacionId: number, tipo: 'ACUSE' | 'APROBACION' | 'DEVOLUCION', correoId?: number | null, fecha?: Date | null,
  devolucion?: { tipo: typeof TIPOS_DEVOLUCION[number], motivoId?: number | null, observacion?: string | null }, usuarioId: number
}) => {
  const a = await cargarActuacion(d.actuacionId)
  const correo = d.correoId ? await Correo.findByPk(d.correoId) : null
  const fecha = correo?.fechaCorreo ?? d.fecha ?? new Date()
  const escrito = await escritoActual(a.id, d.tipo === 'ACUSE' ? ['ENTREGADO', 'APROBADO'] : ['ENTREGADO'], 'No hay un escrito entregado esperando respuesta')

  if (d.tipo === 'ACUSE') await escrito.update({ fechaAcuse: escrito.fechaAcuse ?? fecha })
  if (d.tipo === 'APROBACION') {
    await escrito.update({ estado: 'APROBADO', fechaAprobacion: fecha, fechaAcuse: escrito.fechaAcuse ?? fecha })
    await a.update({ estado: 'APROBADO' })
  }
  if (d.tipo === 'DEVOLUCION') {
    if (!d.devolucion || !TIPOS_DEVOLUCION.includes(d.devolucion.tipo)) throw new ErrorNegocio('Indique el tipo de devolución')
    // La entidad tiene DIAS_DEVOLUCION_ENTIDAD días hábiles; después es extemporánea (manual §17)
    const plazoEntidad = finDeDiasHabilesSiguientes(escrito.fechaEntregaEntidad ?? fecha, parametro<number>('DIAS_DEVOLUCION_ENTIDAD'), a.etapa)
    // ANS-06: corregir dentro del día hábil siguiente o antes del vencimiento, si es menor. Desde la
    // hora del correo de devolución, sin la hora de corte de la asignación (D20)
    const limite = menor(finDeDiasHabilesSiguientes(fecha, parametro<number>('DIAS_ANS06'), a.etapa), a.fechaVencimiento)
    await Devolucion.create({
      escritoId: escrito.id, fechaDevolucion: fecha, tipo: d.devolucion.tipo, motivoId: d.devolucion.motivoId ?? null,
      observacion: d.devolucion.observacion?.trim() || null, fechaLimiteCorreccion: limite, extemporanea: fecha > plazoEntidad, correoId: correo?.id ?? null
    })
    await escrito.update({ estado: 'DEVUELTO', fechaAcuse: escrito.fechaAcuse ?? fecha })
    // Mientras se corrige, la fecha que manda en el tablero es la de ANS-06
    await a.update({ estado: 'DEVUELTO', fechaLimiteEntrega: limite })
  }
  if (correo) {
    const proposito = { ACUSE: 'ACUSE_ENTIDAD', APROBACION: 'APROBACION_ENTIDAD', DEVOLUCION: 'DEVOLUCION_ENTIDAD' }[d.tipo]
    await correo.update({ porRevisar: false, proposito, usuarioId: d.usuarioId })
  }
}

// ── Radicación y cierre ──
export const registrarRadicacion = async (d: { actuacionId: number, fecha: Date, usuarioId: number }) => {
  const a = await cargarActuacion(d.actuacionId)
  await RadicacionJuzgado.create({ actuacionId: a.id, fechaRadicacion: d.fecha, fuente: 'MANUAL' })
  await a.update({ estado: 'RADICADO' })
}

// Causales del manual (§27)
export const MOTIVOS_CIERRE = [
  'Presentada por la entidad y sin productos pendientes',
  'Reasignada formalmente por la entidad o el supervisor',
  'Excluida por duplicidad, falta de competencia o retiro',
  'Atendida directamente por la Defensa Jurídica',
  'Entregada a la entidad en la liquidación del contrato'
] as const

export const cerrarActuacion = async (d: { actuacionId: number, motivo: string }) => {
  const a = await cargarActuacion(d.actuacionId)
  if (!d.motivo.trim()) throw new ErrorNegocio('Indique la causal de cierre')
  const ahora = new Date()
  await a.update({ estado: 'CERRADA', fechaCierre: ahora })
  // Sin otras actuaciones abiertas, el caso también se cierra con la misma causal
  const abiertas = await Actuacion.count({ where: { casoId: a.casoId, estado: { [Op.ne]: 'CERRADA' } } })
  if (!abiertas) await Caso.update({ estado: 'CERRADO', fechaCierre: ahora, motivoCierre: d.motivo.trim().slice(0, 200) }, { where: { id: a.casoId }, individualHooks: true })
}
