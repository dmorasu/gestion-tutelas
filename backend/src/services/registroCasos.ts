import { Op } from 'sequelize'
import { db } from '../config/db'
import { Caso, Parte, Actuacion, Correo, Archivo, RadicadoOtroOperador, SolicitudInsumo } from '../models'
import { ErrorNegocio } from '../utils/errores'
import { esRadicadoValido, normalizarRadicado } from '../utils/radicado'
import { asignacionEfectiva, fechaLimiteEntrega, vencimientoTermino } from './plazos'
import { parametro } from './parametros'
import { elegirResponsable } from './reparto'
import { ROLES, type Etapa, type TipoSolicitud, type UnidadTermino } from './constantes'

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
  requiereInsumos?: boolean
  requiereRevisionAbogado?: boolean
  auxiliarId?: number | null
  abogadoId?: number | null
  origenImpugnacion?: 'ACCIONANTE' | 'ACCIONADO' | null
  observaciones?: string | null
}

// Vencimiento y fecha límite ANS de una actuación con sus datos actuales
export const calcularPlazos = (a: {
  etapa: Etapa, fechaAsignacion: Date, fechaNotificacion: Date | null, terminoValor: number | null, terminoUnidad: UnidadTermino | null, requiereInsumos: boolean
}, insumos: { minimo: boolean, fechaRecepcion: Date | null }[] = []) => {
  const fechaVencimiento = a.fechaNotificacion && a.terminoValor && a.terminoUnidad
    ? vencimientoTermino(a.fechaNotificacion, a.terminoValor, a.terminoUnidad, a.etapa)
    : null
  return {
    fechaAsignacionEfectiva: asignacionEfectiva(a.fechaAsignacion, a.etapa),
    fechaVencimiento,
    fechaLimiteEntrega: fechaLimiteEntrega({ ...a, fechaVencimiento, insumos })
  }
}

// Después de cambiar notificación, término o insumos
export const recalcularPlazos = async (actuacionId: number) => {
  const a = await Actuacion.findByPk(actuacionId, { include: [{ model: SolicitudInsumo, attributes: ['minimo', 'fechaRecepcion'] }] })
  if (!a) return
  await a.update(calcularPlazos(a, a.insumos ?? []))
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

  return db.transaction(async transaction => {
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

    // D16: en algunas etapas siempre revisa un abogado; en las demás lo marca el asistente
    const requiereRevisionAbogado = datos.requiereRevisionAbogado || parametro<string[]>('ETAPAS_REVISION_OBLIGATORIA').includes(datos.etapa)
    const automatico = parametro<boolean>('REPARTO_AUTOMATICO')
    const auxiliarId = datos.auxiliarId ?? (automatico ? await elegirResponsable(ROLES.AUXILIAR, transaction) : null)
    const abogadoId = datos.abogadoId ?? (requiereRevisionAbogado && automatico ? await elegirResponsable(ROLES.ABOGADO, transaction) : null)

    // D5: la impugnación sin término indicado usa el legal (parámetro DIAS_TERMINO_IMPUGNACION)
    const impugnacionSinTermino = datos.etapa === 'IMPUGNACION' && !datos.terminoValor
    const base = {
      etapa: datos.etapa,
      fechaAsignacion,
      fechaNotificacion: fecha(datos.fechaNotificacion),
      terminoValor: impugnacionSinTermino ? parametro<number>('DIAS_TERMINO_IMPUGNACION') : datos.terminoValor ?? null,
      terminoUnidad: impugnacionSinTermino ? 'DIAS_HABILES' as const : datos.terminoUnidad ?? null,
      requiereInsumos: !!datos.requiereInsumos
    }
    const actuacionOrigen = await Actuacion.findOne({ where: { casoId: caso.id }, order: [['fechaAsignacion', 'DESC']], attributes: ['id'], transaction })
    const actuacion = await Actuacion.create({
      ...base,
      ...calcularPlazos(base),
      casoId: caso.id,
      estado: 'POR_ASUMIR',
      auxiliarId,
      abogadoId,
      requiereRevisionAbogado,
      origenImpugnacion: datos.etapa === 'IMPUGNACION' ? datos.origenImpugnacion ?? null : null,
      // D15: la impugnación nace del correo de la entidad; esa es la fecha de solicitud (ANS-03)
      fechaImpugnacion: datos.etapa === 'IMPUGNACION' ? fechaAsignacion : null,
      actuacionOrigenId: actuacionOrigen?.id ?? null
    }, { transaction })

    if (correo) {
      await correo.update({ estado: 'ASOCIADO', casoId: caso.id, actuacionId: actuacion.id, proposito: 'ASIGNACION', usuarioId }, { transaction })
      await Archivo.update({ casoId: caso.id, actuacionId: actuacion.id }, { where: { correoId: correo.id }, transaction })
    }
    return { casoId: caso.id, actuacionId: actuacion.id, deOtroOperador }
  })
}
