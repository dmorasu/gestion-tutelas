// =====================================
// PLANTILLAS WORD A PARTIR DE LOS MODELOS DE LA FIRMA (reunión 18-nov)
// Toma los Word de Docs/insumos y Docs/formatos y cambia sus campos entre corchetes ([RADICADO DEL
// PROCESO], ☐ CRÍTICO…) por marcadores {radicado}, {chk_CRITICO}… que la app llena
// (backend/src/services/documentosWord.ts). El diseño del Word no se toca: solo cambia el texto de cada
// tramo. La ficha sale del modelo V19112026 (ya trae hechos y tipo de contestación) y se le agrega la
// fila de la petición al despacho (reunión del 23-nov).
// Escritos de emergencia (reunión del 23-nov): el nombre, el NIT y las menciones de la entidad pasan a
// marcadores de los parámetros; lo que la app no sabe (la orden del fallo, las gestiones…) queda entre
// corchetes para que el auxiliar lo complete en el Word.
// En la solicitud del expediente, el nombre y el NIT de la entidad pasan a marcadores (no van en el código).
// Si la firma cambia un modelo, se reemplaza el Word en Docs/insumos y se vuelve a correr:
//
//   cd backend
//   NODE_PATH=$PWD/node_modules npx ts-node --transpile-only --project tsconfig.json ../Docs/herramientas/plantillas-word.ts
//
// Escribe en backend/recursos/plantillas la ficha, la solicitud del expediente y los cuatro escritos de
// emergencia (emergencia-*.docx), y avisa si algún
// campo del modelo no se encontró (si la firma lo reescribió, hay que ajustar las reglas de abajo).
// =====================================
import fs from 'fs'
import path from 'path'
import JSZip from 'jszip'

const MODELOS = path.join(__dirname, '../insumos/PLANTILLAS CORREOS Y REQUERIMIENTOS DE INFORMACIÓN')
const FORMATOS = path.join(__dirname, '../formatos')
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
    '[AUXILIAR JURÍDICO]': '{elaboro}', '[ABOGADO TITULADO]': '{reviso}', '[N.º INTERNO]': '{numeroInterno}',
    // Modelo V19112026: filas propias de hechos y tipo de contestación (el tipo de respuesta de la app)
    '[JUZGADO / DESPACHO JUDICIAL]': '{despacho}', '[BREVE RESUMEN DE LOS HECHOS]': '{hechos}', '[INDICAR TIPO DE AGRUMENTO – PLANTILLA REQUERIDA PARA EL CASO]': '{tipoRespuesta}'
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
      // Modelo V19112026: "☐ ", "CRÍTICO     " → "{chk_CRITICO} "
      else if (x === '☐ ' && t[i + 1]) { t[i] = `{chk_${clave(t[i + 1])}} `; cambio = true }
    })
    const junto = textos.join('')
    // El modelo trae "HEChOS" (una h minúscula en su propio tramo)
    if (junto === 'RESUMEN DE LOS HEChOS') { t.fill(''); t[0] = 'RESUMEN DE LOS HECHOS'; cambio = true }
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

// Fila nueva de la petición al despacho, con el diseño de la fila "Tipo de contestación" y debajo de ella
const agregarPeticion = (xml: string) => {
  const i = xml.indexOf('TIPO DE CONTESTACIÓN')
  if (i < 0) throw new Error('La ficha no tiene la fila "Tipo de contestación"')
  const ini = Math.max(xml.lastIndexOf('<w:tr ', i), xml.lastIndexOf('<w:tr>', i))
  const fin = xml.indexOf('</w:tr>', i) + '</w:tr>'.length
  const fila = xml.slice(ini, fin)
  if (!fila.includes('{tipoRespuesta}')) throw new Error('La fila del tipo de contestación no quedó con su marcador')
  encontrados.add('peticion')
  return xml.slice(0, fin) + fila.replace('TIPO DE CONTESTACIÓN', 'PETICIÓN AL DESPACHO').replace('{tipoRespuesta}', '{peticion}') + xml.slice(fin)
}

// ── Escritos de emergencia (reunión del 23-nov) ──
// La entidad no se nombra en las plantillas: cada mención pasa a un marcador de los parámetros
// ({entidadCompleta}, {entidadMayus}, {entidad}, {Entidad}, {nitEntidad}). De lo más largo a lo más corto
const ENTIDAD: [string | RegExp, string][] = [
  ['DISTRITO ESPECIAL DE SANTIAGO DE CALI – SECRETARÍA DE MOVILIDAD', '{entidadMayus}'],
  ['Distrito Especial de Santiago de Cali – Secretaría de Movilidad', '{entidadCompleta}'],
  ['la Secretaría de Movilidad del Distrito Especial de Santiago de Cali', '{entidad}'],
  ['La Secretaría de Movilidad de Cali', '{Entidad}'],
  ['la Secretaría de Movilidad de Cali', '{entidad}'],
  ['La Secretaría de Movilidad', '{Entidad}'],
  ['la Secretaría de Movilidad', '{entidad}'],
  [/NIT\.? 890\.399\.011-3/, 'NIT {nitEntidad}'],
  // "(en adelante la ´Secretaría`, ´la Entidad`…)": queda solo "la Entidad"
  ['en adelante la ´Secretaría`,  ´la Entidad`', 'en adelante ´la Entidad`'],
  ['(en adelante la ´Secretaría`', '(en adelante '],
  ['la Secretaría', 'la Entidad']
]
const sinEntidad = (x: string) => ENTIDAD.reduce((t, [a, b]) => t.split(a as string).join(b).replace(typeof a === 'string' ? /$^/ : a, b), x)

// tutela: los modelos de contestación, requerimiento previo y desacato. cumplimiento: el de la acción de cumplimiento
const reglasEmergencia = (tipo: 'contestacion' | 'tutela' | 'cumplimiento'): Regla => {
  // [xx] en el orden en que aparece: el apoderado al empezar, su correo y la firma (nombre, C.C. y T.P.)
  const xx = ['{apoderado}', '{correoApoderado}', '{apoderado}', '{ccApoderado}', '{tpApoderado}']
  // (xx) del requerimiento y el desacato: fecha del fallo, del auto, el derecho y el término pedido (dos veces)
  const parentesis = ['{fechaFallo}', '{fechaAuto}', '{derechos}', '{diasTermino}', '{fechaTermino}', '{diasTermino}', '{fechaTermino}']
  // Acción de cumplimiento: [fecha] del auto, de su notificación y del fallo, la del fallo en los
  // hechos, la del auto en los hechos y la del fallo en la solicitud
  const fechas = ['{fechaAuto}', '{fechaNotificacion}', '{fechaFallo}', '{fechaFallo}', '{fechaAuto}', '{fechaFallo}']
  const cedulas = ['{ccApoderado}', '{tpApoderado}', '{ccApoderado}', '{tpApoderado}']
  // [___] del término: el del fallo y el del auto los completa el auxiliar; el de la solicitud es el pedido
  const terminos = [null, null, '{diasTermino}']
  return textos => {
    // La contestación parte el nombre de la entidad en dos tramos: " del Distrito", " Especial de …"
    const previo = textos.map((x, i) => (x === ' del Distrito' && textos[i + 1]?.startsWith(' Especial de Santiago de Cali – Secretaría de Movilidad') ? ' del ' : x))
      .map((x, i) => (textos[i - 1] === ' del Distrito' ? x.replace(' Especial de Santiago de Cali – Secretaría de Movilidad', '{entidadCompleta}') : x))
    const t = previo.map(sinEntidad)
    // "(en adelante la ´Secretaría`", ", ", " ´la Entidad`": sin la Secretaría sobran la coma y el espacio
    t.forEach((x, i) => {
      if (x.endsWith('(en adelante ') && t[i + 1] === ', ' && t[i + 2]?.startsWith(' ´la Entidad`')) { t[i + 1] = ''; t[i + 2] = t[i + 2].trimStart() }
    })
    let cambio = t.some((x, i) => x !== textos[i])
    const poner = (i: number, valor: string, vaciar: number[] = []) => { t[i] = valor; for (const v of vaciar) t[v] = ''; cambio = true }
    const junto = textos.join('')
    t.forEach((x, i) => {
      // El accionado de la acción de cumplimiento viene en dos tramos
      if (x === 'DISTRITO ESPECIAL DE SANTIAGO DE CALI – ' && t[i + 1] === 'SECRETARÍA DE MOVILIDAD') poner(i, '{entidadMayus}', [i + 1])
      // Encabezado del despacho
      else if (x === 'JUZGADO ' && t[i + 1] === '[X]') poner(i, '', [])
      else if (x === '[X]' && t[i - 1] === '') poner(i, '{juzgado}')
      else if (x === 'JUEZ ' && t[i + 1] === '[__________]' && t[i + 2] === ' DE ') poner(i, '{juzgado}', [i + 1, i + 2, i + 3])
      else if (x === '[Ciudad]') poner(i, '{ciudad}')
      // Radicado y accionante: "[", "23 dígitos]" o "[__________]" después de la etiqueta
      else if (x === '[' && t[i + 1] === '23 dígitos]') poner(i, '{radicado}', [i + 1])
      else if (x === '[' && t[i + 1] === 'Nombre completo del accionante]') poner(i, '{accionante}', [i + 1])
      else if (x === '[__________]' && /^RADICADO/.test(junto)) poner(i, '{radicado}')
      else if (x === '[__________]' && /^ACCIONANTE/.test(junto)) poner(i, '{accionante}')
      // Apoderado
      else if (x === '[' && t[i + 1] === 'xx' && t[i + 2] === ']') poner(i, xx.shift()!, [i + 1, i + 2])
      else if (x === '[NOMBRE DEL APODERADO]') poner(i, '{apoderado}')
      else if (x === '[_____]') poner(i, cedulas.shift()!)
      // "(", "xx", ")" o "… de (", "xx", ") días": el paréntesis sale con el valor
      else if (x === 'xx' && t[i - 1]?.endsWith('(') && t[i + 1]?.startsWith(')')) {
        t[i - 1] = t[i - 1].slice(0, -1); t[i + 1] = t[i + 1].slice(1); poner(i, parentesis.shift()!)
      }
      else if (x === '[fecha]') poner(i, fechas.shift()!)
      else if (x === '[___]') { const v = terminos.shift(); if (v) poner(i, v) }
      else if (x.includes('término de [___] días hábiles')) poner(i, x.replace('[___]', '{diasTermino}'))
      else if (x === '[dirección física]') poner(i, '{direccionEntidad}')
      else if (x === '[correo de notificaciones judiciales de la entidad]') poner(i, '{correoEntidad}')
      // El modelo salta de PRIMERO a TERCERO
      else if (x === 'TERCERO: ' && tipo === 'cumplimiento') poner(i, 'SEGUNDO: ')
    })
    if (cambio) marcar(t)
    return cambio ? t : null
  }
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

const preparar = async (origen: string, destino: string, regla: Regla, esperados: string[], extra?: (xml: string) => string, carpeta = MODELOS) => {
  encontrados.clear()
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(carpeta, origen)))
  let xml = await zip.file('word/document.xml')!.async('string')
  xml = aplicar(xml, regla)
  if (extra) xml = extra(xml)
  if (/Movilidad|Santiago de Cali|890\.399\.011/i.test(xml)) throw new Error(`${destino}: quedó el nombre o el NIT de la entidad`)
  zip.file('word/document.xml', xml)
  fs.mkdirSync(DESTINO, { recursive: true })
  fs.writeFileSync(path.join(DESTINO, destino), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
  const faltan = esperados.filter(e => !encontrados.has(e))
  const sobran = [...xml.matchAll(/\[[^\]<]{2,60}\]/g)].map(m => m[0])
  console.log(`${destino}: ${encontrados.size} marcadores${faltan.length ? ` · NO ENCONTRADOS: ${faltan.join(', ')}` : ''}${sobran.length ? ` · quedan corchetes: ${sobran.join(' ')}` : ''}`)
}

;(async () => {
  await preparar('0. FICHA TECNICA DEL CASO V19112026.docx', 'ficha-tecnica.docx', reglasFicha(), [
    'fechaGeneracion', 'horaGeneracion', 'numeroInterno', 'version', 'chk_CRITICO', 'chk_ALTO', 'chk_ORDINARIO', 'chk_SUSPENDIDO_POR_INSUMOS', 'chk_DEVUELTO_POR_DUPLICIDAD',
    'radicado', 'accionante', 'chk_ACCION_DE_TUTELA', 'chk_ACCION_DE_CUMPLIMIENTO', 'despacho', 'chk_CONTESTACION', 'chk_IMPUGNACION', 'chk_CUMPLIMIENTO',
    'chk_REQUERIMIENTO_PREVIO', 'chk_DESACATO', 'derechos', 'tipoRespuesta', 'hechos', 'peticion', 'fechaVencimiento', 'horaVencimiento', 'tiempoRestante',
    'chk_V1', 'chk_V2', 'fechaEntrega', 'horaEntrega', 'anexos', 'elaboro', 'reviso'
  ], agregarPeticion, FORMATOS)
  await preparar('1.1. SOLICITUD EXPEDIENTE DIGITAL A DESPACHO.docx', 'solicitud-expediente.docx', reglasExpediente(), [
    'juzgado', 'correoJuzgado', 'radicado', 'accionante', 'entidadCompleta', 'nitEntidad', 'apoderado', 'correoApoderado', 'ccApoderado', 'tpApoderado'
  ])
  const firma = ['apoderado', 'correoApoderado', 'ccApoderado', 'tpApoderado', 'juzgado', 'radicado', 'accionante', 'entidadCompleta', 'nitEntidad']
  const requerimiento = [...firma, 'fechaFallo', 'fechaAuto', 'derechos', 'diasTermino', 'fechaTermino', 'entidad', 'Entidad']
  await preparar('1.1.13. TUTELA CONTESTACIÓN EMERGENCIA.docx', 'emergencia-contestacion.docx', reglasEmergencia('contestacion'), [...firma, 'entidad'], undefined, FORMATOS)
  await preparar('4.1.2. TUTELA REQ PREVIO EMERGENCIA.docx', 'emergencia-requerimiento-previo.docx', reglasEmergencia('tutela'), requerimiento, undefined, FORMATOS)
  await preparar('5.1.1. TUTELA DESACATO EMERGENCIA.docx', 'emergencia-desacato.docx', reglasEmergencia('tutela'), requerimiento, undefined, FORMATOS)
  await preparar('4.2.2. CUMPLIMIENTO REQ PREVIO EMERGENCIA.docx', 'emergencia-requerimiento-cumplimiento.docx', reglasEmergencia('cumplimiento'), [
    'juzgado', 'ciudad', 'radicado', 'accionante', 'entidadMayus', 'apoderado', 'ccApoderado', 'tpApoderado', 'nitEntidad',
    'fechaAuto', 'fechaNotificacion', 'fechaFallo', 'diasTermino', 'entidad', 'Entidad', 'direccionEntidad', 'correoEntidad', 'entidadCompleta'
  ], undefined, FORMATOS)
})().catch(e => { console.error(e); process.exit(1) })
