import { instanteBogota } from './fechaColombia'
import { esRadicadoValido, normalizarRadicado, buscarRadicados } from './radicado'
import type { Criticidad, Etapa } from '../services/constantes'

// =====================================
// ASUNTO NORMALIZADO (correo del cliente, punto 4)
//   [PREFIJO] [CRÍTICO / ALTO / ORDINARIO] [Radicado de 23 dígitos] [Actuación] [Vence: fecha y hora]
// La asignación trae la actuación (TUTELA, IMPUGNACIÓN, CUMPLIMIENTO, REQUERIMIENTO PREVIO,
// DESACATO); los correos de salida llevan SOLICITUD DE INSUMOS, ENTREGA V1 o ENTREGA V2 (se arman
// con las plantillas de services/buzon/correosSalida).
// Se lee por bloques entre corchetes y en cualquier orden: el cliente puede equivocarse en el orden
// o en las tildes, y la respuesta ("RE: ...") conserva los bloques.
// =====================================

export type TipoAsunto = 'ASIGNACION' | 'SOLICITUD_INSUMOS' | 'ENTREGA_V1' | 'ENTREGA_V2'

export type AsuntoLeido = {
  criticidad: Criticidad | null
  radicado: string | null
  etapa: Etapa | null
  tipo: TipoAsunto | null
  vence: Date | null
}

const plano = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

// Palabra de la actuación → etapa. "TUTELA" y "CONTESTACION" son la contestación de la acción
const ETAPAS_POR_PALABRA: [RegExp, Etapa][] = [
  [/^REQUERIMIENTO( PREVIO)?$/, 'REQUERIMIENTO_PREVIO'],
  [/^DESACATO$/, 'DESACATO'],
  [/^IMPUGNACION$/, 'IMPUGNACION'],
  [/^CUMPLIMIENTO$/, 'CUMPLIMIENTO'],
  [/^(TUTELA|CONTESTACION|ACCION DE TUTELA|ACCION DE CUMPLIMIENTO)$/, 'ACCION'],
  [/^PQRS?$/, 'PQRS']
]

const TIPOS_POR_PALABRA: [RegExp, TipoAsunto][] = [
  [/^SOLICITUD DE INSUMOS$/, 'SOLICITUD_INSUMOS'],
  [/^ENTREGA V ?1$/, 'ENTREGA_V1'],
  [/^ENTREGA V ?2$/, 'ENTREGA_V2']
]

const MESES: Record<string, number> = {
  ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6, JULIO: 7, AGOSTO: 8,
  SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12
}

// Hora en "17:00", "5:00 PM", "5 p. m.", "5:30 p.m." → "HH:MM"
const leerHora = (texto: string): string | null => {
  const m = texto.match(/(\d{1,2})(?::(\d{2}))?\s*(A\.? ?M\.?|P\.? ?M\.?)?/)
  if (!m || (!m[2] && !m[3])) return null
  let h = Number(m[1])
  const min = Number(m[2] ?? 0)
  const sufijo = (m[3] ?? '').replace(/[.\s]/g, '')
  if (sufijo === 'PM' && h < 12) h += 12
  if (sufijo === 'AM' && h === 12) h = 0
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// Fecha y hora del "Vence:". Formatos: 12/11/2026 17:00, 12-11-2026 5:00 p. m., 2026-11-12 17:00,
// 12 de noviembre de 2026 5 pm. Sin hora, la de vencimiento de términos (horaPorDefecto)
export const leerFechaVence = (texto: string, horaPorDefecto: string): Date | null => {
  const t = plano(texto)
  let dia: string | null = null
  let resto = t
  const iso = t.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  const latina = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  const larga = t.match(/(\d{1,2}) DE ([A-Z]+)(?: DE)? (\d{4})/)
  const armar = (a: string | number, m: string | number, d: string | number) => {
    const [an, me, di] = [Number(a), Number(m), Number(d)]
    if (me < 1 || me > 12 || di < 1 || di > 31) return null
    return `${an}-${String(me).padStart(2, '0')}-${String(di).padStart(2, '0')}`
  }
  if (iso) { dia = armar(iso[1], iso[2], iso[3]); resto = t.slice((iso.index ?? 0) + iso[0].length) }
  else if (latina) { dia = armar(latina[3], latina[2], latina[1]); resto = t.slice((latina.index ?? 0) + latina[0].length) }
  else if (larga && MESES[larga[2]]) { dia = armar(larga[3], MESES[larga[2]], larga[1]); resto = t.slice((larga.index ?? 0) + larga[0].length) }
  if (!dia) return null
  return instanteBogota(dia, leerHora(resto) ?? horaPorDefecto)
}

export const leerAsunto = (asunto: string | null | undefined, horaPorDefecto = '17:00'): AsuntoLeido => {
  const leido: AsuntoLeido = { criticidad: null, radicado: null, etapa: null, tipo: null, vence: null }
  if (!asunto) return leido
  for (const [, bruto] of asunto.matchAll(/\[([^\]]+)\]/g)) {
    const bloque = plano(bruto)
    if (/^CRITICO$|^ALTO$|^ORDINARIO$/.test(bloque)) { leido.criticidad ??= bloque as Criticidad; continue }
    if (bloque.startsWith('VENCE')) { leido.vence ??= leerFechaVence(bloque.replace(/^VENCE\s*:?\s*/, ''), horaPorDefecto); continue }
    const digitos = normalizarRadicado(bloque)
    if (esRadicadoValido(digitos) && /^[\d\s.\-–]+$/.test(bloque)) { leido.radicado ??= digitos; continue }
    const palabra = bloque.replace(/^ACTUACION\s*:?\s*/, '')
    const tipo = TIPOS_POR_PALABRA.find(([re]) => re.test(palabra))
    if (tipo) { leido.tipo ??= tipo[1]; continue }
    const etapa = ETAPAS_POR_PALABRA.find(([re]) => re.test(palabra))
    if (etapa) { leido.etapa ??= etapa[1]; leido.tipo ??= 'ASIGNACION' }
  }
  // Sin bloque de radicado, el primero que aparezca en el asunto
  leido.radicado ??= buscarRadicados(asunto)[0] ?? null
  return leido
}

// Una celda o un texto corto con el nombre de la actuación ("Desacato", "TUTELA", "Impugnación")
export const etapaDePalabra = (texto: string | null | undefined): Etapa | null => {
  if (!texto) return null
  const palabra = plano(texto).replace(/^ACTUACION\s*:?\s*/, '')
  return ETAPAS_POR_PALABRA.find(([re]) => re.test(palabra))?.[1] ?? null
}

export const criticidadDeTexto = (texto: string | null | undefined): Criticidad | null => {
  const t = plano(texto ?? '')
  if (t.startsWith('CRIT')) return 'CRITICO'
  if (t.startsWith('ALT')) return 'ALTO'
  if (t.startsWith('ORD')) return 'ORDINARIO'
  return null
}

// Sin asunto normalizado: la etapa por palabras del asunto y del cuerpo. El orden importa: un
// desacato menciona el fallo y su cumplimiento; una impugnación menciona la tutela
export const etapaPorTexto = (...textos: (string | null | undefined)[]): Etapa | null => {
  const t = plano(textos.filter(Boolean).join(' '))
  if (!t) return null
  if (/DESACATO/.test(t)) return 'DESACATO'
  if (/REQUERIMIENTO PREVIO|REQUIERE (AL|A LA) .*CUMPLIMIENTO/.test(t)) return 'REQUERIMIENTO_PREVIO'
  if (/IMPUGNA/.test(t)) return 'IMPUGNACION'
  if (/CUMPLIMIENTO (DEL|DE LA|AL) (FALLO|SENTENCIA|ORDEN)/.test(t)) return 'CUMPLIMIENTO'
  if (/TUTELA|AUTO ADMISORIO|ADMITE|ACCION DE CUMPLIMIENTO/.test(t)) return 'ACCION'
  return null
}
