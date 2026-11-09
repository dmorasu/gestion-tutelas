import { sumarDias } from './fechaColombia'

// =====================================
// DÍAS HÁBILES EN COLOMBIA (copiado de Nodex y ampliado)
// Sin sábados, domingos ni festivos. Los festivos se calculan para cualquier año: fijos, los que
// la Ley Emiliani (Ley 51 de 1983) pasa al lunes siguiente y los que dependen de la Pascua.
// Además, la tabla de días no hábiles (D3: 24 y 31 de diciembre, vacancia judicial...) que puede
// aplicar a todas las etapas o solo a algunas. Fechas como texto YYYY-MM-DD (días de Colombia).
// =====================================

const DIA_MS = 24 * 60 * 60 * 1000
const texto = (fecha: Date) => fecha.toISOString().slice(0, 10)
const sumar = (fecha: Date, dias: number) => new Date(fecha.getTime() + dias * DIA_MS)
const utc = (anio: number, mes: number, dia: number) => new Date(Date.UTC(anio, mes - 1, dia))

// Domingo de Pascua (algoritmo anónimo gregoriano)
const pascua = (anio: number) => {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1
  return utc(anio, mes, dia)
}

const alLunes = (fecha: Date) => sumar(fecha, (8 - fecha.getUTCDay()) % 7)

const cache = new Map<number, Set<string>>()

export const festivosColombia = (anio: number): Set<string> => {
  const guardados = cache.get(anio)
  if (guardados) return guardados
  const p = pascua(anio)
  const festivos = new Set([
    ...[[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]].map(([m, d]) => utc(anio, m, d)),
    ...[[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].map(([m, d]) => alLunes(utc(anio, m, d))),
    sumar(p, -3), sumar(p, -2), sumar(p, 43), sumar(p, 64), sumar(p, 71)
  ].map(texto))
  cache.set(anio, festivos)
  return festivos
}

// ── Días no hábiles de la tabla (los carga services/calendario.ts) ──
// etapas null = aplica a todas
export type DiaNoHabilRegla = { fecha: string, etapas: string[] | null }
let adicionales = new Map<string, string[] | null>()

export const fijarDiasNoHabiles = (dias: DiaNoHabilRegla[]) => {
  adicionales = new Map(dias.map(d => [d.fecha, d.etapas?.length ? d.etapas : null]))
}

export const esDiaHabil = (fecha: string, etapa?: string) => {
  const dia = new Date(`${fecha}T00:00:00Z`)
  const semana = dia.getUTCDay()
  if (semana === 0 || semana === 6 || festivosColombia(dia.getUTCFullYear()).has(fecha)) return false
  if (!adicionales.has(fecha)) return true
  const etapas = adicionales.get(fecha) ?? null
  // Sin etapa (ej. jornada laboral del equipo) cuenta como no hábil si aplica a todas
  return etapas === null ? false : !etapa || !etapas.includes(etapa)
}

// El n-ésimo día hábil después de una fecha (sin contarla)
export const sumarDiasHabiles = (fecha: string, dias: number, etapa?: string) => {
  let actual = fecha
  let faltan = dias
  while (faltan > 0) {
    actual = sumarDias(actual, 1)
    if (esDiaHabil(actual, etapa)) faltan--
  }
  return actual
}

// El n-ésimo día hábil antes de una fecha (sin contarla)
export const restarDiasHabiles = (fecha: string, dias: number, etapa?: string) => {
  let actual = fecha
  let faltan = dias
  while (faltan > 0) {
    actual = sumarDias(actual, -1)
    if (esDiaHabil(actual, etapa)) faltan--
  }
  return actual
}

// Ese día si es hábil; si no, el siguiente hábil
export const habilDesde = (fecha: string, etapa?: string) =>
  esDiaHabil(fecha, etapa) ? fecha : sumarDiasHabiles(fecha, 1, etapa)
