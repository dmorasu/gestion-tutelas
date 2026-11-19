// =====================================
// PLANTILLAS WORD A PARTIR DE LOS MODELOS DE LA FIRMA (reunión 18-nov)
// Toma los Word de Docs/insumos y cambia sus campos entre corchetes ([RADICADO DEL PROCESO], ☐ CRÍTICO…)
// por marcadores {radicado}, {chk_CRITICO}… que la app llena (backend/src/services/documentosWord.ts).
// El diseño del Word no se toca: solo cambia el texto de cada tramo. A la ficha le agrega dos filas
// en "Actuación y términos": tipo de respuesta y resumen de los hechos (decisión del 19-nov).
// En la solicitud del expediente, el nombre y el NIT de la entidad pasan a marcadores (no van en el código).
// Si la firma cambia un modelo, se reemplaza el Word en Docs/insumos y se vuelve a correr:
//
//   cd backend
//   NODE_PATH=$PWD/node_modules npx ts-node --transpile-only --project tsconfig.json ../Docs/herramientas/plantillas-word.ts
//
// Escribe backend/recursos/plantillas/ficha-tecnica.docx y solicitud-expediente.docx, y avisa si algún
// campo del modelo no se encontró (si la firma lo reescribió, hay que ajustar las reglas de abajo).
// =====================================
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'

const MODELOS = path.join(__dirname, '../insumos/PLANTILLAS CORREOS Y REQUERIMIENTOS DE INFORMACIÓN')
const DESTINO = path.join(__dirname, '../../backend/recursos/plantillas')

// Una regla recibe los tramos de texto de un párrafo y devuelve los nuevos (o null si no aplica)
type Regla = (textos: string[]) => string[] | null

const TRAMO = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g

const aplicar = (xml: string, regla: Regla) => xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, parrafo => {
  const textos = [...parrafo.matchAll(TRAMO)].map(m => m[1])
  if (!textos.length) return parrafo
  const nuevos = regla(textos)
  if (!nuevos) return parrafo
  let i = 0
  return parrafo.replace(TRAMO, () => `<w:t xml:space="preserve">${nuevos[i++]}</w:t>`)
})

const clave = (etiqueta: string) => etiqueta.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')

const encontrados = new Set<string>()
const marcar = (textos: string[]) => { for (const t of textos) for (const m of t.matchAll(/\{(\w+)\}/g)) encontrados.add(m[1]) }

// ── Ficha técnica ──
const reglasFicha = (): Regla => {
  const fechas = ['{fechaGeneracion}', '{fechaVencimiento}', '{fechaEntrega}']
  const horas = ['{horaGeneracion}', '{horaVencimiento}', '{horaEntrega}']
  const fijos: Record<string, string> = {
    '[RADICADO DEL PROCESO]': '{radicado}', '[NOMBRE DEL ACCIONANTE]': '{accionante}',
    '[DERECHO FUNDAMENTAL CUYO AMPARO SE SOLICITA]': '{derechos}', '[INDICAR ANEXOS Y DOCUMENTOS ENTREGADOS]': '{anexos}',
    '[AUXILIAR JURÍDICO]': '{elaboro}', '[ABOGADO TITULADO]': '{reviso}', '[N.º INTERNO]': '{numeroInterno}'
  }
  return textos => {
    const t = [...textos]
    let cambio = false
    t.forEach((x, i) => {
      if (x === '[DD/MM/AAAA]') { t[i] = fechas.shift()!; cambio = true }
      else if (x === '[HH:MM]') { t[i] = horas.shift()!; cambio = true }
      else if (fijos[x]) { t[i] = fijos[x]; cambio = true }
      // Casillas: "☐", " ", "CRÍTICO     " → {chk_CRITICO}
      else if (x === '☐' && t[i + 2]) { t[i] = `{chk_${clave(t[i + 2])}}`; cambio = true }
    })
    const junto = textos.join('')
    // [N.º INTERNO] – Versión [X]: la versión viene partida en "[", "X", "]"
    if (junto.includes('Versión [X]')) {
      const x = t.indexOf('X')
      if (x > 0) { t[x - 1] = ''; t[x] = '{version}'; t[x + 1] = '' }
    }
    // Campos partidos en varios tramos: el primero lleva el marcador y los demás quedan vacíos
    for (const [inicio, marcador] of [['[JUZGADO / DESPACHO JUDICIAL]', '{despacho}'], ['[TIEMPO RESTANTE PARA RADICACIÓN DE RESPUESTA EN DESPACHO]', '{tiempoRestante}']] as const) {
      if (junto === inicio && textos.length > 1) { t.fill(''); t[0] = marcador; cambio = true }
    }
    if (cambio) marcar(t)
    return cambio ? t : null
  }
}

// Dos filas nuevas en "Actuación y términos", copiando el diseño de la fila del derecho fundamental
const agregarFilas = (xml: string) => {
  const i = xml.indexOf('Derecho fundamental')
  if (i < 0) throw new Error('La ficha no tiene la fila "Derecho fundamental"')
  const ini = Math.max(xml.lastIndexOf('<w:tr ', i), xml.lastIndexOf('<w:tr>', i))
  const fin = xml.indexOf('</w:tr>', i) + '</w:tr>'.length
  const fila = xml.slice(ini, fin)
  if (!fila.includes('{derechos}')) throw new Error('La fila del derecho fundamental no quedó con su marcador')
  const copia = (etiqueta: string, marcador: string) => fila.replace('Derecho fundamental', etiqueta).replace('{derechos}', marcador)
  encontrados.add('tipoRespuesta'); encontrados.add('hechos')
  return xml.slice(0, fin) + copia('Tipo de respuesta', '{tipoRespuesta}') + copia('Resumen de los hechos', '{hechos}') + xml.slice(fin)
}

// ── Solicitud del expediente digital al despacho (modelo 1.1) ──
const reglasExpediente = (): Regla => {
  const xx = ['{apoderado}', '{correoApoderado}', '{apoderado}', '{ccApoderado}', '{tpApoderado}']
  return textos => {
    const t = [...textos]
    let cambio = false
    t.forEach((x, i) => {
      const nuevo =
        x === '[xx]' ? xx.shift()!
        : x === 'JUZGADO ' && t[i + 1] === '[X]' ? ''
        : x === '[X]' ? '{juzgado}'
        : x === 'Correo electrónico' && t.length === 1 ? '{correoJuzgado}'
        : x === '[23 dígitos]' ? '{radicado}'
        : x === '[Nombre completo del accionante]' ? '{accionante}'
        // La entidad no se nombra en el código ni en las plantillas: sale de los parámetros
        : x.includes('Distrito Especial de Santiago de Cali') ? x.replace(/Distrito Especial de Santiago de Cali – Secretaría de Movilidad/, '{entidadCompleta}')
        : x.includes('NIT 890.399.011-3') ? x.replace('890.399.011-3', '{nitEntidad}')
        : x === 'en adelante la ´Secretaría' ? 'en adelante '
        : x === '`, ´' && t[i - 1] === 'en adelante la ´Secretaría' ? '´'
        : null
      if (nuevo !== null && nuevo !== x) { t[i] = nuevo; cambio = true }
    })
    if (cambio) marcar(t)
    return cambio ? t : null
  }
}

const preparar = async (origen: string, destino: string, regla: Regla, esperados: string[], extra?: (xml: string) => string) => {
  encontrados.clear()
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(MODELOS, origen)))
  let xml = await zip.file('word/document.xml')!.async('string')
  xml = aplicar(xml, regla)
  if (extra) xml = extra(xml)
  if (/Secretar[ií]a de Movilidad|890\.399\.011/.test(xml)) throw new Error(`${destino}: quedó el nombre o el NIT de la entidad`)
  zip.file('word/document.xml', xml)
  fs.mkdirSync(DESTINO, { recursive: true })
  fs.writeFileSync(path.join(DESTINO, destino), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
  const faltan = esperados.filter(e => !encontrados.has(e))
  const sobran = [...xml.matchAll(/\[[^\]<]{2,60}\]/g)].map(m => m[0])
  console.log(`${destino}: ${encontrados.size} marcadores${faltan.length ? ` · NO ENCONTRADOS: ${faltan.join(', ')}` : ''}${sobran.length ? ` · quedan corchetes: ${sobran.join(' ')}` : ''}`)
}

;(async () => {
  await preparar('0. FICHA TECNICA DEL CASO.docx', 'ficha-tecnica.docx', reglasFicha(), [
    'fechaGeneracion', 'horaGeneracion', 'numeroInterno', 'version', 'chk_CRITICO', 'chk_ALTO', 'chk_ORDINARIO', 'chk_SUSPENDIDO_POR_INSUMOS', 'chk_DEVUELTO_POR_DUPLICIDAD',
    'radicado', 'accionante', 'chk_ACCION_DE_TUTELA', 'chk_ACCION_DE_CUMPLIMIENTO', 'despacho', 'chk_CONTESTACION', 'chk_IMPUGNACION', 'chk_CUMPLIMIENTO',
    'chk_REQUERIMIENTO_PREVIO', 'chk_DESACATO', 'derechos', 'tipoRespuesta', 'hechos', 'fechaVencimiento', 'horaVencimiento', 'tiempoRestante',
    'chk_V1', 'chk_V2', 'fechaEntrega', 'horaEntrega', 'anexos', 'elaboro', 'reviso'
  ], agregarFilas)
  await preparar('1.1. SOLICITUD EXPEDIENTE DIGITAL A DESPACHO.docx', 'solicitud-expediente.docx', reglasExpediente(), [
    'juzgado', 'correoJuzgado', 'radicado', 'accionante', 'entidadCompleta', 'nitEntidad', 'apoderado', 'correoApoderado', 'ccApoderado', 'tpApoderado'
  ])
})().catch(e => { console.error(e); process.exit(1) })
