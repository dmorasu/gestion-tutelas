import { enBogota, instanteBogota, minutosDeHora, sumarDias } from '../utils/fechaColombia'
import { esDiaHabil, habilDesde, restarDiasHabiles, sumarDiasHabiles } from '../utils/diasHabiles'
import { parametro } from './parametros'
import type { Etapa, UnidadTermino } from './constantes'

// =====================================
// PLAZOS: vencimiento judicial, fecha límite del ANS y semáforo.
// Todo lo que depende de las dudas D1 a D6 sale de los parámetros, no está fijo en el código.
// =====================================

const HORA = 60 * 60 * 1000

// D1: lo que llega después del corte o en día no hábil cuenta desde el siguiente día hábil
export const asignacionEfectiva = (llegada: Date, etapa?: Etapa): Date => {
  const corte = minutosDeHora(parametro<string>('HORA_CORTE_ASIGNACION'))
  const inicio = parametro<string>('HORA_INICIO_JORNADA')
  const { dia, minutos } = enBogota(llegada)
  if (esDiaHabil(dia, etapa) && minutos <= corte) return llegada
  const siguiente = esDiaHabil(dia, etapa) ? sumarDiasHabiles(dia, 1, etapa) : habilDesde(dia, etapa)
  return instanteBogota(siguiente, inicio)
}

// D4: término en horas (corridas), días hábiles o días calendario, desde la notificación.
// Los días se cuentan desde el día siguiente; si el último cae en día no hábil, pasa al siguiente hábil
export const vencimientoTermino = (notificacion: Date, valor: number, unidad: UnidadTermino, etapa?: Etapa): Date => {
  if (unidad === 'HORAS') return new Date(notificacion.getTime() + valor * HORA)
  const hora = parametro<string>('HORA_VENCIMIENTO_TERMINO')
  const { dia } = enBogota(notificacion)
  const ultimo = unidad === 'DIAS_HABILES' ? sumarDiasHabiles(dia, valor, etapa) : habilDesde(sumarDias(dia, valor), etapa)
  return instanteBogota(ultimo, hora)
}

// D5: vencimiento para impugnar el fallo de primera instancia
export const vencimientoImpugnacion = (notificacionFallo: Date) =>
  vencimientoTermino(notificacionFallo, parametro<number>('DIAS_TERMINO_IMPUGNACION'), 'DIAS_HABILES', 'IMPUGNACION')

// "Dentro de los N días hábiles siguientes" (D2: hasta la hora de fin del día)
export const finDeDiasHabilesSiguientes = (desde: Date, dias: number, etapa?: Etapa) =>
  instanteBogota(sumarDiasHabiles(enBogota(desde).dia, dias, etapa), parametro<string>('HORA_FIN_DIA_ANS'))

// "Con al menos N días hábiles de antelación al vencimiento": a más tardar al fin del día
// hábil que queda N días antes
export const conAntelacion = (vencimiento: Date, dias: number, etapa?: Etapa) =>
  instanteBogota(restarDiasHabiles(enBogota(vencimiento).dia, dias, etapa), parametro<string>('HORA_FIN_DIA_ANS'))

const menor = (...fechas: (Date | null | undefined)[]) => {
  const validas = fechas.filter((f): f is Date => !!f)
  return validas.length ? new Date(Math.min(...validas.map(f => f.getTime()))) : null
}

export type DatosPlazo = {
  etapa: Etapa
  fechaAsignacion: Date
  fechaVencimiento: Date | null
  requiereInsumos: boolean
  // Insumos pedidos: recepción null = no ha llegado
  insumos?: { minimo: boolean, fechaRecepcion: Date | null }[]
}

// D6: desde cuándo cuenta el ANS cuando se pidieron insumos. null = aún esperando insumos
export const inicioAns = (d: DatosPlazo): Date | null => {
  const base = asignacionEfectiva(d.fechaAsignacion, d.etapa)
  const modo = parametro<string>('ANS_INICIO_CON_INSUMOS')
  const insumos = d.insumos ?? []
  if (!d.requiereInsumos || modo === 'ASIGNACION' || !insumos.length) return base
  const cuentan = modo === 'INSUMOS_MINIMOS' ? insumos.filter(i => i.minimo) : insumos
  if (!cuentan.length) return base
  if (cuentan.some(i => !i.fechaRecepcion)) return null
  const ultimo = new Date(Math.max(...cuentan.map(i => (i.fechaRecepcion as Date).getTime())))
  // La respuesta de la entidad también respeta la hora de corte (D6-d)
  const recepcion = asignacionEfectiva(ultimo, d.etapa)
  return recepcion > base ? recepcion : base
}

// Fecha límite para entregar el escrito a la entidad y cumplir el ANS. Nunca después del vencimiento
export const fechaLimiteEntrega = (d: DatosPlazo): Date | null => {
  switch (d.etapa) {
    case 'ACCION':
      return d.fechaVencimiento ? conAntelacion(d.fechaVencimiento, parametro<number>('DIAS_ANTELACION_ANS01'), d.etapa) : null
    case 'IMPUGNACION':
      return d.fechaVencimiento ? conAntelacion(d.fechaVencimiento, parametro<number>('DIAS_ANTELACION_ANS03'), d.etapa) : null
    case 'CUMPLIMIENTO':
    case 'REQUERIMIENTO_PREVIO':
    case 'DESACATO': {
      const inicio = inicioAns(d)
      const ans = inicio ? finDeDiasHabilesSiguientes(inicio, parametro<number>('DIAS_ANS02'), d.etapa) : null
      return menor(ans, d.fechaVencimiento)
    }
    default:
      return d.fechaVencimiento
  }
}

// ANS-07: hasta cuándo se pueden pedir los insumos faltantes
export const limiteSolicitudInsumos = (fechaAsignacion: Date, etapa: Etapa) =>
  finDeDiasHabilesSiguientes(asignacionEfectiva(fechaAsignacion, etapa), parametro<number>('DIAS_ANS07'), etapa)

export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO' | 'VENCIDO' | 'SIN_FECHA'

export const semaforo = (limite: Date | null | undefined, ahora = new Date()): Semaforo => {
  if (!limite) return 'SIN_FECHA'
  const horas = (new Date(limite).getTime() - ahora.getTime()) / HORA
  if (horas < 0) return 'VENCIDO'
  if (horas < parametro<number>('SEMAFORO_HORAS_ROJO')) return 'ROJO'
  if (horas < parametro<number>('SEMAFORO_HORAS_AMARILLO')) return 'AMARILLO'
  return 'VERDE'
}

// D8: alerta si al asignar ya venció (o vence antes que la fecha límite del escrito) el término
export const alertaTerminoAlAsignar = (fechaAsignacion: Date, fechaVencimiento: Date | null) =>
  !!fechaVencimiento && fechaVencimiento.getTime() <= fechaAsignacion.getTime() + 24 * HORA
