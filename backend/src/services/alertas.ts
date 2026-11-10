import { Op } from 'sequelize'
import { Actuacion, Alerta, Caso, SolicitudInsumo } from '../models'
import { asignacionEfectiva, finDeDiasHabilesSiguientes } from './plazos'
import { parametro } from './parametros'
import { enviarPlantilla } from './buzon/correosSalida'
import { NOMBRES_ETAPAS } from './constantes'
import { textoFechaHora } from '../utils/fechaColombia'
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
  DUPLICIDAD: 'Duplicidad con otro operador'
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
    include: [{ model: Caso, attributes: ['id', 'numeroInterno', 'radicado', 'deOtroOperador'] }]
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
      nuevas += await crear('DUPLICIDAD', a, 'El archivo maestro asigna este radicado a otro operador. Se suspende la elaboración hasta que el supervisor defina el operador.', ahora)
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
  return nuevas
}

// Emisión por escrito al cliente (buzón de asignaciones), con la ficha del caso
export const emitirAlerta = async (d: { alertaId: number, usuarioId: number, nota?: string | null }) => {
  const alerta = await Alerta.findByPk(d.alertaId)
  if (!alerta || alerta.estado !== 'PENDIENTE') throw new ErrorNegocio('La alerta no está pendiente')
  const para = parametro<string[]>('CORREOS_ALERTAS').filter(Boolean)
  if (!para.length) throw new ErrorNegocio('Falta a quién emitir las alertas: configure CORREOS_ALERTAS en Parámetros')
  const detalle = [alerta.mensaje, d.nota?.trim()].filter(Boolean).join('\n\n')
  const correo = await enviarPlantilla({
    codigo: 'ALERTA', actuacionId: alerta.actuacionId, para,
    extra: { detalle, tipoAlerta: NOMBRES_ALERTA[alerta.tipo].toUpperCase() }, usuarioId: d.usuarioId
  })
  if (correo.estado === 'ERROR') throw new ErrorNegocio(`No se pudo enviar la alerta: ${correo.error}`)
  await alerta.update({ estado: 'EMITIDA', fechaEmision: correo.fechaCorreo, usuarioId: d.usuarioId, correoId: correo.id })
  return alerta
}

export const descartarAlerta = async (d: { alertaId: number, motivo: string, usuarioId: number }) => {
  const alerta = await Alerta.findByPk(d.alertaId)
  if (!alerta || alerta.estado !== 'PENDIENTE') throw new ErrorNegocio('La alerta no está pendiente')
  if (!d.motivo.trim()) throw new ErrorNegocio('Indique por qué se descarta')
  await alerta.update({ estado: 'DESCARTADA', motivoDescarte: d.motivo.trim(), usuarioId: d.usuarioId })
}
