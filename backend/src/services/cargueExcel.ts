import { Readable } from 'node:stream'
import ExcelJS from 'exceljs'
import { Op } from 'sequelize'
import { Correo, Juzgado } from '../models'
import { registrarAsignacion } from './registroCasos'
import { enviarPlantilla } from './buzon/correosSalida'
import { parametro } from './parametros'
import { etapaDePalabra, etapaPorTexto, criticidadDeTexto, leerFechaVence } from '../utils/asunto'
import { buscarRadicados, esRadicadoValido, normalizarRadicado, formatoRadicado } from '../utils/radicado'
import { ErrorNegocio } from '../utils/errores'
import type { Etapa, TipoSolicitud } from './constantes'

// =====================================
// CARGUE DE ASIGNACIONES DESDE EXCEL
// La entidad manda a veces un Excel con decenas de casos y sin una estructura fija. La app lee la
// primera hoja, adivina qué columna es cada dato por el encabezado (o por el contenido, en el caso
// del radicado) y el asistente corrige el emparejamiento en pantalla antes de registrar.
// Se registra por tandas desde la pantalla (así se ve el avance y no vence la petición) y al final
// sale una sola confirmación de recibido con el número interno de cada radicado.
// =====================================

export const CAMPOS_CARGUE = ['radicado', 'etapa', 'criticidad', 'vencimiento', 'notificacion', 'accionante', 'documento', 'juzgado', 'derechos', 'observaciones'] as const
export type CampoCargue = typeof CAMPOS_CARGUE[number]

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Palabras del encabezado de cada dato. El orden importa: "fecha de notificación" no es vencimiento
const PISTAS: [CampoCargue, RegExp][] = [
  ['radicado', /radicad|n(u|ú)mero (del |de )?proceso|expediente|rad\b/],
  ['notificacion', /notific/],
  ['vencimiento', /venc|fecha l(i|í)mite|plazo/],
  ['etapa', /etapa|actuaci|tipo de (actuacion|tramite)|instancia/],
  ['criticidad', /critic|prioridad|riesgo|nivel/],
  ['documento', /cedula|documento|identificac|\bc\.?c\b|\bnit\b/],
  ['accionante', /accionante|demandante|tutelante|peticionario|nombre/],
  ['juzgado', /juzgado|despacho|autoridad judicial/],
  ['derechos', /derecho|pretensi|asunto|tema/],
  ['observaciones', /observ|nota|comentario/]
]

// Excel guarda la fecha y hora "de pared" sin zona: exceljs la entrega como si fuera UTC
const textoCelda = (celda: ExcelJS.Cell): string => {
  const v = celda.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    const d = (n: number) => String(n).padStart(2, '0')
    return `${d(v.getUTCDate())}/${d(v.getUTCMonth() + 1)}/${v.getUTCFullYear()} ${d(v.getUTCHours())}:${d(v.getUTCMinutes())}`
  }
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined) return v.result instanceof Date ? textoCelda({ value: v.result } as ExcelJS.Cell) : String(v.result)
    if ('richText' in v) return v.richText.map(r => r.text).join('')
    if ('text' in v) return String(v.text)
  }
  return String(celda.text ?? v).trim()
}

export const analizarExcel = async (contenido: Buffer, nombre: string) => {
  const libro = new ExcelJS.Workbook()
  try {
    if (/\.csv$/i.test(nombre)) await libro.csv.read(Readable.from(contenido))
    else await libro.xlsx.load(contenido as unknown as ArrayBuffer)
  } catch {
    throw new ErrorNegocio('No se pudo leer el archivo: debe ser un Excel (.xlsx) o un CSV')
  }
  const hoja = libro.worksheets.find(h => h.rowCount > 0)
  if (!hoja) throw new ErrorNegocio('El archivo no tiene datos')

  const matriz: string[][] = []
  hoja.eachRow({ includeEmpty: false }, fila => {
    const valores: string[] = []
    for (let c = 1; c <= hoja.columnCount; c++) valores.push(textoCelda(fila.getCell(c)))
    if (valores.some(Boolean)) matriz.push(valores)
  })
  // Encabezado: la primera fila (de las 10 primeras) con al menos dos celdas de texto y sin radicados
  const iEncabezado = Math.max(0, matriz.slice(0, 10).findIndex(f => f.filter(x => x && !/^\d+$/.test(x)).length >= 2 && !buscarRadicados(...f).length))
  const encabezados = matriz[iEncabezado].map((t, i) => t || `Columna ${i + 1}`)
  const filas = matriz.slice(iEncabezado + 1).slice(0, 3000)

  const mapeo: Record<CampoCargue, number | null> = Object.fromEntries(CAMPOS_CARGUE.map(c => [c, null])) as Record<CampoCargue, number | null>
  const usadas = new Set<number>()
  for (const [campo, re] of PISTAS) {
    const i = encabezados.findIndex((t, j) => !usadas.has(j) && re.test(plano(t)))
    if (i >= 0) { mapeo[campo] = i; usadas.add(i) }
  }
  // Radicado sin encabezado reconocible: la columna donde más celdas son radicados de 23 dígitos
  if (mapeo.radicado === null) {
    const conteo = encabezados.map((_, j) => filas.filter(f => esRadicadoValido(normalizarRadicado(f[j] ?? ''))).length)
    const mejor = conteo.indexOf(Math.max(...conteo))
    if (conteo[mejor] > 0) mapeo.radicado = mejor
  }
  return { hoja: hoja.name, encabezados, filas, mapeo }
}

export type FilaCargue = Partial<Record<CampoCargue, string>>

const fechaDe = (texto: string | undefined, hora: string) => (texto?.trim() ? leerFechaVence(texto, hora) : null)

export const registrarFilas = async (d: {
  filas: (FilaCargue & { numero: number })[], fechaAsignacion: string, etapaPorDefecto: Etapa | null, tipoSolicitud: TipoSolicitud, origen: string, usuarioId: number
}) => {
  const hora = parametro<string>('HORA_VENCIMIENTO_TERMINO')
  const resultados: { numero: number, ok: boolean, radicado: string | null, numeroInterno?: string | null, casoId?: number, error?: string }[] = []
  for (const f of d.filas) {
    const radicado = normalizarRadicado(f.radicado ?? '')
    try {
      if (!esRadicadoValido(radicado)) throw new ErrorNegocio('El radicado no tiene 23 dígitos')
      const etapa = etapaDePalabra(f.etapa) ?? etapaPorTexto(f.etapa) ?? d.etapaPorDefecto
      if (!etapa) throw new ErrorNegocio('No se reconoce la etapa')
      // El juzgado se busca por nombre; si no está en el catálogo, queda en las observaciones
      const juzgado = f.juzgado?.trim() ? await Juzgado.findOne({ where: { nombre: { [Op.iLike]: f.juzgado.trim() } }, attributes: ['id'] }) : null
      const observaciones = [f.observaciones?.trim(), !juzgado && f.juzgado?.trim() ? `Juzgado: ${f.juzgado.trim()}` : null, d.origen].filter(Boolean).join(' · ')
      const r = await registrarAsignacion({
        correoId: null,
        fechaAsignacion: d.fechaAsignacion,
        radicado,
        tipoSolicitud: d.tipoSolicitud,
        etapa,
        criticidad: criticidadDeTexto(f.criticidad),
        fechaVencimiento: fechaDe(f.vencimiento, hora)?.toISOString() ?? null,
        fechaNotificacion: fechaDe(f.notificacion, parametro<string>('HORA_INICIO_JORNADA'))?.toISOString() ?? null,
        juzgadoId: juzgado?.id ?? null,
        partes: f.accionante?.trim() ? [{ nombre: f.accionante.trim(), numeroDocumento: f.documento?.replace(/[^\dA-Za-z]/g, '') || null, tipoDocumento: f.documento ? 'CC' : null }] : [],
        derechosInvolucrados: f.derechos?.trim() || null,
        observaciones: observaciones || null,
        sinAcuse: true
      }, d.usuarioId)
      resultados.push({ numero: f.numero, ok: true, radicado, numeroInterno: r.numeroInterno, casoId: r.casoId })
    } catch (error) {
      // En el cargue no hay correo que asociar: el mensaje del registro uno a uno no aplica
      const mensaje = error instanceof ErrorNegocio
        ? error.message.replace(': asocie el correo a ella', ' (fila repetida o caso ya registrado)')
        : 'Error inesperado'
      resultados.push({ numero: f.numero, ok: false, radicado: radicado || null, error: mensaje })
      if (!(error instanceof ErrorNegocio)) console.error('❌ Cargue fila', f.numero, error)
    }
  }
  return resultados
}

// Una sola confirmación de recibido para todo el paquete, en el hilo del correo que trajo el Excel
export const acusarPaquete = async (d: { correoId: number, registrados: { radicado: string, numeroInterno: string }[], usuarioId: number }) => {
  const correo = await Correo.findByPk(d.correoId)
  if (!correo) throw new ErrorNegocio('El correo no existe', 404)
  if (d.registrados.length && correo.remitente) {
    // Con guion: el diseño del correo lo muestra como lista
    const detalle = d.registrados.map(r => `- ${formatoRadicado(r.radicado)} → ${r.numeroInterno}`).join('\n')
    const enviado = await enviarPlantilla({
      codigo: 'ACUSE_PAQUETE', actuacionId: null, para: [correo.remitente], responderACorreoId: correo.id,
      extra: { cantidad: String(d.registrados.length), detalle }, usuarioId: d.usuarioId
    })
    if (enviado.estado === 'ERROR') throw new ErrorNegocio(`No se envió la confirmación: ${enviado.error}`)
  }
  await correo.update({ estado: 'ASOCIADO', proposito: 'ASIGNACION_PAQUETE', usuarioId: d.usuarioId, porRevisar: false })
}
