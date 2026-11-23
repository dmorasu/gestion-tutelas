import fs from 'fs/promises'
import { Op } from 'sequelize'
import path from 'path'
import JSZip from 'jszip'
import { Actuacion, Caso, Decision, Escrito, ItemCatalogo, Juzgado, Parte, Usuario } from '../models'
import { finDeDiasHabilesSiguientes } from './plazos'
import { guardarEnExpediente, type Subcarpeta } from './expediente'
import { parametro } from './parametros'
import { tiempoRestante } from './buzon/correosSalida'
import { NOMBRES_ETAPAS, reglaEmergencia } from './constantes'
import { formatoRadicado } from '../utils/radicado'
import { enBogota, textoFechaHora } from '../utils/fechaColombia'
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

// Los modelos de emergencia los entrega la firma: hasta que estén, la app avisa en vez de fallar
export const existePlantilla = (plantilla: string) => fs.access(path.join(CARPETA, `${plantilla}.docx`)).then(() => true, () => false)

export const llenarWord = async (plantilla: string, valores: Record<string, string>) => {
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
        model: Caso, attributes: ['id', 'radicado', 'numeroInterno', 'tipoSolicitud', 'deOtroOperador', 'resumenHechos', 'derechosIds', 'derechosInvolucrados', 'calidadEntidad'],
        include: [{ model: Parte, attributes: ['rol', 'nombre'], required: false }, { model: Juzgado, attributes: ['nombre', 'correos', 'ciudad'] }]
      },
      { model: Usuario, as: 'auxiliar', attributes: ['nombre'] },
      { model: Usuario, as: 'revisor', attributes: ['nombre'] }
    ]
  })
  if (!a?.caso) throw new ErrorNegocio('La actuación no existe', 404)
  return a
}

const accionantesDe = (caso: Caso) => (caso.partes ?? []).filter(p => p.rol === 'ACCIONANTE').map(p => p.nombre).join(', ')

// La versión dentro de su clase: la emergencia y su alcance son escritos distintos, y cada uno tiene su
// V1 y, si la entidad lo devuelve, su V2 (el número de la tabla sigue corriendo para toda la actuación)
export const versionDeClase = async (escrito: Escrito) =>
  Escrito.count({ where: { actuacionId: escrito.actuacionId, clase: escrito.clase, version: { [Op.lte]: escrito.version } } })

// Derechos y petición del caso en texto, como van en la ficha y en los escritos
const derechosYPeticion = async (a: Actuacion) => {
  const caso = a.caso!
  const [derechos, peticiones] = await Promise.all([
    caso.derechosIds.length ? ItemCatalogo.findAll({ where: { id: caso.derechosIds }, attributes: ['nombre'], order: [['orden', 'ASC']] }) : [],
    a.peticionIds.length ? ItemCatalogo.findAll({ where: { id: a.peticionIds }, attributes: ['nombre'], order: [['orden', 'ASC']] }) : []
  ])
  return {
    derechos: derechos.length ? derechos.map(x => x.nombre).join(', ') : caso.derechosInvolucrados ?? '',
    peticion: [...peticiones.map(x => x.nombre), a.loQueSePide?.trim()].filter(Boolean).join('\n')
  }
}

// =====================================
// FICHA TÉCNICA DEL CASO
// Se genera cuando el auxiliar envía el escrito a revisión (reunión del 23-nov: con los hechos, los
// derechos y la petición que registra ahí) y otra vez al entregar, con los datos de la entrega; también
// a pedido desde el caso. Queda en la carpeta de la versión del escrito; sin escrito, en Soportes
// =====================================
export const generarFicha = async (d: { actuacionId: number, escritoId?: number | null, fechaEntrega?: Date | null, entregados?: string[], usuarioId: number | null }) => {
  const a = await cargar(d.actuacionId)
  const caso = a.caso!
  const escrito = d.escritoId
    ? await Escrito.findByPk(d.escritoId)
    : await Escrito.findOne({ where: { actuacionId: a.id }, order: [['version', 'DESC']] })
  const [{ derechos, peticion }, tipoRespuesta] = await Promise.all([
    derechosYPeticion(a),
    a.tipoRespuestaId ? ItemCatalogo.findByPk(a.tipoRespuestaId, { attributes: ['nombre'] }) : null
  ])
  const ahora = fechaYHora(new Date())
  const vence = fechaYHora(a.fechaVencimiento)
  const entregadoEl = d.fechaEntrega ?? escrito?.fechaEntregaEntidad ?? null
  const entrega = fechaYHora(entregadoEl)
  // Lo que ve la entidad es la versión del escrito dentro de su clase (emergencia, alcance o el de la etapa)
  const version = escrito ? await versionDeClase(escrito) : 1
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
    derechos,
    tipoRespuesta: escrito?.clase === 'EMERGENCIA' ? 'Escrito de emergencia' : escrito?.clase === 'ALCANCE' ? `${reglaEmergencia(caso.tipoSolicitud, a.etapa)?.alcance ?? 'Alcance'}${tipoRespuesta ? ` · ${tipoRespuesta.nombre}` : ''}` : tipoRespuesta?.nombre ?? '',
    hechos: caso.resumenHechos ?? '',
    peticion,
    fechaVencimiento: vence.fecha, horaVencimiento: vence.hora, tiempoRestante: tiempoRestante(a.fechaVencimiento),
    chk_V1: casilla(version === 1), chk_V2: casilla(version > 1),
    fechaEntrega: entrega.fecha, horaEntrega: entrega.hora,
    anexos: entregados.join('\n'),
    elaboro: a.auxiliar?.nombre ?? '', reviso: a.revisor?.nombre ?? ''
  }
  const contenido = await llenarWord('ficha-tecnica', valores)
  const sub: Subcarpeta = escrito ? `Escritos/V${escrito.version}` : 'Soportes'
  const clase = escrito?.clase === 'EMERGENCIA' ? ' emergencia' : escrito?.clase === 'ALCANCE' ? ' alcance' : ''
  // La de la revisión se reemplaza con la de la entrega: en el paquete queda una sola ficha
  return guardarEnExpediente({
    actuacionId: a.id, sub, nombre: `Ficha técnica ${caso.numeroInterno ?? ''} ${NOMBRES_ETAPAS[a.etapa]}${clase} V${version}.docx`.replace(/\s+/g, ' '),
    contenido, tipoMime: DOCX, tipo: escrito ? 'ANEXO' : 'SOPORTE', escritoId: escrito?.id ?? null, usuarioId: d.usuarioId, reemplazar: true
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

// =====================================
// ESCRITO DE EMERGENCIA (reunión del 23-nov)
// Se arma con el modelo de la firma para la etapa y el tipo de acción (constantes: reglaEmergencia),
// preparado desde Docs/formatos con Docs/herramientas/plantillas-word.ts. Los marcadores son los de
// valoresEscrito; lo que el modelo deja entre corchetes (la orden del fallo, las gestiones…) lo
// completa el auxiliar en el Word antes de enviarlo a revisión
// =====================================
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// "23 de noviembre de 2026" a partir de un día AAAA-MM-DD
const fechaLarga = (dia: string) => {
  const [anio, mes, d] = dia.split('-').map(Number)
  return `${d} de ${MESES[mes - 1]} de ${anio}`
}

// Lo que la app no sabe queda a la vista para que el auxiliar lo complete en el Word
const completar = (que: string) => `[completar: ${que}]`

// El fallo que se cumple: el último de la instancia más alta del caso
const falloDelCaso = async (casoId: number) => {
  const actuaciones = await Actuacion.findAll({ where: { casoId }, attributes: ['id'] })
  const fallos = await Decision.findAll({ where: { actuacionId: actuaciones.map(x => x.id), instancia: ['PRIMERA', 'SEGUNDA'] }, order: [['createdAt', 'DESC']] })
  return fallos.find(f => f.instancia === 'SEGUNDA') ?? fallos[0] ?? null
}

const valoresEscrito = async (a: Actuacion): Promise<Record<string, string>> => {
  const caso = a.caso!
  const { derechos, peticion } = await derechosYPeticion(a)
  const fallo = await falloDelCaso(caso.id)
  const dias = parametro<number>('DIAS_TERMINO_EMERGENCIA') || 5
  const legal = parametro<string>('ENTIDAD_NOMBRE_LEGAL') || '[ENTIDAD]'
  const corta = parametro<string>('ENTIDAD_NOMBRE') || 'la entidad'
  return {
    fecha: fechaLarga(enBogota(new Date()).dia),
    entidadMayus: legal.toUpperCase(),
    entidad: corta,
    Entidad: corta.charAt(0).toUpperCase() + corta.slice(1),
    ciudad: caso.juzgado?.ciudad ?? '',
    fechaFallo: fallo?.fechaDecision ? fechaLarga(fallo.fechaDecision) : completar('fecha del fallo'),
    // La fecha del auto no se registra en la app; la de notificación es la de la actuación
    fechaAuto: completar('fecha del auto'),
    fechaNotificacion: a.fechaNotificacion ? fechaLarga(enBogota(a.fechaNotificacion).dia) : completar('fecha de notificación'),
    diasTermino: String(dias),
    // Hasta cuándo va el término pedido, contado en días hábiles desde hoy
    fechaTermino: fechaLarga(enBogota(finDeDiasHabilesSiguientes(new Date(), dias)).dia),
    direccionEntidad: parametro<string>('ENTIDAD_DIRECCION_NOTIFICACIONES') || completar('dirección de notificaciones de la entidad'),
    correoEntidad: parametro<string>('ENTIDAD_CORREO_NOTIFICACIONES') || completar('correo de notificaciones judiciales de la entidad'),
    numeroInterno: caso.numeroInterno ?? '',
    juzgado: (caso.juzgado?.nombre ?? '').toUpperCase(),
    correoJuzgado: caso.juzgado?.correos?.[0] ?? '',
    radicado: formatoRadicado(caso.radicado),
    accionante: accionantesDe(caso),
    calidadEntidad: (caso.calidadEntidad ?? '').toLowerCase(),
    entidadCompleta: legal,
    nitEntidad: parametro<string>('ENTIDAD_NIT') || '[NIT]',
    apoderado: parametro<string>('APODERADO_NOMBRE') || '[APODERADO]',
    ccApoderado: parametro<string>('APODERADO_CEDULA') || '[CÉDULA]',
    tpApoderado: parametro<string>('APODERADO_TARJETA') || '[T.P.]',
    correoApoderado: parametro<string>('APODERADO_CORREO') || '[CORREO]',
    hechos: caso.resumenHechos ?? '',
    // Va dentro de la frase ("el derecho fundamental de debido proceso"): en minúscula
    derechos: derechos.toLowerCase() || completar('derecho fundamental'),
    peticion
  }
}

export const escritoEmergencia = async (d: { actuacionId: number, escrito: Escrito }) => {
  const a = await cargar(d.actuacionId)
  const regla = reglaEmergencia(a.caso!.tipoSolicitud, a.etapa)
  if (!regla) throw new ErrorNegocio('Esta etapa no tiene escrito de emergencia')
  if (!(await existePlantilla(regla.plantilla))) throw new ErrorNegocio(`Falta el modelo del ${regla.escrito.toLowerCase()}: cárguelo en backend/recursos/plantillas (${regla.plantilla}.docx)`)
  const version = await versionDeClase(d.escrito)
  return {
    nombre: `${regla.escrito} ${a.caso!.numeroInterno ?? ''} V${version}.docx`.replace(/\s+/g, ' '),
    tipoMime: DOCX,
    contenido: await llenarWord(regla.plantilla, await valoresEscrito(a))
  }
}
