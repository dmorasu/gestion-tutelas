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
  ACCION: "Acción",
  IMPUGNACION: "Impugnación",
  CUMPLIMIENTO: "Cumplimiento",
  REQUERIMIENTO_PREVIO: "Requerimiento previo",
  DESACATO: "Desacato",
  PQRS: "PQRS"
}

export const TIPOS_SOLICITUD: Record<string, string> = { TUTELA: "Tutela", ACCION_CUMPLIMIENTO: "Acción de cumplimiento", PQRS: "PQRS" }

export const ESTADOS_ACTUACION: Record<string, string> = {
  POR_ASUMIR: "Por asumir",
  EN_INSUMOS: "Esperando insumos",
  EN_PROYECCION: "En proyección",
  EN_REVISION: "En revisión del abogado",
  ENTREGADO: "Entregado a la entidad",
  DEVUELTO: "Devuelto",
  RADICADO: "Radicado en el juzgado",
  CERRADA: "Cerrada"
}

export const UNIDADES_TERMINO: Record<string, string> = { HORAS: "Horas", DIAS_HABILES: "Días hábiles", DIAS_CALENDARIO: "Días calendario" }
