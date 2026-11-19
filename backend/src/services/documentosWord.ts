import fs from 'fs/promises'
import path from 'path'
import JSZip from 'jszip'
import { Actuacion, Caso, Escrito, ItemCatalogo, Juzgado, Parte, Usuario } from '../models'
import { guardarEnExpediente, type Subcarpeta } from './expediente'
import { parametro } from './parametros'
import { tiempoRestante } from './buzon/correosSalida'
import { NOMBRES_ETAPAS } from './constantes'
import { formatoRadicado } from '../utils/radicado'
import { textoFechaHora } from '../utils/fechaColombia'
import { ErrorNegocio } from '../utils/errores'

// =====================================
// WORD A PARTIR DE LOS MODELOS DE LA FIRMA (reunión 18-nov)
// Las plantillas (backend/recursos/plantillas) salen de los Word de Docs/insumos con
// Docs/herramientas/plantillas-word.ts: cada campo es un marcador {clave} dentro de un solo tramo de
// texto, así que llenarlas es reemplazar texto sin tocar el diseño.
// =====================================

const CARPETA = path.join(__dirname, '../../recursos/plantillas')
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const MARCADO = '☒'
const VACIO = '☐'

const escaparXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Un salto de línea en el valor es un salto de línea en Word, dentro del mismo tramo
const valorXml = (t: string) => escaparXml(t).split(/\r?\n/).join('</w:t><w:br/><w:t xml:space="preserve">')

export const llenarWord = async (plantilla: 'ficha-tecnica' | 'solicitud-expediente', valores: Record<string, string>) => {
  const zip = await JSZip.loadAsync(await fs.readFile(path.join(CARPETA, `${plantilla}.docx`)))
  const documento = zip.file('word/document.xml')
  if (!documento) throw new Error(`La plantilla ${plantilla} no es un Word válido`)
  // Un marcador sin valor queda vacío: mejor un campo en blanco que "{clave}" en el escrito
  const xml = (await documento.async('string')).replace(/\{(\w+)\}/g, (_, clave: string) => valorXml(valores[clave] ?? ''))
  zip.file('word/document.xml', xml)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

const fechaYHora = (d: Date | null | undefined) => {
  const texto = d ? textoFechaHora(d) : ''
  const [fecha = '', hora = ''] = texto.split(' ')
  return { fecha, hora }
}

const casilla = (si: boolean) => (si ? MARCADO : VACIO)

const cargar = async (actuacionId: number) => {
  const a = await Actuacion.findByPk(actuacionId, {
    include: [
      {
        model: Caso, attributes: ['id', 'radicado', 'numeroInterno', 'tipoSolicitud', 'deOtroOperador', 'resumenHechos', 'derechosIds', 'derechosInvolucrados'],
        include: [{ model: Parte, attributes: ['rol', 'nombre'], required: false }, { model: Juzgado, attributes: ['nombre', 'correos'] }]
      },
      { model: Usuario, as: 'auxiliar', attributes: ['nombre'] },
      { model: Usuario, as: 'revisor', attributes: ['nombre'] }
    ]
  })
  if (!a?.caso) throw new ErrorNegocio('La actuación no existe', 404)
  return a
}

const accionantesDe = (caso: Caso) => (caso.partes ?? []).filter(p => p.rol === 'ACCIONANTE').map(p => p.nombre).join(', ')

// =====================================
// FICHA TÉCNICA DEL CASO
// Se genera al entregar (va siempre con el escrito) y a pedido desde el caso. Queda en la carpeta de la
// versión del escrito; si todavía no hay escrito, en Soportes
// =====================================
export const generarFicha = async (d: { actuacionId: number, escritoId?: number | null, fechaEntrega?: Date | null, entregados?: string[], usuarioId: number | null }) => {
  const a = await cargar(d.actuacionId)
  const caso = a.caso!
  const escrito = d.escritoId
    ? await Escrito.findByPk(d.escritoId)
    : await Escrito.findOne({ where: { actuacionId: a.id }, order: [['version', 'DESC']] })
  const [derechos, tipoRespuesta] = await Promise.all([
    caso.derechosIds.length ? ItemCatalogo.findAll({ where: { id: caso.derechosIds }, attributes: ['nombre'], order: [['orden', 'ASC']] }) : [],
    a.tipoRespuestaId ? ItemCatalogo.findByPk(a.tipoRespuestaId, { attributes: ['nombre'] }) : null
  ])
  const ahora = fechaYHora(new Date())
  const vence = fechaYHora(a.fechaVencimiento)
  const entregadoEl = d.fechaEntrega ?? escrito?.fechaEntregaEntidad ?? null
  const entrega = fechaYHora(entregadoEl)
  const version = escrito?.version ?? 1
  const entregados = d.entregados ?? (escrito ? [...escrito.documentosEntregados, ...escrito.anexosEntregados] : [])
  const valores: Record<string, string> = {
    fechaGeneracion: ahora.fecha, horaGeneracion: ahora.hora,
    numeroInterno: caso.numeroInterno ?? '', version: String(version),
    chk_CRITICO: casilla(a.criticidad === 'CRITICO'), chk_ALTO: casilla(a.criticidad === 'ALTO'), chk_ORDINARIO: casilla(a.criticidad === 'ORDINARIO'),
    chk_SUSPENDIDO_POR_INSUMOS: casilla(a.estado === 'EN_INSUMOS'), chk_DEVUELTO_POR_DUPLICIDAD: casilla(caso.deOtroOperador),
    radicado: formatoRadicado(caso.radicado), accionante: accionantesDe(caso),
    chk_ACCION_DE_TUTELA: casilla(caso.tipoSolicitud === 'TUTELA'), chk_ACCION_DE_CUMPLIMIENTO: casilla(caso.tipoSolicitud === 'ACCION_CUMPLIMIENTO'),
    despacho: caso.juzgado?.nombre ?? '',
    chk_CONTESTACION: casilla(a.etapa === 'ACCION'), chk_IMPUGNACION: casilla(a.etapa === 'IMPUGNACION'), chk_CUMPLIMIENTO: casilla(a.etapa === 'CUMPLIMIENTO'),
    chk_REQUERIMIENTO_PREVIO: casilla(a.etapa === 'REQUERIMIENTO_PREVIO'), chk_DESACATO: casilla(a.etapa === 'DESACATO'),
    derechos: derechos.length ? derechos.map(x => x.nombre).join(', ') : caso.derechosInvolucrados ?? '',
    tipoRespuesta: tipoRespuesta?.nombre ?? '',
    hechos: caso.resumenHechos ?? '',
    fechaVencimiento: vence.fecha, horaVencimiento: vence.hora, tiempoRestante: tiempoRestante(a.fechaVencimiento),
    chk_V1: casilla(version === 1), chk_V2: casilla(version > 1),
    fechaEntrega: entrega.fecha, horaEntrega: entrega.hora,
    anexos: entregados.join('\n'),
    elaboro: a.auxiliar?.nombre ?? '', reviso: a.revisor?.nombre ?? ''
  }
  const contenido = await llenarWord('ficha-tecnica', valores)
  const sub: Subcarpeta = escrito ? `Escritos/V${escrito.version}` : 'Soportes'
  return guardarEnExpediente({
    actuacionId: a.id, sub, nombre: `Ficha técnica ${caso.numeroInterno ?? ''} ${NOMBRES_ETAPAS[a.etapa]} V${version}.docx`.replace(/\s+/g, ' '),
    contenido, tipoMime: DOCX, tipo: escrito ? 'ANEXO' : 'SOPORTE', escritoId: escrito?.id ?? null, usuarioId: d.usuarioId
  })
}

// =====================================
// SOLICITUD DEL EXPEDIENTE DIGITAL AL DESPACHO (modelo 1.1)
// Borrador que se adjunta a la solicitud de datos faltantes: el cliente lo presenta al juzgado con su
// poder si lo necesita (la firma no le escribe al juzgado en nombre de la entidad, manual §4)
// =====================================
export const solicitudExpediente = async (actuacionId: number) => {
  const a = await cargar(actuacionId)
  const caso = a.caso!
  const valores: Record<string, string> = {
    juzgado: (caso.juzgado?.nombre ?? '').toUpperCase(),
    correoJuzgado: caso.juzgado?.correos?.[0] ?? 'Correo electrónico',
    radicado: formatoRadicado(caso.radicado),
    accionante: accionantesDe(caso),
    entidadCompleta: parametro<string>('ENTIDAD_NOMBRE_LEGAL') || '[ENTIDAD]',
    nitEntidad: parametro<string>('ENTIDAD_NIT') || '[NIT]',
    apoderado: parametro<string>('APODERADO_NOMBRE') || '[APODERADO]',
    ccApoderado: parametro<string>('APODERADO_CEDULA') || '[CÉDULA]',
    tpApoderado: parametro<string>('APODERADO_TARJETA') || '[T.P.]',
    correoApoderado: parametro<string>('APODERADO_CORREO') || '[CORREO]'
  }
  return {
    nombre: `Solicitud expediente digital ${caso.numeroInterno ?? ''}.docx`.replace(/\s+/g, ' '),
    tipoMime: DOCX,
    contenido: await llenarWord('solicitud-expediente', valores)
  }
}
