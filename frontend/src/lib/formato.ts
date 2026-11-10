// Todo se muestra en hora de Colombia, venga de donde venga el navegador
const formatoFechaHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
})
const formatoFecha = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric" })

export const fechaHora = (valor?: string | null) => (valor ? formatoFechaHora.format(new Date(valor)) : "—")
export const fecha = (valor?: string | null) => (valor ? formatoFecha.format(new Date(valor)) : "—")

// Para <input type="datetime-local">: "2026-11-17T08:00" en hora de Bogotá
export const valorFechaHoraLocal = (valor?: string | null) => {
  if (!valor) return ""
  const d = new Date(new Date(valor).getTime() - 5 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 16)
}

// De <input type="datetime-local"> (hora de Bogotá) a ISO
export const isoDesdeLocal = (valor: string) => (valor ? new Date(`${valor}:00-05:00`).toISOString() : null)

export const radicado = (r?: string | null) =>
  r && r.length === 23 ? [r.slice(0, 5), r.slice(5, 7), r.slice(7, 9), r.slice(9, 12), r.slice(12, 16), r.slice(16, 21), r.slice(21)].join("-") : r ?? "—"

// Tiempo que falta (o que pasó) hasta una fecha
export const tiempoRestante = (valor?: string | null) => {
  if (!valor) return "Sin fecha"
  const minutos = Math.round((new Date(valor).getTime() - Date.now()) / 60000)
  const abs = Math.abs(minutos)
  const texto = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.floor(abs / 60)} h ${abs % 60} min` : `${Math.floor(abs / 1440)} días`
  return minutos < 0 ? `Vencido hace ${texto}` : texto
}

export const ETAPAS: Record<string, string> = {
  ACCION: "Contestación",
  IMPUGNACION: "Impugnación",
  CUMPLIMIENTO: "Cumplimiento",
  REQUERIMIENTO_PREVIO: "Requerimiento previo",
  DESACATO: "Desacato",
  PQRS: "PQRS"
}

export const TIPOS_SOLICITUD: Record<string, string> = { TUTELA: "Tutela", ACCION_CUMPLIMIENTO: "Acción de cumplimiento", PQRS: "PQRS" }

export const ESTADOS_ACTUACION: Record<string, string> = {
  POR_ASUMIR: "Por asumir",
  EN_ANALISIS: "En análisis",
  EN_INSUMOS: "Esperando insumos",
  EN_PROYECCION: "En proyección",
  EN_REVISION: "Con el revisor",
  AJUSTE_INTERNO: "Ajuste pedido por el revisor",
  ENTREGADO: "Entregado a la entidad",
  DEVUELTO: "Devuelto por la entidad",
  APROBADO: "Aprobado por la entidad",
  RADICADO: "Radicado",
  CERRADA: "Cerrada"
}

export const CRITICIDADES: Record<string, string> = { CRITICO: "Crítico", ALTO: "Alto", ORDINARIO: "Ordinario" }

// Clasificación de las devoluciones de la entidad (manual §17). Solo las de fondo cuentan para ANS-05
export const TIPOS_DEVOLUCION: Record<string, string> = { FONDO: "De fondo", SOPORTE: "Por falta de soporte", CRITERIO: "Por criterio institucional", ESTILO: "De estilo" }

export const BUZONES: Record<string, string> = { ASIGNACIONES: "Asignaciones", INSUMOS: "Insumos", ENTREGAS: "Entregas" }

// Para qué salió o qué resultó ser cada correo
export const PROPOSITOS: Record<string, string> = {
  ASIGNACION: "Asignación",
  SEGUIMIENTO: "Seguimiento",
  ACUSE_ASIGNACION: "Confirmación de recibido",
  SOLICITUD_DATOS_FALTANTES: "Solicitud de datos faltantes",
  RESPUESTA_DATOS_FALTANTES: "Datos faltantes recibidos",
  ACUSE_DATOS_FALTANTES: "Confirmación de datos faltantes",
  SOLICITUD_INSUMOS: "Solicitud de insumos",
  RESPUESTA_INSUMOS: "Insumos recibidos",
  ACUSE_INSUMOS: "Confirmación de insumos",
  ENTREGA_V1: "Entrega V1",
  ENTREGA_V2: "Entrega V2",
  RESPUESTA_ENTREGA: "Respuesta a la entrega",
  ACUSE_ENTIDAD: "Acuse de la entidad",
  APROBACION_ENTIDAD: "Aprobación de la entidad",
  DEVOLUCION_ENTIDAD: "Devolución de la entidad",
  ACUSE_PAQUETE: "Confirmación del paquete",
  ALERTA: "Alerta al cliente",
  LIBRE: "Correo escrito desde el caso",
  ASIGNACION_PAQUETE: "Asignación en paquete (Excel)"
}

export const UNIDADES_TERMINO: Record<string, string> = { HORAS: "Horas", DIAS_HABILES: "Días hábiles", DIAS_CALENDARIO: "Días calendario" }
