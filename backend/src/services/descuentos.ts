import { parametro } from './parametros'
import type { Indicador } from './indicadores'

// =====================================
// DESCUENTOS POR ANS (D29). Por indicador, sobre la factura del mes del incumplimiento (antes de
// IVA), acumulables hasta el tope mensual:
//   leve: hasta N puntos por debajo de la meta · moderado: entre N y M · grave: más de M, o
//   cualquier incumplimiento de ANS-12 o ANS-13.
// Los porcentajes y los puntos salen del parámetro DESCUENTOS_ANS (el contrato los deja entre
// corchetes). Son alertas internas: el cliente no las ve en el tablero.
// =====================================

export type NivelDescuento = 'LEVE' | 'MODERADO' | 'GRAVE'
export type ReglaDescuentos = {
  leveHasta: number, moderadoHasta: number
  leve: number, moderado: number, grave: number
  tope: number
  // Siempre graves si se incumplen
  siempreGraves: string[]
  // Reincidencia: grave en estos ANS tantos meses seguidos
  reincidencia: { codigos: string[], meses: number }
}

// Puntos porcentuales por debajo de la meta (por encima, si el ANS es un tope como ANS-05)
const desvio = (i: Pick<Indicador, 'sentido' | 'meta' | 'porcentaje'>) => {
  if (i.porcentaje === null || i.meta === null) return null
  return i.sentido === 'MAX' ? i.porcentaje - i.meta : i.meta - i.porcentaje
}

export const nivelDe = (i: Pick<Indicador, 'codigo' | 'sentido' | 'meta' | 'porcentaje' | 'cumple' | 'total'>, regla = parametro<ReglaDescuentos>('DESCUENTOS_ANS')): { nivel: NivelDescuento | null, descuento: number } => {
  if (i.cumple !== false) return { nivel: null, descuento: 0 }
  if (i.sentido === 'CERO' || regla.siempreGraves.includes(i.codigo)) return { nivel: 'GRAVE', descuento: regla.grave }
  const d = desvio(i)
  if (d === null || d <= 0) return { nivel: null, descuento: 0 }
  if (d <= regla.leveHasta) return { nivel: 'LEVE', descuento: regla.leve }
  if (d <= regla.moderadoHasta) return { nivel: 'MODERADO', descuento: regla.moderado }
  return { nivel: 'GRAVE', descuento: regla.grave }
}

// Suma del mes con el tope
export const totalDescuento = (descuentos: number[], regla = parametro<ReglaDescuentos>('DESCUENTOS_ANS')) => {
  const suma = Math.round(descuentos.reduce((a, b) => a + b, 0) * 100) / 100
  return { suma, aplicado: Math.min(suma, regla.tope), topado: suma > regla.tope }
}

// Reincidencia: grave en ANS-01, 02 o 03 los últimos N meses seguidos (incluido el actual).
// "historia" trae por mes (AAAA-MM, del más reciente al más antiguo) el nivel de cada código
export const reincidentes = (historia: { mes: string, niveles: Record<string, string | null> }[], regla = parametro<ReglaDescuentos>('DESCUENTOS_ANS')) =>
  regla.reincidencia.codigos.filter(codigo => {
    const ultimos = historia.slice(0, regla.reincidencia.meses)
    return ultimos.length === regla.reincidencia.meses && ultimos.every(m => m.niveles[codigo] === 'GRAVE')
  })
