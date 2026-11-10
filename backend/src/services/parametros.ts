import { Op } from 'sequelize'
import { Parametro } from '../models'

// =====================================
// PARÁMETROS: reglas de plazos y ANS (Docs/PLAN.md §5)
// Los que siguen siendo supuestos se cambian en la pantalla de Parámetros cuando haya respuesta.
// "fuente" marca los que ya respondió el cliente (manual operativo v1.1, el correo de roles o las
// respuestas a las dudas de TI, "Dudas TI"): al
// sembrar se actualizan solos si nadie los había confirmado a mano.
// =====================================

type Definicion = { valor: unknown, descripcion: string, duda?: string, fuente?: string }

export const PARAMETROS_BASE = {
  HORA_CORTE_ASIGNACION: { valor: '15:00', duda: 'D1', fuente: 'Manual §3 y Dudas TI D1', descripcion: 'Las asignaciones y los insumos recibidos después de esta hora cuentan desde el día hábil siguiente' },
  HORA_INICIO_JORNADA: { valor: '08:00', duda: 'D1', descripcion: 'Hora en que se entiende asignado lo que llegó después del corte o en día no hábil' },
  HORA_FIN_DIA_ANS: { valor: '15:00', duda: 'D2', fuente: 'Dudas TI D2', descripcion: 'Hasta qué hora del día hábil se cumple un ANS (nuestra actividad)' },
  HORA_VENCIMIENTO_TERMINO: { valor: '17:00', duda: 'D2', fuente: 'Dudas TI D2', descripcion: 'Hora en que vence un término judicial en días (horario hábil de los juzgados), o el "Vence" del asunto que trae fecha sin hora' },
  HORA_CORTE_MEDIO_DIA: { valor: '12:00', duda: 'D3', descripcion: 'Hasta qué hora se trabaja los medios días (24 y 31 de diciembre): corte de asignación y fin del día para los ANS' },
  TERMINO_HORAS_EN_DIAS: { valor: true, duda: 'D4', fuente: 'Dudas TI D4', descripcion: 'Los términos en horas se cuentan en días hábiles: 24 horas = 1 día hábil, 48 horas = 2' },
  DIAS_TERMINO_IMPUGNACION: { valor: 3, duda: 'D5', fuente: 'Dudas TI D5', descripcion: 'Días hábiles para impugnar, desde el día siguiente a la notificación del fallo' },
  DIAS_ADICIONALES_NOTIFICACION_CORREO: { valor: 0, duda: 'D5', descripcion: 'Días hábiles que se suman al término de impugnación si el fallo se notificó por correo (Ley 2213 de 2022: serían 2). Pendiente de consultar con el cliente' },
  ANS_DESDE_DATOS_COMPLETOS: { valor: true, duda: 'D6', fuente: 'Dudas TI D6', descripcion: 'Si se pidieron datos faltantes de la asignación (insumos mínimos), el ANS no corre hasta que lleguen y cuenta desde su llegada' },
  ANS_INICIO_CON_INSUMOS: { valor: 'ULTIMO_INSUMO', duda: 'D6', descripcion: 'Desde cuándo cuentan los ANS si se pidieron insumos para preparar el escrito: ULTIMO_INSUMO, INSUMOS_MINIMOS o ASIGNACION' },
  DIAS_ANTELACION_ANS01: { valor: 1, fuente: 'Manual §21', descripcion: 'ANS-01: días hábiles de antelación al vencimiento para entregar la contestación' },
  DIAS_MINIMOS_ANS01: { valor: 2, fuente: 'Manual §21', descripcion: 'ANS-01: con menos de estos días hábiles hasta el vencimiento, se entrega dentro del día hábil siguiente' },
  DIAS_ANS02: { valor: 1, fuente: 'Manual §21', descripcion: 'ANS-02 (críticos): días hábiles desde la asignación con insumos para entregar' },
  DIAS_ANTELACION_ANS03: { valor: 1, fuente: 'Manual §21', descripcion: 'ANS-03: días hábiles de antelación al vencimiento para entregar la impugnación' },
  DIAS_ANS06: { valor: 1, duda: 'D20', fuente: 'Manual §17 y Dudas TI D20', descripcion: 'ANS-06: días hábiles para corregir una devolución de fondo, desde el correo de devolución (sin hora de corte)' },
  DIAS_ANS07: { valor: 1, fuente: 'Manual §11', descripcion: 'ANS-07: días hábiles desde la asignación para pedir los insumos faltantes' },
  DIAS_DEVOLUCION_ENTIDAD: { valor: 2, fuente: 'Manual §17', descripcion: 'Días hábiles que tiene la entidad para devolver un escrito entregado' },
  DIAS_SUMINISTRO_INSUMOS: { valor: 2, fuente: 'Manual §11', descripcion: 'Días hábiles que tiene el cliente para entregar los insumos (el mismo día si es crítico)' },
  META_ANS: { valor: { 'ANS-01': 90, 'ANS-02': 90, 'ANS-03': 90, 'ANS-04': 90, 'ANS-05': 15, 'ANS-06': 90, 'ANS-07': 90, 'ANS-08': 90 }, duda: 'D11', fuente: 'Dudas TI D11', descripcion: 'Meta mensual de cada ANS en % (ANS-05 es un tope). 90 % mientras se negocian los porcentajes' },
  SENTIDOS_FAVORABLES: { valor: ['NIEGA', 'IMPROCEDENTE', 'HECHO_SUPERADO', 'NO_SANCIONA'], duda: 'D13', fuente: 'Dudas TI D13', descripcion: 'Sentidos favorables a la entidad (Concede y Concede parcialmente son desfavorables). En segunda instancia: Confirma es favorable si la primera lo fue; Revoca, si la primera concedió; lo demás es desfavorable' },
  DIAS_ESPERA_CUMPLIMIENTO: { valor: 1, duda: 'D12', descripcion: 'Días hábiles desde la notificación de un fallo desfavorable para que llegue la asignación del cumplimiento; después, alerta' },
  ANS03_INCLUYE_DESCORRE: { valor: true, duda: 'D14', descripcion: 'ANS-03 mide también la respuesta a la impugnación del accionante (descorre), no solo las impugnaciones de la entidad' },
  CUMPLIMIENTO_DURANTE_IMPUGNACION: { valor: true, duda: 'D12', fuente: 'Dudas TI D12', descripcion: 'Todo fallo desfavorable lleva memorial de cumplimiento, aunque se impugne: se abre la actuación de cumplimiento mientras corre la impugnación' },
  ETAPAS_CRITICAS: { valor: ['CUMPLIMIENTO', 'REQUERIMIENTO_PREVIO', 'DESACATO'], fuente: 'Manual §13', descripcion: 'Etapas que siempre son de nivel crítico' },
  HORAS_CRITICO: { valor: 24, fuente: 'Manual §13', descripcion: 'Crítico: término vencido o que vence en menos de estas horas al asignarse' },
  HORAS_ALTO: { valor: 48, fuente: 'Manual §13', descripcion: 'Alto: vence en menos de estas horas (y más que el crítico)' },
  PREFIJO_ASUNTO: { valor: process.env.PREFIJO_ASUNTO || 'GPA', fuente: 'Correo del cliente §4', descripcion: 'Primer bloque del asunto de los correos de salida, entre corchetes' },
  // Destinatarios que define el cliente en la fase inicial (manual §9 y §10.2): se llenan en Parámetros
  CORREOS_INSUMOS: { valor: [] as string[], descripcion: 'A quién se piden los insumos (enlace operativo del cliente)' },
  CORREOS_ENTREGA: { valor: [] as string[], descripcion: 'Correo único de la dependencia que recibe los proyectos (entregas V1 y V2)' },
  CORREOS_COPIA_ENTREGA: { valor: [] as string[], descripcion: 'Copia de las entregas (supervisor)' },
  DIAS_VIGENCIA_ENLACE: { valor: 90, fuente: 'Manual §23', descripcion: 'Días que dura el permiso del enlace de una entrega (el manual pide enlaces con caducidad)' },
  LIMPIAR_ADJUNTOS_BUZON: { valor: true, descripcion: 'Quitar del buzón los adjuntos que ya están verificados en SharePoint (el correo se conserva)' },
  DIAS_RETENER_ADJUNTOS_BUZON: { valor: 30, descripcion: 'Días que un adjunto sigue también en el buzón antes de quitarlo' },
  CUOTA_BUZON_GB: { valor: 50, descripcion: 'Capacidad de cada buzón compartido (50 GB sin licencia; 100 GB con licencia)' },
  ALERTA_BUZON_PORCENTAJE: { valor: 80, descripcion: 'Avisar cuando un buzón pase de este porcentaje de su capacidad' },
  HORAS_ALERTA_TERMINO: { valor: 24, fuente: 'Manual §22', descripcion: 'Alerta de término próximo cuando falten menos de estas horas para el vencimiento sin haber entregado' },
  CORREOS_ALERTAS: { valor: [] as string[], descripcion: 'A quién se emiten las alertas (responsable de la entidad y supervisor)' },
  FECHA_INICIO_PLAN: { valor: '', descripcion: 'Fecha del acta de inicio (AAAA-MM-DD): desde ahí cuenta el avance del plan de choque (ANS-04)' },
  META_DIARIA_PLAN: { valor: 168, fuente: 'Manual §13', descripcion: 'ANS-04: primeros escritos por día hábil que comprometió el plan de choque' },
  MINUTOS_ALERTA_SIN_ATENDER: { valor: 30, descripcion: 'Una asignación sin atender después de estos minutos se avisa al coordinador (en horario hábil)' },
  ACUSE_AUTOMATICO: { valor: true, descripcion: 'Enviar la confirmación de recibido con el número interno al registrar la asignación' },
  REPARTO_AUTOMATICO: { valor: true, descripcion: 'Asignar el auxiliar con menos casos abiertos del equipo que atiende la etapa' },
  EQUIPO_MINIMO: { valor: { ASISTENTE: 5, AUXILIAR: 15, REVISOR: 3, COORDINADOR: 1 }, duda: 'D27', fuente: 'Dudas TI D27', descripcion: 'ANS-11: personas mínimas por rol cada día hábil (cláusula segunda). Puede bajar si a los 10 días hábiles del inicio no se ha asignado el 50 % de los casos' },
  ASISTENCIA_JUSTIFICADA: { valor: ['INCAPACIDAD'], duda: 'D27', descripcion: 'Ausencias que no cuentan como incumplimiento del equipo mínimo (la persona se cuenta como si estuviera)' },
  CASOS_TOTALES_PLAN: { valor: 10239, duda: 'D27', fuente: 'Dudas TI D27', descripcion: 'Casos totales del plan de choque: si a los 10 días hábiles del inicio no se ha asignado la mitad, el equipo mínimo puede disminuir' },
  DESCUENTOS_ANS: {
    valor: { leveHasta: 5, moderadoHasta: 10, leve: 0.5, moderado: 1.5, grave: 3, tope: 10, siempreGraves: ['ANS-12', 'ANS-13'], reincidencia: { codigos: ['ANS-01', 'ANS-02', 'ANS-03'], meses: 3 } },
    duda: 'D29', fuente: 'Dudas TI D29',
    descripcion: 'Descuentos por indicador sobre la factura del mes (antes de IVA): leve hasta leveHasta puntos bajo la meta, moderado hasta moderadoHasta, grave más (o ANS-12/13); tope mensual y reincidencia (grave en ANS-01, 02 o 03 tres meses seguidos). Los valores están entre corchetes en el contrato'
  },
  VALOR_FACTURA_MENSUAL: { valor: 0, duda: 'D29', descripcion: 'Valor de la factura del mes antes de IVA (pesos), para mostrar el descuento en dinero. 0 = solo en porcentaje' },
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

// Inserta los que falten sin pisar los que ya se cambiaron. Los que respondió el cliente (fuente)
// reemplazan el supuesto mientras nadie lo haya confirmado a mano. Los que ya no existen se borran
export const sembrarParametros = async () => {
  for (const [clave, def] of Object.entries(PARAMETROS_BASE) as [string, Definicion][]) {
    const [fila, creado] = await Parametro.findOrCreate({
      where: { clave },
      defaults: { clave, valor: def.valor, descripcion: def.descripcion, duda: def.duda ?? null, confirmado: !!def.fuente }
    })
    // Nunca editado (updatedAt = createdAt): sigue con el supuesto sembrado y se puede reemplazar
    const sinEditar = fila.updatedAt.getTime() === fila.createdAt.getTime()
    if (!creado && def.fuente && !fila.confirmado && sinEditar) await fila.update({ valor: def.valor, descripcion: def.descripcion, confirmado: true })
  }
  await Parametro.destroy({ where: { clave: { [Op.notIn]: Object.keys(PARAMETROS_BASE) } } })
  await cargarParametros(true)
}
