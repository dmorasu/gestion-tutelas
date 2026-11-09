import { Parametro } from '../models'

// =====================================
// PARÁMETROS: los supuestos de las dudas pendientes (Docs/PLAN.md §5)
// Se siembran con el valor propuesto; cuando el abogado responda se cambian en la pantalla de
// Parámetros (y se marcan como confirmados) sin tocar el código.
// =====================================

type Definicion = { valor: unknown, descripcion: string, duda?: string }

export const PARAMETROS_BASE = {
  HORA_CORTE_ASIGNACION: { valor: '17:00', duda: 'D1', descripcion: 'Lo que llega después de esta hora cuenta como asignado el siguiente día hábil' },
  HORA_INICIO_JORNADA: { valor: '08:00', duda: 'D1', descripcion: 'Hora en que se entiende asignado lo que llegó después del corte o en día no hábil' },
  HORA_FIN_DIA_ANS: { valor: '23:59', duda: 'D2', descripcion: 'Hasta qué hora del "día hábil siguiente" se cumple un ANS' },
  HORA_VENCIMIENTO_TERMINO: { valor: '17:00', duda: 'D4', descripcion: 'Hora en que vence un término judicial en días (cierre del despacho)' },
  DIAS_TERMINO_IMPUGNACION: { valor: 3, duda: 'D5', descripcion: 'Días hábiles para impugnar, desde el día siguiente a la notificación del fallo' },
  ANS_INICIO_CON_INSUMOS: { valor: 'ULTIMO_INSUMO', duda: 'D6', descripcion: 'Desde cuándo cuentan ANS-01/02/04 si se pidieron insumos: ULTIMO_INSUMO, INSUMOS_MINIMOS o ASIGNACION' },
  DIAS_ANTELACION_ANS01: { valor: 1, descripcion: 'ANS-01: días hábiles de antelación al vencimiento para entregar la contestación' },
  DIAS_ANS02: { valor: 1, descripcion: 'ANS-02: días hábiles desde la asignación para desacato, requerimiento y cumplimiento' },
  DIAS_ANTELACION_ANS03: { valor: 1, descripcion: 'ANS-03: días hábiles de antelación al vencimiento para entregar la impugnación' },
  DIAS_ANS06: { valor: 1, duda: 'D20', descripcion: 'ANS-06: días hábiles para corregir una devolución' },
  DIAS_ANS07: { valor: 1, descripcion: 'ANS-07: días hábiles desde la asignación para pedir los insumos faltantes' },
  META_ANS: { valor: { 'ANS-01': 95, 'ANS-02': 95, 'ANS-03': 95, 'ANS-04': 90, 'ANS-05': 15, 'ANS-06': 95, 'ANS-07': 95, 'ANS-08': 95 }, duda: 'D11', descripcion: 'Meta mensual de cada ANS en %' },
  SENTIDOS_FAVORABLES: { valor: ['NIEGA', 'IMPROCEDENTE', 'NO_SANCIONA'], duda: 'D13', descripcion: 'Sentidos favorables a la entidad. En segunda instancia: Confirma es favorable si la primera lo fue; Revoca, si no lo fue; Modifica es desfavorable' },
  CUMPLIMIENTO_DURANTE_IMPUGNACION: { valor: false, duda: 'D12', descripcion: 'Abrir la actuación de cumplimiento mientras corre la impugnación' },
  ETAPAS_REVISION_OBLIGATORIA: { valor: ['IMPUGNACION', 'DESACATO'], duda: 'D16', descripcion: 'Etapas en las que siempre revisa un abogado' },
  REPARTO_AUTOMATICO: { valor: true, descripcion: 'Asignar el auxiliar con menos casos abiertos al registrar' },
  SEMAFORO_HORAS_ROJO: { valor: 4, descripcion: 'Semáforo rojo: menos de estas horas para la fecha límite (o vencido)' },
  SEMAFORO_HORAS_AMARILLO: { valor: 24, descripcion: 'Semáforo amarillo: menos de estas horas para la fecha límite' }
} satisfies Record<string, Definicion>

export type ClaveParametro = keyof typeof PARAMETROS_BASE

let valores = new Map<string, unknown>()
let cargadoEn = 0

// Se lee la base al arrancar y cada minuto (el worker y la API corren en procesos distintos)
export const cargarParametros = async (forzar = false) => {
  if (!forzar && Date.now() - cargadoEn < 60_000) return
  const filas = await Parametro.findAll({ attributes: ['clave', 'valor'] })
  valores = new Map(filas.map(f => [f.clave, f.valor]))
  cargadoEn = Date.now()
}

export const parametro = <T = unknown>(clave: ClaveParametro): T =>
  (valores.has(clave) ? valores.get(clave) : PARAMETROS_BASE[clave].valor) as T

// Inserta los que falten sin pisar los que ya se cambiaron
export const sembrarParametros = async () => {
  for (const [clave, def] of Object.entries(PARAMETROS_BASE) as [string, Definicion][]) {
    await Parametro.findOrCreate({
      where: { clave },
      defaults: { clave, valor: def.valor, descripcion: def.descripcion, duda: def.duda ?? null }
    })
  }
  await cargarParametros(true)
}
