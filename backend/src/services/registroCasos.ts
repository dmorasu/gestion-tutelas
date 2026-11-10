import { Op, type Transaction } from 'sequelize'
import { db } from '../config/db'
import { Caso, Parte, Actuacion, Correo, Archivo, RadicadoOtroOperador, SolicitudInsumo, Usuario, Decision } from '../models'
import { ErrorNegocio } from '../utils/errores'
import { esRadicadoValido, normalizarRadicado } from '../utils/radicado'
import { asignacionEfectiva, calcularCriticidad, fechaLimiteEntrega, vencimientoTermino } from './plazos'
import { parametro } from './parametros'
import { repartir, revisorDeEquipo } from './reparto'
import { enviarPlantilla } from './buzon/correosSalida'
import { archivarAdjuntos } from './expediente'
import type { Criticidad, Etapa, TipoSolicitud, UnidadTermino } from './constantes'

export type DatosRegistro = {
  correoId?: number | null
  // Sin correo (registro manual o cargue): fecha y hora de asignación de la entidad
  fechaAsignacion?: string | null
  radicado: string
  tipoSolicitud: TipoSolicitud
  etapa: Etapa
  juzgadoId?: number | null
  calidadEntidad?: string
  partes?: { rol?: 'ACCIONANTE' | 'VINCULADO' | 'APODERADO', tipoDocumento?: string | null, numeroDocumento?: string | null, nombre: string }[]
  derechosInvolucrados?: string | null
  fechaNotificacion?: string | null
  terminoValor?: number | null
  terminoUnidad?: UnidadTermino | null
  // "Vence" que informa la entidad (del asunto o escrito por el asistente)
  fechaVencimiento?: string | null
  // La que marcó la entidad en el asunto; la app calcula la suya y deja la mayor
  criticidad?: Criticidad | null
  requiereInsumos?: boolean
  // Cargue de Excel: no se manda un acuse por caso (sale uno solo con todo el paquete)
  sinAcuse?: boolean
  auxiliarId?: number | null
  revisorId?: number | null
  origenImpugnacion?: 'ACCIONANTE' | 'ACCIONADO' | null
  observaciones?: string | null
}

type DatosCalculo = {
  etapa: Etapa, fechaAsignacion: Date, fechaNotificacion: Date | null, terminoValor: number | null, terminoUnidad: UnidadTermino | null,
  fechaVencimientoInformada: Date | null, requiereInsumos: boolean, criticidad: Criticidad, criticidadFuente: string | null,
  datosFaltantesPendientes?: boolean, fechaDatosCompletos?: Date | null
}

// Vencimiento, criticidad y fecha límite ANS de una actuación con sus datos actuales.
// El vencimiento informado por la entidad manda sobre el calculado con el término (manual §12.1).
// La criticidad marcada a mano no se recalcula
export const calcularPlazos = (a: DatosCalculo, insumos: { minimo: boolean, fechaRecepcion: Date | null }[] = [], delAsunto?: Criticidad | null) => {
  const fechaVencimiento = a.fechaVencimientoInformada ?? (a.fechaNotificacion && a.terminoValor && a.terminoUnidad
    ? vencimientoTermino(a.fechaNotificacion, a.terminoValor, a.terminoUnidad, a.etapa)
    : null)
  const manual = a.criticidadFuente === 'MANUAL'
  const criticidad = manual ? a.criticidad : calcularCriticidad({ etapa: a.etapa, fechaAsignacion: a.fechaAsignacion, fechaVencimiento }, delAsunto)
  const criticidadFuente = manual ? 'MANUAL' as const : delAsunto && criticidad === delAsunto ? 'ASUNTO' as const : 'CALCULADA' as const
  return {
    fechaAsignacionEfectiva: asignacionEfectiva(a.fechaAsignacion, a.etapa),
    fechaVencimiento,
    criticidad,
    criticidadFuente,
    // Campos uno a uno: "a" puede ser una instancia de Sequelize y {...a} no copia sus valores
    fechaLimiteEntrega: fechaLimiteEntrega({
      etapa: a.etapa, fechaAsignacion: a.fechaAsignacion, requiereInsumos: a.requiereInsumos, criticidad, fechaVencimiento, insumos,
      datosFaltantesPendientes: a.datosFaltantesPendientes, fechaDatosCompletos: a.fechaDatosCompletos
    })
  }
}

// Después de cambiar notificación, término, vencimiento, criticidad o insumos
export const recalcularPlazos = async (actuacionId: number) => {
  const a = await Actuacion.findByPk(actuacionId, { include: [{ model: SolicitudInsumo, attributes: ['minimo', 'fechaRecepcion'] }] })
  if (!a) return
  // La que vino del asunto se conserva como piso
  await a.update(calcularPlazos(a, a.insumos ?? [], a.criticidadFuente === 'ASUNTO' ? a.criticidad : null))
}

// Consecutivo sin huecos por concurrencia: secuencia de Postgres (se crea en la semilla)
export const SECUENCIA_NUMERO_INTERNO = 'casos_numero_interno_seq'
export const siguienteNumeroInterno = async (transaction?: Transaction, fecha = new Date()) => {
  const [filas] = await db.query(`SELECT nextval('${SECUENCIA_NUMERO_INTERNO}') AS n`, { transaction })
  const n = Number((filas as { n: string }[])[0].n)
  return `GPA-${fecha.getFullYear()}-${String(n).padStart(5, '0')}`
}

const fecha = (valor?: string | null) => {
  if (!valor) return null
  const d = new Date(valor)
  if (isNaN(d.getTime())) throw new ErrorNegocio(`Fecha no válida: ${valor}`)
  return d
}

// =====================================
// REGISTRAR UNA ASIGNACIÓN: crea el caso (si es nuevo) y la actuación de la etapa.
// La fecha de asignación es la llegada del correo, no la hora en que se registra (protege el ANS).
// =====================================
export const registrarAsignacion = async (datos: DatosRegistro, usuarioId: number) => {
  const radicado = normalizarRadicado(datos.radicado)
  if (!esRadicadoValido(radicado)) throw new ErrorNegocio('El radicado debe tener 23 dígitos')

  const resultado = await db.transaction(async transaction => {
    const correo = datos.correoId ? await Correo.findByPk(datos.correoId, { transaction, lock: transaction.LOCK.UPDATE }) : null
    if (datos.correoId && !correo) throw new ErrorNegocio('El correo no existe', 404)
    if (correo && correo.estado !== 'POR_REGISTRAR') throw new ErrorNegocio('Este correo ya fue registrado o descartado')

    const fechaAsignacion = correo?.fechaCorreo ?? fecha(datos.fechaAsignacion)
    if (!fechaAsignacion) throw new ErrorNegocio('Falta la fecha de asignación')

    const deOtroOperador = !!(await RadicadoOtroOperador.findOne({ where: { radicado }, attributes: ['id'], transaction }))

    let caso = await Caso.findOne({ where: { radicado }, transaction, lock: transaction.LOCK.UPDATE })
    if (caso) {
      const abierta = await Actuacion.findOne({ where: { casoId: caso.id, etapa: datos.etapa, estado: { [Op.ne]: 'CERRADA' } }, attributes: ['id'], transaction })
      if (abierta) throw new ErrorNegocio('El caso ya tiene una actuación abierta en esa etapa: asocie el correo a ella')
      await caso.update({ etapaActual: datos.etapa, estado: 'ABIERTO', fechaCierre: null, motivoCierre: null, deOtroOperador }, { transaction })
    } else {
      caso = await Caso.create({
        radicado,
        numeroInterno: await siguienteNumeroInterno(transaction),
        tipoSolicitud: datos.tipoSolicitud,
        juzgadoId: datos.juzgadoId ?? null,
        calidadEntidad: datos.calidadEntidad ?? 'ACCIONADO',
        etapaInicial: datos.etapa,
        etapaActual: datos.etapa,
        derechosInvolucrados: datos.derechosInvolucrados ?? null,
        observaciones: datos.observaciones ?? null,
        deOtroOperador,
        registradoPorId: usuarioId
      }, { transaction })
      const partes = (datos.partes ?? []).filter(p => p.nombre?.trim())
      if (partes.length) await Parte.bulkCreate(partes.map(p => ({ ...p, rol: p.rol ?? 'ACCIONANTE', casoId: caso!.id })), { transaction })
    }

    // Reparto por equipo: el auxiliar del equipo de la etapa y el revisor de su equipo. Si el asistente
    // eligió el auxiliar, el revisor y el equipo salen de ese auxiliar
    let reparto: { auxiliarId: number | null, revisorId: number | null, equipoId: number | null } = { auxiliarId: null, revisorId: null, equipoId: null }
    if (datos.auxiliarId) {
      const elegido = await Usuario.findByPk(datos.auxiliarId, { attributes: ['id', 'equipoId'], transaction })
      if (!elegido) throw new ErrorNegocio('El auxiliar no existe')
      reparto = { auxiliarId: elegido.id, equipoId: elegido.equipoId, revisorId: await revisorDeEquipo(elegido.equipoId, transaction) }
    } else if (parametro<boolean>('REPARTO_AUTOMATICO')) {
      reparto = await repartir(datos.etapa, transaction)
    }
    if (datos.revisorId) reparto.revisorId = datos.revisorId

    // D5: la impugnación sin término indicado usa el legal (parámetro DIAS_TERMINO_IMPUGNACION)
    const impugnacionSinTermino = datos.etapa === 'IMPUGNACION' && !datos.terminoValor
    const informado = fecha(datos.fechaVencimiento) ?? correo?.vencimientoDetectado ?? null
    const base = {
      etapa: datos.etapa,
      fechaAsignacion,
      fechaNotificacion: fecha(datos.fechaNotificacion),
      terminoValor: impugnacionSinTermino && !informado ? parametro<number>('DIAS_TERMINO_IMPUGNACION') : datos.terminoValor ?? null,
      terminoUnidad: impugnacionSinTermino && !informado ? 'DIAS_HABILES' as const : datos.terminoUnidad ?? null,
      fechaVencimientoInformada: informado,
      requiereInsumos: !!datos.requiereInsumos,
      criticidad: 'ORDINARIO' as Criticidad,
      criticidadFuente: null
    }
    const delAsunto = datos.criticidad ?? correo?.criticidadDetectada ?? null
    const actuacionOrigen = await Actuacion.findOne({ where: { casoId: caso.id }, order: [['fechaAsignacion', 'DESC']], attributes: ['id'], transaction })
    const actuacion = await Actuacion.create({
      ...base,
      ...calcularPlazos(base, [], delAsunto),
      casoId: caso.id,
      estado: 'POR_ASUMIR',
      ...reparto,
      origenImpugnacion: datos.etapa === 'IMPUGNACION' ? datos.origenImpugnacion ?? null : null,
      // D15: la impugnación nace del correo de la entidad; esa es la fecha de solicitud (ANS-03)
      fechaImpugnacion: datos.etapa === 'IMPUGNACION' ? fechaAsignacion : null,
      actuacionOrigenId: actuacionOrigen?.id ?? null
    }, { transaction })

    // D12: el cumplimiento atiende los fallos desfavorables del caso que lo estaban esperando
    if (datos.etapa === 'CUMPLIMIENTO') {
      const delCaso = await Actuacion.findAll({ where: { casoId: caso.id }, attributes: ['id'], transaction })
      await Decision.update({ actuacionCumplimientoId: actuacion.id }, {
        where: { requiereCumplimiento: true, actuacionCumplimientoId: null, actuacionId: delCaso.map(x => x.id) }, transaction
      })
    }

    if (correo) {
      await correo.update({ estado: 'ASOCIADO', casoId: caso.id, actuacionId: actuacion.id, proposito: 'ASIGNACION', usuarioId }, { transaction })
      await Archivo.update({ casoId: caso.id, actuacionId: actuacion.id }, { where: { correoId: correo.id }, transaction })
    }
    return { casoId: caso.id, actuacionId: actuacion.id, numeroInterno: caso.numeroInterno, deOtroOperador, remitente: correo?.remitente ?? null, correoId: correo?.id ?? null }
  })

  // Confirmación de recibido con el número interno (fuera de la transacción: si el correo falla,
  // el registro queda hecho y el error se ve en el caso para reenviarlo)
  // Los adjuntos pasan de la bandeja al expediente (fuera de la transacción: es SharePoint)
  if (resultado.correoId) await archivarAdjuntos(resultado.correoId, resultado.actuacionId, 'Entrada').catch(error => console.error('❌ Adjuntos al expediente', error))
  let acuse: { estado: string, error: string | null } | null = null
  if (resultado.remitente && !datos.sinAcuse && parametro<boolean>('ACUSE_AUTOMATICO')) {
    const enviado = await enviarPlantilla({
      codigo: 'ACUSE_ASIGNACION', actuacionId: resultado.actuacionId, para: [resultado.remitente], responderACorreoId: resultado.correoId, usuarioId
    }).catch(error => ({ estado: 'ERROR', error: String(error instanceof Error ? error.message : error) }))
    acuse = { estado: enviado.estado, error: enviado.error ?? null }
  }
  return { casoId: resultado.casoId, actuacionId: resultado.actuacionId, numeroInterno: resultado.numeroInterno, deOtroOperador: resultado.deOtroOperador, acuse }
}
