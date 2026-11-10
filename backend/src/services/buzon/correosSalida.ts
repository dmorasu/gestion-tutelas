import { Actuacion, Caso, Correo, PlantillaCorreo, Usuario } from '../../models'
import { entraConfigurado } from '../../config/entra'
import { enviarCorreo, direccionBuzon } from './graph'
import { armarCorreoHtml, logoDataUri, logoIncrustado, CID_LOGO } from './disenoCorreo'
import { parametro } from '../parametros'
import { ETAPA_EN_ASUNTO, NOMBRES_CRITICIDAD, NOMBRES_ETAPAS, PLANTILLAS, type Buzon, type CodigoPlantilla } from '../constantes'
import { textoFechaHora } from '../../utils/fechaColombia'
import { formatoRadicado } from '../../utils/radicado'
import { ErrorNegocio } from '../../utils/errores'

// =====================================
// CORREOS DE SALIDA CON PLANTILLA
// Cada correo sale del buzón de su función (asignaciones, insumos, entregas) con el asunto
// normalizado del cliente y el diseño corporativo (disenoCorreo.ts). Se guarda como correo SALIENTE
// del caso: su hilo (conversationId) empareja después la respuesta. El asunto lleva también el
// número interno del caso: si el cliente responde en otro hilo, el número lo identifica.
// Sin 365 configurado o con CORREO_ENVIO_ACTIVO distinto de "true", el correo queda SIMULADO:
// se registra igual (sirve para probar el flujo) pero no sale.
// =====================================

// Borradores de la firma mientras llegan las plantillas del cliente ("PENDIENTE ENVÍO DE PLANTILLAS")
const ASUNTO_BASE = '[{{prefijo}}] [{{criticidad}}] [{{radicado}}]'
const FIRMA = 'Cordialmente,\nEquipo de apoyo jurídico'
export const PLANTILLAS_BASE: Record<CodigoPlantilla, { asunto: string, cuerpo: string }> = {
  ACUSE_ASIGNACION: {
    asunto: `${ASUNTO_BASE} [{{actuacion}}] [Vence: {{vence}}] RECIBIDO - Caso {{numeroInterno}}`,
    cuerpo: `Buen día.\n\nConfirmamos el recibido de la asignación, que quedó registrada con el número interno de caso {{numeroInterno}}. Le agradecemos citar este número o el radicado en las comunicaciones del caso.\n\nFecha y hora de recibido: {{fechaAsignacion}}.\n\n${FIRMA}`
  },
  ACUSE_PAQUETE: {
    asunto: '[{{prefijo}}] [ASIGNACIÓN EN PAQUETE] RECIBIDO - {{cantidad}} casos',
    cuerpo: `Buen día.\n\nConfirmamos el recibido de {{cantidad}} asignaciones. Cada radicado quedó con su número interno de caso:\n\n{{detalle}}\n\n${FIRMA}`
  },
  SOLICITUD_DATOS_FALTANTES: {
    asunto: `${ASUNTO_BASE} [DATOS FALTANTES] [Vence: {{vence}}] Caso {{numeroInterno}}`,
    cuerpo: `Buen día.\n\nPara gestionar este caso solicitamos la siguiente información:\n\n{{detalle}}\n\n${FIRMA}`
  },
  ACUSE_DATOS_FALTANTES: {
    asunto: `${ASUNTO_BASE} [RECIBIDO DATOS FALTANTES] [Vence: {{vence}}] Caso {{numeroInterno}}`,
    cuerpo: `Buen día.\n\nConfirmamos el recibido de la información faltante de este caso.\n\n${FIRMA}`
  },
  SOLICITUD_INSUMOS: {
    asunto: `${ASUNTO_BASE} [SOLICITUD DE INSUMOS] [Vence: {{vence}}] Caso {{numeroInterno}}`,
    cuerpo: `Buen día.\n\nPara proyectar el escrito de este caso solicitamos los siguientes insumos, a más tardar el {{vence}}:\n\n{{detalle}}\n\nPor favor responda en este mismo correo o indique el número de caso {{numeroInterno}} para que los insumos queden en el expediente.\n\n${FIRMA}`
  },
  ACUSE_INSUMOS: {
    asunto: `${ASUNTO_BASE} [RECIBIDO INSUMOS] [Vence: {{vence}}] Caso {{numeroInterno}}`,
    cuerpo: `Buen día.\n\nConfirmamos el recibido de los insumos de este caso.\n\n${FIRMA}`
  },
  ENTREGA_V1: {
    asunto: `${ASUNTO_BASE} [ENTREGA V1] [Vence: {{vence}}] Caso {{numeroInterno}}`,
    cuerpo: `Buen día.\n\nEntregamos el proyecto de escrito de este caso con sus anexos. Están en la carpeta del enlace.\n\nElaboró: {{auxiliar}}. Revisó: {{revisor}}.\n\n${FIRMA}`
  },
  ENTREGA_V2: {
    asunto: `${ASUNTO_BASE} [ENTREGA V{{version}}] [Vence: {{vence}}] Caso {{numeroInterno}}`,
    cuerpo: `Buen día.\n\nEntregamos el escrito de este caso ajustado según la devolución, con sus anexos. Están en la carpeta del enlace.\n\nElaboró: {{auxiliar}}. Revisó: {{revisor}}.\n\n${FIRMA}`
  }
}

// Borradores anteriores (sin el número de caso en el asunto): si una plantilla sigue siendo uno de
// ellos y nadie la editó, se actualiza sola al borrador nuevo
const ASUNTOS_ANTERIORES = [/\[Vence: \{\{vence\}\}\]$/, /RECIBIDO - Caso \{\{numeroInterno\}\}$/, /^\[\{\{prefijo\}\}\] \[ASIGNACIÓN EN PAQUETE\]/]

export const MARCADORES = ['prefijo', 'criticidad', 'radicado', 'radicadoFormato', 'numeroInterno', 'actuacion', 'etapa', 'vence', 'fechaAsignacion', 'auxiliar', 'revisor', 'enlace', 'detalle', 'version', 'cantidad'] as const

// Inserta las que falten y actualiza las que siguen siendo el borrador de la firma sin tocar
export const sembrarPlantillas = async () => {
  for (const [codigo, base] of Object.entries(PLANTILLAS_BASE)) {
    const [fila, creada] = await PlantillaCorreo.findOrCreate({ where: { codigo }, defaults: { codigo, ...base } })
    const sinEditar = fila.updatedAt.getTime() === fila.createdAt.getTime() && !fila.confirmada
    if (!creada && sinEditar && fila.cuerpo !== base.cuerpo && ASUNTOS_ANTERIORES.some(re => re.test(fila.asunto))) {
      await fila.update({ ...base })
      // Sigue contando como no editada (updatedAt = createdAt)
      await PlantillaCorreo.update({ updatedAt: fila.createdAt }, { where: { id: fila.id }, silent: true })
    }
  }
}

const escaparHtml = (texto: string) => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SIN_CORTE = new Set(['numeroInterno', 'radicado', 'radicadoFormato', 'vence', 'fechaAsignacion'])

const reemplazar = (texto: string, valores: Record<string, string>, html: boolean) =>
  texto.replace(/\{\{(\w+)\}\}/g, (todo, clave: string) => {
    if (!(clave in valores)) return todo
    const valor = valores[clave]
    if (!html) return valor
    // Los enlaces quedan clicables; los números de caso y radicados no se parten en dos líneas
    if (/^https?:\/\/\S+$/.test(valor)) return `<a href="${escaparHtml(valor)}" style="color:#1e293b;">${escaparHtml(valor)}</a>`
    if (SIN_CORTE.has(clave)) return `<span style="white-space:nowrap;">${escaparHtml(valor)}</span>`
    return escaparHtml(valor)
  })

// Texto de la plantilla → párrafos HTML. Un bloque de líneas "1. …" o "- …" queda como lista
const aHtml = (texto: string) =>
  texto.split(/\n{2,}/).map(p => {
    const lineas = p.split('\n')
    const item = /^\s*(\d+[.)]|[-•])\s+/
    if (lineas.length > 1 && lineas.every(l => item.test(l))) {
      return `<ul style="margin:0 0 14px 0;padding-left:20px;">${lineas.map(l => `<li style="margin:0 0 4px 0;">${l.replace(item, '')}</li>`).join('')}</ul>`
    }
    return `<p style="margin:0 0 14px 0;">${lineas.join('<br>')}</p>`
  }).join('\n')

const NOMBRE_BUZON: Record<Buzon, string> = { ASIGNACIONES: 'asignaciones', INSUMOS: 'insumos', ENTREGAS: 'entregas' }

export type BasePlantilla = { asunto: string, cuerpo: string, titulo?: string | null }

// Asunto, texto plano (se guarda en el caso) y HTML corporativo de una plantilla con sus valores
export const renderizar = (codigo: CodigoPlantilla, base: BasePlantilla, valores: Record<string, string>, conFicha: boolean, logoSrc: string) => {
  const asunto = reemplazar(base.asunto, valores, false).replace(/\s+/g, ' ').trim()
  const texto = reemplazar(base.cuerpo, valores, false)
  const ficha = conFicha
    ? [
        { etiqueta: 'Caso', valor: valores.numeroInterno },
        { etiqueta: 'Radicado', valor: valores.radicadoFormato },
        { etiqueta: 'Actuación', valor: valores.etapa },
        { etiqueta: 'Criticidad', valor: valores.criticidad },
        { etiqueta: 'Vence', valor: valores.vence }
      ].filter(f => f.valor)
    : null
  const enlace = valores.enlace ?? ''
  const html = armarCorreoHtml({
    titulo: reemplazar(base.titulo || PLANTILLAS[codigo].titulo, valores, false),
    cuerpoHtml: aHtml(reemplazar(base.cuerpo, valores, true)),
    ficha,
    criticidad: conFicha ? valores.criticidad : null,
    boton: /^https?:\/\//.test(enlace) ? { texto: 'Abrir el escrito y sus anexos', url: enlace } : null,
    buzon: NOMBRE_BUZON[PLANTILLAS[codigo].buzon],
    logoSrc
  })
  return { asunto, texto, html }
}

// Valores de muestra para la vista previa y la prueba de la administración
const ejemplo = (codigo: CodigoPlantilla): Record<string, string> => ({
  prefijo: parametro<string>('PREFIJO_ASUNTO'),
  criticidad: 'ALTO', radicado: '76001310300120260012300', radicadoFormato: '76001-31-03-001-2026-00123-00', numeroInterno: 'GPA-2026-00123',
  actuacion: 'TUTELA', etapa: 'Contestación', vence: '20/11/2026 17:00', fechaAsignacion: '17/11/2026 09:12', auxiliar: 'Laura Gómez',
  revisor: 'Andrés Rojas', version: '2', cantidad: '3',
  // Solo las entregas llevan enlace (y con él, el botón)
  enlace: codigo.startsWith('ENTREGA') ? 'https://ejemplo.sharepoint.com/sites/Tutelas/Casos/GPA-2026-00123' : '',
  detalle: codigo === 'ACUSE_PAQUETE'
    ? '- 76001-31-03-001-2026-00123-00 → GPA-2026-00123\n- 76001-31-03-001-2026-00124-00 → GPA-2026-00124\n- 76001-31-03-001-2026-00125-00 → GPA-2026-00125'
    : '1. Historial de comparendos del accionante\n2. Guía de notificación del comparendo\n3. Estado de cuenta actualizado'
})

export const vistaPrevia = (codigo: CodigoPlantilla, base: BasePlantilla) =>
  renderizar(codigo, base, ejemplo(codigo), codigo !== 'ACUSE_PAQUETE', logoDataUri())

export const valoresDeActuacion = async (actuacionId: number, extra: Record<string, string> = {}) => {
  const a = await Actuacion.findByPk(actuacionId, {
    include: [
      { model: Caso, attributes: ['id', 'radicado', 'numeroInterno'] },
      { model: Usuario, as: 'auxiliar', attributes: ['nombre'] },
      { model: Usuario, as: 'revisor', attributes: ['nombre'] }
    ]
  })
  if (!a || !a.caso) throw new ErrorNegocio('La actuación no existe', 404)
  const valores: Record<string, string> = {
    prefijo: parametro<string>('PREFIJO_ASUNTO'),
    criticidad: NOMBRES_CRITICIDAD[a.criticidad] ?? a.criticidad,
    radicado: a.caso.radicado,
    radicadoFormato: formatoRadicado(a.caso.radicado),
    numeroInterno: a.caso.numeroInterno ?? '',
    actuacion: ETAPA_EN_ASUNTO[a.etapa],
    etapa: NOMBRES_ETAPAS[a.etapa],
    vence: a.fechaVencimiento ? textoFechaHora(a.fechaVencimiento) : 'sin fecha',
    fechaAsignacion: textoFechaHora(a.fechaAsignacion),
    auxiliar: a.auxiliar?.nombre ?? '',
    revisor: a.revisor?.nombre ?? '',
    enlace: '',
    detalle: '',
    version: '1',
    ...extra
  }
  return { actuacion: a, valores }
}

export const modoEnvio = () => (entraConfigurado() && process.env.CORREO_ENVIO_ACTIVO === 'true' ? 'REAL' : 'SIMULADO')

export type DatosEnvio = {
  codigo: CodigoPlantilla
  // Sin actuación (acuse de un paquete de asignaciones): solo los marcadores de "extra"
  actuacionId: number | null
  para: string[]
  cc?: string[]
  // Correo (id en la app) al que se responde: el envío queda en su mismo hilo
  responderACorreoId?: number | null
  extra?: Record<string, string>
  usuarioId: number | null
}

const plantillaVigente = async (codigo: CodigoPlantilla): Promise<BasePlantilla> =>
  (await PlantillaCorreo.findOne({ where: { codigo } })) ?? PLANTILLAS_BASE[codigo]

export const enviarPlantilla = async (d: DatosEnvio) => {
  const buzon = PLANTILLAS[d.codigo].buzon
  const para = [...new Set(d.para.map(c => c.trim().toLowerCase()).filter(Boolean))]
  if (!para.length) throw new ErrorNegocio(`No hay destinatarios para "${PLANTILLAS[d.codigo].nombre}"`)
  const base = await plantillaVigente(d.codigo)
  const { actuacion, valores } = d.actuacionId
    ? await valoresDeActuacion(d.actuacionId, d.extra)
    : { actuacion: null, valores: { prefijo: parametro<string>('PREFIJO_ASUNTO'), ...d.extra } as Record<string, string> }
  const { asunto, texto, html } = renderizar(d.codigo, base, valores, !!actuacion, `cid:${CID_LOGO}`)
  const original = d.responderACorreoId ? await Correo.findByPk(d.responderACorreoId, { attributes: ['graphId', 'conversationId', 'buzon'] }) : null

  const registro = {
    direccion: 'SALIENTE' as const,
    buzon,
    remitente: direccionBuzon(buzon),
    para,
    cc: d.cc ?? [],
    asunto,
    cuerpoTexto: texto,
    fechaCorreo: new Date(),
    radicados: valores.radicado ? [valores.radicado] : [],
    proposito: d.codigo,
    casoId: actuacion?.casoId ?? null,
    actuacionId: actuacion?.id ?? null,
    usuarioId: d.usuarioId
  }

  if (modoEnvio() === 'SIMULADO') {
    return Correo.create({ ...registro, estado: 'SIMULADO', conversationId: original?.conversationId ?? null })
  }
  try {
    // Solo se responde en el hilo si el original entró por el mismo buzón (Graph exige su id allí)
    const responderA = original?.graphId && original.buzon === buzon ? original.graphId : undefined
    const logo = logoIncrustado()
    const enviado = await enviarCorreo(buzon, { para, cc: d.cc, asunto, html, responderA, adjuntos: logo ? [logo] : [] })
    return Correo.create({ ...registro, estado: 'ENVIADO', graphId: enviado.graphId, conversationId: enviado.conversationId, fechaCorreo: enviado.enviadoEn })
  } catch (error) {
    // Queda el registro con el error para reintentar desde el caso: no se pierde el intento
    return Correo.create({ ...registro, estado: 'ERROR', error: String(error instanceof Error ? error.message : error).slice(0, 2000) })
  }
}

// Prueba de una plantilla con los datos de ejemplo, enviada a quien la está editando. No se
// registra en ningún caso. Solo con el envío real encendido
export const enviarPrueba = async (codigo: CodigoPlantilla, base: BasePlantilla, para: string) => {
  if (modoEnvio() !== 'REAL') throw new ErrorNegocio('El envío real está apagado (CORREO_ENVIO_ACTIVO): use la vista previa')
  const { asunto, html } = renderizar(codigo, base, ejemplo(codigo), codigo !== 'ACUSE_PAQUETE', `cid:${CID_LOGO}`)
  const logo = logoIncrustado()
  await enviarCorreo(PLANTILLAS[codigo].buzon, { para: [para], asunto: `[PRUEBA] ${asunto}`, html, adjuntos: logo ? [logo] : [] })
}
