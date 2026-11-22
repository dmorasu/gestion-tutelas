import { Op } from 'sequelize'
import { Actuacion, Alerta, Caso, CorteAlertas, Decision, SolicitudInsumo } from '../models'
import { asignacionEfectiva, finDeDiasHabilesSiguientes } from './plazos'
import { parametro } from './parametros'
import { enviarPlantilla, valoresDeActuacion } from './buzon/correosSalida'
import { NOMBRES_ETAPAS } from './constantes'
import { enBogota, minutosDeHora, textoFechaHora } from '../utils/fechaColombia'
import { esDiaHabil, esMedioDia } from '../utils/diasHabiles'
import { ErrorNegocio } from '../utils/errores'

// =====================================
// DETECCIÓN Y EMISIÓN DE ALERTAS (manual §22; el coordinador "comunica las alertas al cliente")
// La detección corre en el worker cada 30 minutos (y a pedido). Cada situación genera una sola alerta
// por actuación y tipo. El plazo para emitirla (ANS-08) es el fin del día hábil de la detección; si
// se detecta después del corte, el día hábil siguiente: la misma regla de la asignación.
// =====================================

export const NOMBRES_ALERTA: Record<Alerta['tipo'], string> = {
  TERMINO_PROXIMO: 'Término próximo a vencer',
  TERMINO_VENCIDO: 'Término vencido sin entrega',
  DESACATO: 'Desacato o requerimiento de cumplimiento',
  FALTA_INSUMOS: 'Falta de insumos',
  DUPLICIDAD: 'Duplicidad con otro operador',
  CUMPLIMIENTO_PENDIENTE: 'Fallo desfavorable sin asignación de cumplimiento'
}

const SIN_ENTREGAR = ['POR_ASUMIR', 'EN_ANALISIS', 'EN_INSUMOS', 'EN_PROYECCION', 'EN_REVISION', 'AJUSTE_INTERNO', 'DEVUELTO']

// Las que ya existen se leen de una vez: con miles de actuaciones abiertas, una consulta por
// actuación y tipo cada 30 minutos sería demasiado
let existentes = new Set<string>()

const crear = async (tipo: Alerta['tipo'], a: Actuacion, mensaje: string, ahora: Date) => {
  const clave = `${tipo}:${a.id}`
  if (existentes.has(clave)) return 0
  existentes.add(clave)
  const limite = finDeDiasHabilesSiguientes(asignacionEfectiva(ahora, a.etapa), 0, a.etapa)
  await Alerta.create({ tipo, casoId: a.casoId, actuacionId: a.id, mensaje, fechaDeteccion: ahora, fechaLimiteEmision: limite })
  return 1
}

export const detectarAlertas = async () => {
  const ahora = new Date()
  const horas = parametro<number>('HORAS_ALERTA_TERMINO')
  const abiertas = await Actuacion.findAll({
    where: { estado: { [Op.ne]: 'CERRADA' } },
    include: [{ model: Caso, attributes: ['id', 'numeroInterno', 'radicado', 'deOtroOperador', 'tipoSolicitud'] }]
  })
  existentes = new Set((await Alerta.findAll({ attributes: ['tipo', 'actuacionId'], raw: true })).map(x => `${x.tipo}:${x.actuacionId}`))
  let nuevas = 0
  for (const a of abiertas) {
    const etapa = NOMBRES_ETAPAS[a.etapa].toLowerCase()
    if (SIN_ENTREGAR.includes(a.estado) && a.fechaVencimiento) {
      if (a.fechaVencimiento < ahora) nuevas += await crear('TERMINO_VENCIDO', a, `El término de la ${etapa} venció el ${textoFechaHora(a.fechaVencimiento)} sin que se haya entregado el escrito.`, ahora)
      else if (a.fechaVencimiento.getTime() - ahora.getTime() < horas * 3600_000) {
        nuevas += await crear('TERMINO_PROXIMO', a, `El término de la ${etapa} vence el ${textoFechaHora(a.fechaVencimiento)} y el escrito aún no se ha entregado.`, ahora)
      }
    }
    if (['DESACATO', 'REQUERIMIENTO_PREVIO', 'CUMPLIMIENTO'].includes(a.etapa) && SIN_ENTREGAR.includes(a.estado)) {
      nuevas += await crear('DESACATO', a, `Se asignó un trámite de ${etapa}. Requiere atención inmediata y el cumplimiento material de la orden corresponde a la entidad.`, ahora)
    }
    if (a.caso?.deOtroOperador) {
      nuevas += await crear('DUPLICIDAD', a, a.caso.tipoSolicitud === 'PQRS'
        ? 'Según el archivo maestro, otro equipo de la entidad ya responde esta PQRS. Se suspende la respuesta para no dar una respuesta doble hasta que la entidad lo defina.'
        : 'El archivo maestro asigna este radicado a otro operador. Se suspende la elaboración hasta que el supervisor defina el operador.', ahora)
    }
  }
  // Insumos cuyo plazo para el cliente ya pasó sin llegar
  const vencidos = await SolicitudInsumo.findAll({
    where: { fechaRecepcion: null, fechaLimite: { [Op.lt]: ahora } },
    include: [{ model: Actuacion, where: { estado: { [Op.ne]: 'CERRADA' } } }]
  })
  const porActuacion = new Map<number, SolicitudInsumo[]>()
  for (const s of vencidos) porActuacion.set(s.actuacionId, [...(porActuacion.get(s.actuacionId) ?? []), s])
  for (const lista of porActuacion.values()) {
    const a = lista[0].actuacion!
    nuevas += await crear('FALTA_INSUMOS', a, `No han llegado los insumos pedidos el ${textoFechaHora(lista[0].fechaSolicitud)}: ${lista.map(s => s.descripcion).join('; ')}. El ANS sigue suspendido, pero el término judicial corre.`, ahora)
  }
  // D12: fallo desfavorable cuya asignación de cumplimiento no ha llegado en DIAS_ESPERA_CUMPLIMIENTO
  // días hábiles desde la notificación (o desde que se registró, si no hay notificación)
  const esperando = await Decision.findAll({
    where: { requiereCumplimiento: true, actuacionCumplimientoId: null },
    include: [{ model: Actuacion, include: [{ model: Caso, attributes: ['id', 'numeroInterno', 'radicado'] }] }]
  })
  for (const dec of esperando) {
    const desde = dec.fechaNotificacion ?? dec.createdAt
    if (!dec.actuacion || finDeDiasHabilesSiguientes(desde, parametro<number>('DIAS_ESPERA_CUMPLIMIENTO')) > ahora) continue
    nuevas += await crear('CUMPLIMIENTO_PENDIENTE', dec.actuacion,
      `El fallo de ${dec.instancia === 'PRIMERA' ? 'primera' : 'segunda'} instancia${dec.fechaDecision ? ` del ${dec.fechaDecision.split('-').reverse().join('/')}` : ''} es desfavorable y exige memorial de cumplimiento, aunque se impugne. Aún no llega la asignación del cumplimiento.`, ahora)
  }
  return nuevas
}

const destinatarios = () => {
  const para = parametro<string[]>('CORREOS_ALERTAS').filter(Boolean)
  if (!para.length) throw new ErrorNegocio('Falta a quién emitir las alertas: configure CORREOS_ALERTAS en Parámetros')
  return para
}

// Una alerta sola por escrito al cliente (buzón de asignaciones), con la ficha del caso. Sirve para lo
// que no puede esperar al corte y para reenviar una que ya salió
const enviarSuelta = async (alerta: Alerta, usuarioId: number, nota?: string | null) => {
  const detalle = [alerta.mensaje, nota?.trim()].filter(Boolean).join('\n\n')
  const correo = await enviarPlantilla({
    codigo: 'ALERTA', actuacionId: alerta.actuacionId, para: destinatarios(),
    extra: { detalle, tipoAlerta: NOMBRES_ALERTA[alerta.tipo].toUpperCase() }, usuarioId
  })
  if (correo.estado === 'ERROR') throw new ErrorNegocio(`No se pudo enviar la alerta: ${correo.error}`)
  return correo
}

export const emitirAlerta = async (d: { alertaId: number, usuarioId: number, nota?: string | null }) => {
  const alerta = await Alerta.findByPk(d.alertaId)
  if (!alerta || alerta.estado !== 'PENDIENTE') throw new ErrorNegocio('La alerta no está pendiente')
  const correo = await enviarSuelta(alerta, d.usuarioId, d.nota)
  await alerta.update({ estado: 'EMITIDA', fechaEmision: correo.fechaCorreo, ultimoEnvio: correo.fechaCorreo, vecesEnviada: 1, usuarioId: d.usuarioId, correoId: correo.id })
  return alerta
}

// Reenvío de una ya emitida (la pidió de nuevo el cliente o hay novedad). No cambia fechaEmision: ANS-08
// se mide con la primera
export const reenviarAlerta = async (d: { alertaId: number, usuarioId: number, nota?: string | null }) => {
  const alerta = await Alerta.findByPk(d.alertaId)
  if (!alerta || alerta.estado !== 'EMITIDA') throw new ErrorNegocio('Solo se reenvía una alerta ya emitida')
  const correo = await enviarSuelta(alerta, d.usuarioId, d.nota)
  await alerta.update({ ultimoEnvio: correo.fechaCorreo, vecesEnviada: alerta.vecesEnviada + 1, correoId: correo.id })
  return alerta
}

// =====================================
// CORTES (reunión 18-nov): dos veces al día sale un solo correo con todas las alertas pendientes.
// El worker revisa cada minuto si ya pasó la hora de un corte de hoy que no se ha enviado; así un
// reinicio no lo pierde ni lo repite. Solo en días hábiles; en los medios días (24 y 31 de diciembre)
// los cortes de la tarde se adelantan a media hora antes del cierre
// =====================================

const hhmm = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`

export const horasDeCorte = (dia: string) => {
  const horas = parametro<string[]>('HORAS_CORTE_ALERTAS').filter(h => /^\d{1,2}:\d{2}$/.test(h)).map(h => hhmm(minutosDeHora(h)))
  if (!esMedioDia(dia)) return [...new Set(horas)].sort()
  const tope = minutosDeHora(parametro<string>('HORA_CORTE_MEDIO_DIA')) - 30
  return [...new Set(horas.map(h => hhmm(Math.min(minutosDeHora(h), tope))))].sort()
}

// Próximo corte automático (para la pantalla): hoy si queda alguno, si no el primero del siguiente día hábil
export const proximoCorte = () => {
  const { dia, minutos } = enBogota(new Date())
  let actual = dia
  for (let i = 0; i < 15; i++) {
    if (esDiaHabil(actual)) {
      const hora = horasDeCorte(actual).find(h => actual !== dia || minutosDeHora(h) > minutos)
      if (hora) return { dia: actual, hora }
    }
    actual = new Date(Date.parse(`${actual}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  }
  return null
}

// Línea de una alerta en el correo del corte: radicado, número interno, accionante, etapa y vencimiento
const lineaCorte = async (a: Alerta) => {
  if (!a.actuacionId) return `- ${a.mensaje}`
  const v = (await valoresDeActuacion(a.actuacionId)).valores
  const datos = [`RAD. ${v.radicadoFormato}`, v.numeroInterno, v.accionante, v.etapa, v.vence && `vence ${v.vence}`].filter(Boolean).join(' · ')
  return `- ${datos}: ${a.mensaje.charAt(0).toLowerCase()}${a.mensaje.slice(1)}`
}

// Cuerpo del corte: las alertas agrupadas por tipo, cada grupo con su cantidad (llegan ordenadas por tipo)
const detalleCorte = async (alertas: Alerta[]) => {
  const grupos = new Map<Alerta['tipo'], Alerta[]>()
  for (const a of alertas) grupos.set(a.tipo, [...(grupos.get(a.tipo) ?? []), a])
  const bloques: string[] = []
  for (const [tipo, lista] of grupos) bloques.push(`${NOMBRES_ALERTA[tipo]} (${lista.length})\n\n${(await Promise.all(lista.map(lineaCorte))).join('\n')}`)
  return bloques.join('\n\n')
}

// Envía el corte con las alertas pendientes. hora: la programada (automático) o null (a mano, ahora)
export const enviarCorte = async (d: { hora: string | null, usuarioId: number | null }) => {
  const ahora = new Date()
  // Lo último antes de enviar: que el corte lleve todo lo que hay en este momento
  await detectarAlertas()
  const pendientes = await Alerta.findAll({ where: { estado: 'PENDIENTE' }, order: [['tipo', 'ASC'], ['fechaDeteccion', 'ASC']] })
  const { dia, minutos } = enBogota(ahora)
  const base = { dia, hora: d.hora ?? hhmm(minutos), automatico: d.hora !== null, usuarioId: d.usuarioId }
  // Un corte sin alertas no se envía, pero queda registrado (así el automático no se repite)
  if (!pendientes.length) return CorteAlertas.create({ ...base, cantidad: 0, estado: 'ENVIADO' })

  let correo
  try {
    correo = await enviarPlantilla({
      codigo: 'ALERTAS_CORTE', actuacionId: null, para: destinatarios(), usuarioId: d.usuarioId,
      extra: { cantidad: String(pendientes.length), fechaCorte: textoFechaHora(ahora), detalle: await detalleCorte(pendientes) }
    })
  } catch (error) {
    // Sin destinatarios: queda el corte con el error a la vista y las alertas siguen pendientes
    return CorteAlertas.create({ ...base, cantidad: pendientes.length, estado: 'ERROR', error: error instanceof Error ? error.message : String(error) })
  }
  const corte = await CorteAlertas.create({
    ...base, cantidad: pendientes.length, estado: correo.estado === 'ERROR' ? 'ERROR' : correo.estado === 'SIMULADO' ? 'SIMULADO' : 'ENVIADO',
    error: correo.error ?? null, correoId: correo.id
  })
  if (correo.estado === 'ERROR') return corte
  await Alerta.update(
    { estado: 'EMITIDA', fechaEmision: correo.fechaCorreo, ultimoEnvio: correo.fechaCorreo, vecesEnviada: 1, corteId: corte.id, correoId: correo.id, usuarioId: d.usuarioId },
    { where: { id: pendientes.map(a => a.id), estado: 'PENDIENTE' } }
  )
  return corte
}

// Lo llama el worker cada minuto: envía el corte de hoy cuya hora ya pasó y que no se ha enviado.
// Solo el último corte vencido: si el worker estuvo caído toda la mañana, sale uno, no dos seguidos
export const revisarCortes = async () => {
  if (!parametro<boolean>('ENVIO_AUTOMATICO_ALERTAS')) return null
  const { dia, minutos } = enBogota(new Date())
  if (!esDiaHabil(dia)) return null
  const vencidas = horasDeCorte(dia).filter(h => minutosDeHora(h) <= minutos)
  const hora = vencidas.at(-1)
  if (!hora) return null
  const hechos = await CorteAlertas.findAll({ where: { dia, automatico: true, hora: vencidas }, attributes: ['hora'] })
  if (hechos.some(c => c.hora === hora)) return null
  return enviarCorte({ hora, usuarioId: null })
}

// Reenvío del correo de un corte con las mismas alertas (por ejemplo, si el cliente no lo recibió)
export const reenviarCorte = async (d: { corteId: number, usuarioId: number }) => {
  const corte = await CorteAlertas.findByPk(d.corteId)
  if (!corte || corte.estado === 'ERROR') throw new ErrorNegocio('Ese corte no salió: envíe uno nuevo')
  const alertas = await Alerta.findAll({ where: { corteId: corte.id }, order: [['tipo', 'ASC'], ['fechaDeteccion', 'ASC']] })
  if (!alertas.length) throw new ErrorNegocio('Ese corte no tuvo alertas')
  const correo = await enviarPlantilla({
    codigo: 'ALERTAS_CORTE', actuacionId: null, para: destinatarios(), usuarioId: d.usuarioId,
    extra: { cantidad: String(alertas.length), fechaCorte: textoFechaHora(corte.createdAt as Date), detalle: await detalleCorte(alertas) }
  })
  if (correo.estado === 'ERROR') throw new ErrorNegocio(`No se pudo reenviar el corte: ${correo.error}`)
  const ahora = correo.fechaCorreo
  await corte.update({ reenvios: corte.reenvios + 1, ultimoReenvio: ahora, usuarioId: d.usuarioId })
  for (const a of alertas) await a.update({ ultimoEnvio: ahora, vecesEnviada: a.vecesEnviada + 1 })
  return corte
}

export const descartarAlerta = async (d: { alertaId: number, motivo: string, usuarioId: number }) => {
  const alerta = await Alerta.findByPk(d.alertaId)
  if (!alerta || alerta.estado !== 'PENDIENTE') throw new ErrorNegocio('La alerta no está pendiente')
  if (!d.motivo.trim()) throw new ErrorNegocio('Indique por qué se descarta')
  await alerta.update({ estado: 'DESCARTADA', motivoDescarte: d.motivo.trim(), usuarioId: d.usuarioId })
}
