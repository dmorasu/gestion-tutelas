import { enBogota, instanteBogota, minutosDeHora, sumarDias } from '../utils/fechaColombia'
import { esDiaHabil, esMedioDia, habilDesde, restarDiasHabiles, sumarDiasHabiles } from '../utils/diasHabiles'
import { parametro } from './parametros'
import type { Criticidad, Etapa, UnidadTermino } from './constantes'

// =====================================
// PLAZOS: vencimiento judicial, fecha límite del ANS y semáforo.
// Todo lo que depende de las dudas D1 a D6 sale de los parámetros, no está fijo en el código.
// =====================================

const HORA = 60 * 60 * 1000

// D3: en medio día la jornada termina a HORA_CORTE_MEDIO_DIA; si es más temprano, manda sobre el corte
const corteDelDia = (dia: string, clave: 'HORA_CORTE_ASIGNACION' | 'HORA_FIN_DIA_ANS') => {
  const hora = parametro<string>(clave)
  if (!esMedioDia(dia)) return hora
  const medio = parametro<string>('HORA_CORTE_MEDIO_DIA')
  return minutosDeHora(medio) < minutosDeHora(hora) ? medio : hora
}

// D1: lo que llega después del corte o en día no hábil cuenta desde el siguiente día hábil
export const asignacionEfectiva = (llegada: Date, etapa?: Etapa): Date => {
  const corte = minutosDeHora(corteDelDia(enBogota(llegada).dia, 'HORA_CORTE_ASIGNACION'))
  const inicio = parametro<string>('HORA_INICIO_JORNADA')
  const { dia, minutos } = enBogota(llegada)
  if (esDiaHabil(dia, etapa) && minutos <= corte) return llegada
  const siguiente = esDiaHabil(dia, etapa) ? sumarDiasHabiles(dia, 1, etapa) : habilDesde(dia, etapa)
  return instanteBogota(siguiente, inicio)
}

// D4: término en días hábiles o días calendario, desde la notificación. Los días se cuentan desde el
// día siguiente; si el último cae en día no hábil, pasa al siguiente hábil. Las horas se pasan a días
// hábiles (24 h = 1 día, 48 h = 2) mientras TERMINO_HORAS_EN_DIAS esté activo; si no, corren seguidas
export const vencimientoTermino = (notificacion: Date, valor: number, unidad: UnidadTermino, etapa?: Etapa): Date => {
  if (unidad === 'HORAS') {
    if (!parametro<boolean>('TERMINO_HORAS_EN_DIAS')) return new Date(notificacion.getTime() + valor * HORA)
    return vencimientoTermino(notificacion, Math.max(1, Math.ceil(valor / 24)), 'DIAS_HABILES', etapa)
  }
  const hora = parametro<string>('HORA_VENCIMIENTO_TERMINO')
  const { dia } = enBogota(notificacion)
  const ultimo = unidad === 'DIAS_HABILES' ? sumarDiasHabiles(dia, valor, etapa) : habilDesde(sumarDias(dia, valor), etapa)
  return instanteBogota(ultimo, hora)
}

// D5: vencimiento para impugnar el fallo de primera instancia. Si se notificó por correo se suman
// los días del parámetro (pendiente con el cliente: Ley 2213 de 2022)
export const vencimientoImpugnacion = (notificacionFallo: Date, porCorreo = false) =>
  vencimientoTermino(notificacionFallo, parametro<number>('DIAS_TERMINO_IMPUGNACION') + (porCorreo ? parametro<number>('DIAS_ADICIONALES_NOTIFICACION_CORREO') : 0), 'DIAS_HABILES', 'IMPUGNACION')

// Los ANS miden nuestro trabajo: cuentan los medios días como medio (D3) y vencen a la hora de fin
// del día hábil (D2: 3:00 p. m.), o antes si ese día es medio día. Los términos del juzgado no
// (HORA_VENCIMIENTO_TERMINO, 5:00 p. m.)
const finDiaAns = (dia: string) => instanteBogota(dia, corteDelDia(dia, 'HORA_FIN_DIA_ANS'))

// "Dentro de los N días hábiles siguientes"
export const finDeDiasHabilesSiguientes = (desde: Date, dias: number, etapa?: Etapa) =>
  finDiaAns(sumarDiasHabiles(enBogota(desde).dia, dias, etapa, true))

// "Con al menos N días hábiles de antelación al vencimiento": a más tardar al fin del día
// hábil que queda N días antes
export const conAntelacion = (vencimiento: Date, dias: number, etapa?: Etapa) =>
  finDiaAns(restarDiasHabiles(enBogota(vencimiento).dia, dias, etapa, true))

const menor = (...fechas: (Date | null | undefined)[]) => {
  const validas = fechas.filter((f): f is Date => !!f)
  return validas.length ? new Date(Math.min(...validas.map(f => f.getTime()))) : null
}

export type DatosPlazo = {
  etapa: Etapa
  criticidad?: Criticidad
  fechaAsignacion: Date
  fechaVencimiento: Date | null
  requiereInsumos: boolean
  // D6: datos faltantes de la asignación pedidos y aún sin respuesta, y cuándo llegaron
  datosFaltantesPendientes?: boolean
  fechaDatosCompletos?: Date | null
  // Insumos pedidos: recepción null = no ha llegado
  insumos?: { minimo: boolean, fechaRecepcion: Date | null }[]
}

// D6: el ANS cuenta desde la asignación con sus insumos mínimos (los documentos que debe traer la
// asignación). Si se pidieron datos faltantes, desde que llegan, con la hora de corte. Los insumos
// para preparar el escrito son otra cosa: los rige ANS_INICIO_CON_INSUMOS. null = el ANS no corre
export const inicioAns = (d: DatosPlazo): Date | null => {
  const desdeDatos = parametro<boolean>('ANS_DESDE_DATOS_COMPLETOS')
  if (desdeDatos && d.datosFaltantesPendientes) return null
  const asignacion = asignacionEfectiva(d.fechaAsignacion, d.etapa)
  const completos = desdeDatos && d.fechaDatosCompletos ? asignacionEfectiva(d.fechaDatosCompletos, d.etapa) : null
  const base = completos && completos > asignacion ? completos : asignacion
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

// ANS-01 y ANS-03: N días hábiles antes del vencimiento si median al menos DIAS_MINIMOS_ANS01
// días hábiles; si no, dentro del día hábil siguiente y antes del vencimiento (manual §21)
const conAntelacionOSiguiente = (d: DatosPlazo, antelacion: number): Date | null => {
  if (!d.fechaVencimiento) return null
  const inicio = inicioAns(d)
  if (!inicio) return null // esperando insumos: el ANS está suspendido
  const minimos = parametro<number>('DIAS_MINIMOS_ANS01')
  const holgado = sumarDiasHabiles(enBogota(inicio).dia, minimos, d.etapa, true) <= enBogota(d.fechaVencimiento).dia
  return holgado
    ? conAntelacion(d.fechaVencimiento, antelacion, d.etapa)
    : menor(finDeDiasHabilesSiguientes(inicio, 1, d.etapa), d.fechaVencimiento)
}

// Fecha límite para entregar el escrito a la entidad y cumplir el ANS. Nunca después del vencimiento.
// Lo crítico (desacato, requerimiento, cumplimiento o término de menos de 24 h) va por ANS-02
export const fechaLimiteEntrega = (d: DatosPlazo): Date | null => {
  const critico = d.criticidad === 'CRITICO' || parametro<string[]>('ETAPAS_CRITICAS').includes(d.etapa)
  if (critico) {
    const inicio = inicioAns(d)
    const ans = inicio ? finDeDiasHabilesSiguientes(inicio, parametro<number>('DIAS_ANS02'), d.etapa) : null
    return menor(ans, d.fechaVencimiento)
  }
  switch (d.etapa) {
    case 'ACCION': return conAntelacionOSiguiente(d, parametro<number>('DIAS_ANTELACION_ANS01'))
    case 'IMPUGNACION': return conAntelacionOSiguiente(d, parametro<number>('DIAS_ANTELACION_ANS03'))
    default: return d.fechaVencimiento
  }
}

// Nivel de riesgo (manual §13). Crítico: etapa crítica o término vencido o de menos de HORAS_CRITICO
// al asignarse; alto: menos de HORAS_ALTO; si no, ordinario. Si la entidad lo marcó en el asunto, se
// toma el mayor de los dos: la clasificación de la entidad nunca baja
const ORDEN_CRITICIDAD: Criticidad[] = ['ORDINARIO', 'ALTO', 'CRITICO']
export const calcularCriticidad = (d: { etapa: Etapa, fechaAsignacion: Date, fechaVencimiento: Date | null }, delAsunto?: Criticidad | null): Criticidad => {
  let calculada: Criticidad = 'ORDINARIO'
  if (parametro<string[]>('ETAPAS_CRITICAS').includes(d.etapa)) calculada = 'CRITICO'
  else if (d.fechaVencimiento) {
    const horas = (d.fechaVencimiento.getTime() - d.fechaAsignacion.getTime()) / HORA
    if (horas < parametro<number>('HORAS_CRITICO')) calculada = 'CRITICO'
    else if (horas < parametro<number>('HORAS_ALTO')) calculada = 'ALTO'
  }
  if (!delAsunto) return calculada
  return ORDEN_CRITICIDAD.indexOf(delAsunto) > ORDEN_CRITICIDAD.indexOf(calculada) ? delAsunto : calculada
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
