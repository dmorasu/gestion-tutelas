import { Actuacion, Caso, Correo, PlantillaCorreo, Usuario, Parte, Juzgado, ItemCatalogo } from '../../models'
import { entraConfigurado } from '../../config/entra'
import { enviarCorreo, direccionBuzon } from './graph'
import { armarCorreoHtml, logoDataUri, logoIncrustado, CID_LOGO } from './disenoCorreo'
import { parametro } from '../parametros'
import { NOMBRES_CRITICIDAD, NOMBRES_ETAPAS, PLANTILLAS, type Buzon, type CodigoPlantilla } from '../constantes'
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

// =====================================
// TEXTOS DE LOS MODELOS DE LA FIRMA (Docs/insumos, reunión 18-nov)
// Asunto: CRITICIDAD - RAD. radicado - ACTUACIÓN - vence - TIPO DE CORREO. Si el parámetro
// PREFIJO_ASUNTO tiene valor (el cliente pidió uno), va adelante. {{ficha}} marca dónde va el bloque de
// datos del caso (estado, radicado, número interno, accionante, despacho, actuación y vencimiento)
// =====================================
const ASUNTO_BASE = '{{prefijoAsunto}}{{criticidad}} - RAD. {{radicado}} - {{actuacion}} - {{vence}}'
const FIRMA = 'Atentamente,\nEquipo GPA LEGAL.'
export const PLANTILLAS_BASE: Record<CodigoPlantilla, { asunto: string, cuerpo: string }> = {
  ACUSE_ASIGNACION: {
    asunto: `${ASUNTO_BASE} - CONFIRMACIÓN ASIGNACIÓN`,
    cuerpo: `Cordial saludo,\n\nPor medio del presente correo, GPA LEGAL confirma la recepción de la asignación de la actuación {{actuacion}} de la acción {{tipoAccion}} correspondiente al siguiente proceso:\n\n{{ficha}}\n\nEn caso de requerirse información o documentación adicional para estructurar el respectivo escrito, se efectuará oportunamente la solicitud.\n\n${FIRMA}`
  },
  ACUSE_PAQUETE: {
    asunto: '{{prefijoAsunto}}{{cantidad}} ASIGNACIONES - CONFIRMACIÓN ASIGNACIÓN',
    cuerpo: `Cordial saludo,\n\nPor medio del presente correo, GPA LEGAL confirma la recepción de {{cantidad}} asignaciones. Cada radicado quedó con su radicado interno:\n\n{{detalle}}\n\nEn caso de requerirse información o documentación adicional para estructurar los respectivos escritos, se efectuará oportunamente la solicitud.\n\n${FIRMA}`
  },
  SOLICITUD_DATOS_FALTANTES: {
    asunto: `${ASUNTO_BASE} - SOLICITUD DATOS FALTANTES`,
    cuerpo: `Cordial saludo.\n\nUna vez revisada la documentación remitida respecto de la acción constitucional de la referencia, evidenciamos que no se cuenta con la totalidad de los documentos o la información necesarios para efectuar la revisión y elaborar el escrito correspondiente.\n\n{{ficha}}\n\nEn consecuencia, agradecemos remitir, según corresponda, los siguientes documentos faltantes:\n\n{{detalle}}\n\n{{notaExpediente}}\n\nAgradecemos remitir lo solicitado lo antes posible, con el fin de contar con los elementos necesarios para efectuar el análisis del caso y preparar oportunamente el escrito correspondiente.\n\n${FIRMA}`
  },
  ACUSE_DATOS_FALTANTES: {
    asunto: `${ASUNTO_BASE} - CONFIRMACIÓN RECIBIDO INFORMACIÓN FALTANTE`,
    cuerpo: `Cordial saludo,\n\nPor medio del presente correo, GPA LEGAL confirma la recepción de la información y/o documentación remitida para complementar el expediente de la acción constitucional de la referencia, conforme a los siguientes datos:\n\n{{ficha}}\n\nInformación y/o documentos recibidos:\n\n{{detalle}}\n\nLa documentación recibida será incorporada al expediente interno y tenida en cuenta para continuar con el análisis y la elaboración del escrito correspondiente.\n\n${FIRMA}`
  },
  SOLICITUD_INSUMOS: {
    asunto: `${ASUNTO_BASE} - SOLICITUD DE INSUMOS`,
    cuerpo: `Cordial saludo.\n\nCon el fin de proyectar el escrito que corresponde a la acción constitucional citada en el asunto, se requiere que en el menor tiempo posible se remitan por este medio los insumos necesarios.\n\n{{ficha}}\n\nEn este caso, la parte actora interpuso acción constitucional en contra de {{entidad}}, por la presunta vulneración del derecho fundamental de {{derechos}}, considerando que {{hechos}}\n\nEn ese sentido, agradecemos enviarnos a más tardar el {{venceInsumos}} la información y los documentos que seguidamente se solicitan:\n\n{{detalle}}\n\nEn caso de no contar con la información o los insumos solicitados, por favor indicarnos el motivo y los argumentos necesarios para gestionar en debida forma el escrito requerido para el envío por su parte al Juzgado.\n\n${FIRMA}`
  },
  ACUSE_INSUMOS: {
    asunto: `${ASUNTO_BASE} - CONFIRMACIÓN RECIBIDO DE INSUMOS`,
    cuerpo: `Cordial saludo.\n\nPor medio del presente correo, GPA LEGAL confirma la recepción de los insumos remitidos por {{entidad}} para la atención de la acción constitucional citada en el asunto, conforme a la siguiente información:\n\n{{ficha}}\n\nInsumos recibidos:\n\n{{detalle}}\n\nLos insumos recibidos serán incorporados al expediente interno y revisados para continuar con la elaboración del escrito correspondiente dentro del término señalado. En caso de haber faltantes, le solicitamos remitirlos en el menor tiempo posible.\n\n${FIRMA}`
  },
  ENTREGA_V1: {
    asunto: `${ASUNTO_BASE} - ENTREGA V1`,
    cuerpo: `Cordial saludo.\n\nPor medio del presente correo, GPA LEGAL hace entrega del escrito elaborado para atender la actuación constitucional de la referencia, conforme a la siguiente información extraída de la ficha técnica:\n\n{{ficha}}\n\nDocumentos entregados:\n\n{{documentos}}\n\nAnexos:\n\n{{anexos}}\n\nEn la carpeta del enlace se encuentra el escrito correspondiente junto con la ficha técnica, los anexos y soportes que resultan aplicables, para su validación y posterior radicación ante el Despacho judicial.\n\n${FIRMA}`
  },
  ALERTA: {
    asunto: `${ASUNTO_BASE} - ALERTA: {{tipoAlerta}}`,
    cuerpo: `Cordial saludo.\n\nPor medio del presente correo, GPA LEGAL informa la siguiente alerta sobre la actuación constitucional de la referencia:\n\n{{ficha}}\n\n{{detalle}}\n\nQuedamos atentos.\n\n${FIRMA}`
  },
  ALERTAS_CORTE: {
    asunto: '{{prefijoAsunto}}{{cantidad}} ALERTAS - CORTE {{fechaCorte}}',
    cuerpo: `Cordial saludo.\n\nPor medio del presente correo, GPA LEGAL informa las alertas generadas en el corte del {{fechaCorte}} sobre las actuaciones constitucionales a cargo:\n\n{{detalle}}\n\nQuedamos atentos.\n\n${FIRMA}`
  },
  ENTREGA_V2: {
    asunto: `${ASUNTO_BASE} - ENTREGA V{{version}}`,
    cuerpo: `Cordial saludo.\n\nPor medio del presente correo, GPA LEGAL hace entrega del escrito ajustado, de acuerdo con su devolución, para atender la actuación constitucional de la referencia, conforme a la siguiente información extraída de la ficha técnica:\n\n{{ficha}}\n\nDocumentos entregados:\n\n{{documentos}}\n\nAnexos:\n\n{{anexos}}\n\nEn la carpeta del enlace se encuentra el escrito correspondiente junto con la ficha técnica, los anexos y soportes que resultan aplicables, para su validación y posterior radicación ante el Despacho judicial.\n\nAgradecemos confirmar la recepción de la presente documentación.\n\n${FIRMA}`
  }
}

export const MARCADORES = [
  'prefijo', 'prefijoAsunto', 'criticidad', 'estado', 'radicado', 'radicadoFormato', 'numeroInterno', 'accionante', 'despacho', 'actuacion', 'etapa', 'tipoAccion',
  'vence', 'tiempoRestante', 'venceInsumos', 'fechaAsignacion', 'entidad', 'derechos', 'hechos', 'auxiliar', 'revisor', 'enlace', 'detalle', 'documentos', 'anexos',
  'version', 'fechaEntrega', 'cantidad', 'tipoAlerta', 'fechaCorte', 'notaExpediente', 'ficha'
] as const

// Inserta las que falten y pasa al texto vigente las que siguen siendo el borrador de la firma: las que
// nadie guardó desde la pantalla (editada) ni confirmó. Así llegan los modelos nuevos sin pisar lo ajustado.
// Antes se comparaban las fechas de creación y modificación, pero la fecha no se podía devolver (un
// update "silent" no escribe updatedAt) y ningún borrador se volvía a actualizar
export const sembrarPlantillas = async () => {
  for (const [codigo, base] of Object.entries(PLANTILLAS_BASE)) {
    const [fila, creada] = await PlantillaCorreo.findOrCreate({ where: { codigo }, defaults: { codigo, ...base } })
    if (!creada && !fila.editada && !fila.confirmada && (fila.cuerpo !== base.cuerpo || fila.asunto !== base.asunto)) await fila.update({ ...base })
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
  texto.split(/\n{2,}/).filter(p => p.trim()).map(p => {
    const lineas = p.split('\n')
    const item = /^\s*(\d+[.)]|[-•])\s+/
    if (lineas.length > 1 && lineas.every(l => item.test(l))) {
      return `<ul style="margin:0 0 14px 0;padding-left:20px;">${lineas.map(l => `<li style="margin:0 0 4px 0;">${l.replace(item, '')}</li>`).join('')}</ul>`
    }
    return `<p style="margin:0 0 14px 0;">${lineas.join('<br>')}</p>`
  }).join('\n')

const NOMBRE_BUZON: Record<Buzon, string> = { ASIGNACIONES: 'asignaciones', INSUMOS: 'insumos', ENTREGAS: 'entregas' }

export type BasePlantilla = { asunto: string, cuerpo: string, titulo?: string | null }

// Bloque de datos del caso del modelo de la firma; las entregas suman quién elaboró y revisó y la entrega
const fichaDe = (codigo: CodigoPlantilla, v: Record<string, string>) => {
  const filas = [
    { etiqueta: 'Estado', valor: v.estado || v.criticidad },
    { etiqueta: 'Radicado', valor: v.radicadoFormato },
    { etiqueta: 'Radicado interno', valor: v.numeroInterno },
    { etiqueta: 'Accionante', valor: v.accionante },
    { etiqueta: 'Despacho', valor: v.despacho },
    { etiqueta: 'Actuación', valor: v.etapa },
    { etiqueta: 'Fecha de vencimiento', valor: codigo.startsWith('ENTREGA') && v.tiempoRestante ? `${v.vence} (${v.tiempoRestante})` : v.vence }
  ]
  if (codigo.startsWith('ENTREGA')) {
    filas.push(
      { etiqueta: 'Elaboró', valor: v.auxiliar }, { etiqueta: 'Revisó', valor: v.revisor },
      { etiqueta: 'Entrega', valor: v.version ? `V${v.version}` : '' }, { etiqueta: 'Fecha y hora de entrega', valor: v.fechaEntrega }
    )
  }
  return filas.filter(f => f.valor)
}

// Asunto, texto plano (se guarda en el caso) y HTML corporativo de una plantilla con sus valores.
// El bloque de datos va donde la plantilla dice {{ficha}}; si no lo dice, antes del texto
export const renderizar = (codigo: CodigoPlantilla, base: BasePlantilla, valores: Record<string, string>, conFicha: boolean, logoSrc: string) => {
  const ficha = conFicha ? fichaDe(codigo, valores) : null
  const asunto = reemplazar(base.asunto, valores, false).replace(/\s+/g, ' ').trim()
  const textoFicha = (ficha ?? []).map(f => `${f.etiqueta}: ${f.valor}`).join('\n')
  const texto = reemplazar(base.cuerpo, { ...valores, ficha: textoFicha }, false)
  const [antes, despues] = base.cuerpo.includes('{{ficha}}') ? base.cuerpo.split('{{ficha}}', 2) : ['', base.cuerpo]
  const enlace = valores.enlace ?? ''
  const html = armarCorreoHtml({
    titulo: reemplazar(base.titulo || PLANTILLAS[codigo].titulo, valores, false),
    introHtml: antes.trim() ? aHtml(reemplazar(antes, valores, true)) : null,
    cuerpoHtml: aHtml(reemplazar(despues, valores, true)),
    ficha,
    criticidad: conFicha ? valores.criticidad : null,
    boton: /^https?:\/\//.test(enlace) ? { texto: 'Abrir el escrito y sus anexos', url: enlace } : null,
    buzon: NOMBRE_BUZON[PLANTILLAS[codigo].buzon],
    logoSrc
  })
  return { asunto, texto, html }
}

const prefijoAsunto = () => {
  const prefijo = (parametro<string>('PREFIJO_ASUNTO') ?? '').trim()
  return prefijo ? `${prefijo} - ` : ''
}
const nombreEntidad = () => (parametro<string>('ENTIDAD_NOMBRE') ?? '').trim() || 'la entidad'

// Frase del modelo de datos faltantes cuando va el borrador de solicitud del expediente (modelo 1.1)
export const NOTA_EXPEDIENTE = 'Adjunto se remite borrador de solicitud del expediente digital para presentar ante el Despacho, con su respectivo poder, en caso de requerirlo.'

// Plantillas que no son de un caso: no llevan el bloque de datos del caso
export const SIN_FICHA = new Set<CodigoPlantilla>(['ACUSE_PAQUETE', 'ALERTAS_CORTE'])

// Lista de ítems para el cuerpo ("- …", que el HTML vuelve viñetas)
export const listaCorreo = (items: string[], vacio = 'Ninguno.') => (items.length ? items.map(x => `- ${x}`).join('\n') : vacio)

// Valores de muestra para la vista previa y la prueba de la administración
const ejemplo = (codigo: CodigoPlantilla): Record<string, string> => ({
  prefijo: parametro<string>('PREFIJO_ASUNTO'), prefijoAsunto: prefijoAsunto(),
  criticidad: 'ALTO', estado: 'ALTO', radicado: '76001310300120260012300', radicadoFormato: '76001-31-03-001-2026-00123-00', numeroInterno: 'GPA-2026-00123',
  accionante: 'Nombre del accionante', despacho: 'Juzgado 1 Civil del Circuito', actuacion: 'CONTESTACIÓN', etapa: 'Contestación', tipoAccion: 'DE TUTELA',
  vence: '20/11/2026 17:00', tiempoRestante: '2 días', venceInsumos: '19/11/2026 15:00', fechaAsignacion: '17/11/2026 09:12', entidad: nombreEntidad(),
  derechos: 'petición', hechos: 'al parecer fue radicada una petición el 24 de septiembre de 2026, de la que el accionante manifiesta no haber recibido respuesta.',
  notaExpediente: NOTA_EXPEDIENTE,
  auxiliar: 'Laura Gómez', revisor: 'Andrés Rojas', version: codigo === 'ENTREGA_V2' ? '2' : '1', fechaEntrega: '19/11/2026 11:40', cantidad: '3', tipoAlerta: 'TÉRMINO PRÓXIMO A VENCER', fechaCorte: '19/11/2026 14:30',
  documentos: listaCorreo(['Ficha técnica del caso', 'Contestación de acción de tutela']), anexos: listaCorreo(['Comparendo', 'Constancia de notificación por aviso']),
  // Solo las entregas llevan enlace (y con él, el botón)
  enlace: codigo.startsWith('ENTREGA') ? 'https://ejemplo.sharepoint.com/sites/Tutelas/Casos/GPA-2026-00123' : '',
  detalle: codigo === 'ALERTA'
    ? 'El término de la contestación vence el 20/11/2026 17:00 y el escrito aún no se ha entregado.'
    : codigo === 'ALERTAS_CORTE'
    ? 'Término vencido sin entrega (1)\n\n- RAD. 76001-31-03-001-2026-00123-00 · GPA-2026-00123 · Nombre del accionante · Contestación · vence 19/11/2026 17:00: el término venció sin que se haya entregado el escrito.\n\nFalta de insumos (2)\n\n- RAD. 76001-31-03-001-2026-00124-00 · GPA-2026-00124 · Impugnación · vence 21/11/2026 17:00: no han llegado los insumos pedidos el 18/11/2026 10:00.\n- RAD. 76001-31-03-001-2026-00125-00 · GPA-2026-00125 · Contestación · vence 22/11/2026 17:00: no han llegado los insumos pedidos el 18/11/2026 11:20.'
    : codigo === 'ACUSE_PAQUETE'
    ? '- 76001-31-03-001-2026-00123-00 → GPA-2026-00123\n- 76001-31-03-001-2026-00124-00 → GPA-2026-00124\n- 76001-31-03-001-2026-00125-00 → GPA-2026-00125'
    : codigo === 'SOLICITUD_INSUMOS' || codigo === 'ACUSE_INSUMOS'
    ? listaCorreo(['Respuesta a Derecho de Petición y constancia de envío.', 'Validar la trazabilidad del derecho de petición en cuestión e informar las actuaciones realizadas y estado actual de su trámite.'])
    : listaCorreo(['Auto admisorio de la acción de tutela.', 'Escrito de tutela completo.'])
})

export const vistaPrevia = (codigo: CodigoPlantilla, base: BasePlantilla) =>
  renderizar(codigo, base, ejemplo(codigo), !SIN_FICHA.has(codigo), logoDataUri())

// Tiempo que falta para el vencimiento, como lo pide el modelo de entrega ("1 día y 3 horas")
export const tiempoRestante = (vence: Date | null) => {
  if (!vence) return ''
  const horas = Math.round((vence.getTime() - Date.now()) / 3_600_000)
  if (horas <= 0) return 'vencido'
  const dias = Math.floor(horas / 24)
  const resto = horas % 24
  return [dias && `${dias} día${dias === 1 ? '' : 's'}`, resto && `${resto} hora${resto === 1 ? '' : 's'}`].filter(Boolean).join(' y ')
}

export const valoresDeActuacion = async (actuacionId: number, extra: Record<string, string> = {}) => {
  const a = await Actuacion.findByPk(actuacionId, {
    include: [
      {
        model: Caso, attributes: ['id', 'radicado', 'numeroInterno', 'tipoSolicitud', 'deOtroOperador', 'resumenHechos', 'derechosIds', 'derechosInvolucrados', 'juzgadoId'],
        include: [{ model: Parte, attributes: ['rol', 'nombre'], required: false }, { model: Juzgado, attributes: ['nombre', 'correos'] }]
      },
      { model: Usuario, as: 'auxiliar', attributes: ['nombre'] },
      { model: Usuario, as: 'revisor', attributes: ['nombre'] }
    ]
  })
  if (!a || !a.caso) throw new ErrorNegocio('La actuación no existe', 404)
  const derechos = a.caso.derechosIds.length
    ? (await ItemCatalogo.findAll({ where: { id: a.caso.derechosIds }, attributes: ['nombre'], order: [['orden', 'ASC']] })).map(d => d.nombre.toLowerCase())
    : []
  const criticidad = NOMBRES_CRITICIDAD[a.criticidad] ?? a.criticidad
  // El estado del modelo: la criticidad o, si aplica, suspendido por insumos o devuelto por duplicidad
  const estado = a.caso.deOtroOperador ? 'DEVUELTO POR DUPLICIDAD' : a.estado === 'EN_INSUMOS' ? 'SUSPENDIDO POR INSUMOS' : criticidad
  const juzgado = a.caso.juzgado
  const valores: Record<string, string> = {
    prefijo: parametro<string>('PREFIJO_ASUNTO'),
    prefijoAsunto: prefijoAsunto(),
    criticidad,
    estado,
    radicado: a.caso.radicado,
    radicadoFormato: formatoRadicado(a.caso.radicado),
    numeroInterno: a.caso.numeroInterno ?? '',
    accionante: (a.caso.partes ?? []).filter(p => p.rol === 'ACCIONANTE').map(p => p.nombre).join(', '),
    despacho: juzgado ? [juzgado.nombre, juzgado.correos?.[0]].filter(Boolean).join(' · ') : '',
    actuacion: NOMBRES_ETAPAS[a.etapa].toUpperCase(),
    etapa: NOMBRES_ETAPAS[a.etapa],
    tipoAccion: a.caso.tipoSolicitud === 'ACCION_CUMPLIMIENTO' ? 'DE CUMPLIMIENTO' : a.caso.tipoSolicitud === 'PQRS' ? 'PQRS' : 'DE TUTELA',
    vence: a.fechaVencimiento ? textoFechaHora(a.fechaVencimiento) : 'sin fecha',
    tiempoRestante: tiempoRestante(a.fechaVencimiento),
    venceInsumos: '',
    fechaAsignacion: textoFechaHora(a.fechaAsignacion),
    entidad: nombreEntidad(),
    derechos: derechos.length ? derechos.join(', ') : a.caso.derechosInvolucrados ?? '',
    hechos: a.caso.resumenHechos ?? '',
    auxiliar: a.auxiliar?.nombre ?? '',
    revisor: a.revisor?.nombre ?? '',
    enlace: '',
    detalle: '',
    documentos: '',
    anexos: '',
    version: '1',
    fechaEntrega: '',
    notaExpediente: '',
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
  // Documentos que viajan con el correo (el borrador de solicitud del expediente, por ejemplo)
  adjuntos?: { nombre: string, tipoMime: string, contenido: Buffer }[]
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
    : { actuacion: null, valores: { prefijo: parametro<string>('PREFIJO_ASUNTO'), prefijoAsunto: prefijoAsunto(), ...d.extra } as Record<string, string> }
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
    const enviado = await enviarCorreo(buzon, { para, cc: d.cc, asunto, html, responderA, adjuntos: [...(logo ? [logo] : []), ...(d.adjuntos ?? [])] })
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
  const { asunto, html } = renderizar(codigo, base, ejemplo(codigo), !SIN_FICHA.has(codigo), `cid:${CID_LOGO}`)
  const logo = logoIncrustado()
  await enviarCorreo(PLANTILLAS[codigo].buzon, { para: [para], asunto: `[PRUEBA] ${asunto}`, html, adjuntos: logo ? [logo] : [] })
}

// =====================================
// CORREO LIBRE DESDE EL CASO
// Para lo que no tiene plantilla (aclarar algo con la entidad, responder una pregunta). Sale con el
// mismo diseño y la ficha del caso, por el buzón que se elija, y queda registrado en el caso.
// =====================================

// Lo que el formulario trae ya escrito: asunto normalizado y a quién escribir según el buzón
export const borradorLibre = async (actuacionId: number) => {
  const { valores } = await valoresDeActuacion(actuacionId)
  const asignacion = await Correo.findOne({ where: { actuacionId, proposito: 'ASIGNACION' }, attributes: ['remitente'] })
  return {
    asunto: `${valores.prefijoAsunto}${valores.criticidad} - RAD. ${valores.radicado} - ${valores.actuacion} - ${valores.vence}`,
    destinatarios: {
      ASIGNACIONES: asignacion?.remitente ? [asignacion.remitente] : [],
      INSUMOS: parametro<string[]>('CORREOS_INSUMOS'),
      ENTREGAS: parametro<string[]>('CORREOS_ENTREGA')
    }
  }
}

export const enviarLibre = async (d: {
  actuacionId: number, buzon: Buzon, para: string[], cc?: string[], asunto: string, cuerpo: string, responderACorreoId?: number | null, usuarioId: number
}) => {
  const para = [...new Set(d.para.map(c => c.trim().toLowerCase()).filter(Boolean))]
  if (!para.length) throw new ErrorNegocio('Indique a quién va el correo')
  if (!d.asunto.trim() || !d.cuerpo.trim()) throw new ErrorNegocio('Escriba el asunto y el mensaje')
  const { actuacion, valores } = await valoresDeActuacion(d.actuacionId)
  const html = armarCorreoHtml({
    titulo: 'Comunicación sobre el caso',
    cuerpoHtml: aHtml(escaparHtml(d.cuerpo.trim())),
    ficha: [
      { etiqueta: 'Caso', valor: valores.numeroInterno }, { etiqueta: 'Radicado', valor: valores.radicadoFormato },
      { etiqueta: 'Actuación', valor: valores.etapa }, { etiqueta: 'Criticidad', valor: valores.criticidad }, { etiqueta: 'Vence', valor: valores.vence }
    ].filter(f => f.valor),
    criticidad: valores.criticidad,
    buzon: NOMBRE_BUZON[d.buzon],
    logoSrc: `cid:${CID_LOGO}`
  })
  const original = d.responderACorreoId ? await Correo.findByPk(d.responderACorreoId, { attributes: ['graphId', 'conversationId', 'buzon', 'casoId'] }) : null
  if (original && original.casoId !== actuacion.casoId) throw new ErrorNegocio('Ese correo no es de este caso')
  const registro = {
    direccion: 'SALIENTE' as const, buzon: d.buzon, remitente: direccionBuzon(d.buzon), para, cc: d.cc ?? [], asunto: d.asunto.trim(),
    cuerpoTexto: d.cuerpo.trim(), fechaCorreo: new Date(), radicados: [valores.radicado], proposito: 'LIBRE',
    casoId: actuacion.casoId, actuacionId: actuacion.id, usuarioId: d.usuarioId
  }
  if (modoEnvio() === 'SIMULADO') return Correo.create({ ...registro, estado: 'SIMULADO', conversationId: original?.conversationId ?? null })
  try {
    const responderA = original?.graphId && original.buzon === d.buzon ? original.graphId : undefined
    const logo = logoIncrustado()
    const enviado = await enviarCorreo(d.buzon, { para, cc: d.cc, asunto: registro.asunto, html, responderA, adjuntos: logo ? [logo] : [] })
    return Correo.create({ ...registro, estado: 'ENVIADO', graphId: enviado.graphId, conversationId: enviado.conversationId, fechaCorreo: enviado.enviadoEn })
  } catch (error) {
    const correo = await Correo.create({ ...registro, estado: 'ERROR', error: String(error instanceof Error ? error.message : error).slice(0, 2000) })
    throw new ErrorNegocio(`No se pudo enviar: ${correo.error}`)
  }
}
