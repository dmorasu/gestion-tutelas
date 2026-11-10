import pdf from 'pdf-parse/lib/pdf-parse.js'
import { Op } from 'sequelize'
import { Correo, Archivo, SincronizacionBuzon, Caso, Actuacion, Escrito } from '../../models'
import { graph, rutaBuzon, buzonesConfigurados, ErrorGraph } from './graph'
import { guardarArchivo, carpetaBandeja } from '../almacenamiento'
import { archivarAdjuntos, type Subcarpeta } from '../expediente'
import { buscarRadicados } from '../../utils/radicado'
import { leerAsunto, etapaPorTexto } from '../../utils/asunto'
import { parametro } from '../parametros'
import type { Buzon } from '../constantes'
import { ejecutarConContexto } from '../../utils/contextoPeticion'

// =====================================
// LECTURA DE LOS TRES BUZONES (asignaciones, insumos, entregas)
// Cada 2 minutos (worker): pide a Graph lo cambiado en la bandeja de entrada de cada buzón desde la
// última consulta (consulta delta) y guarda cada correo nuevo con sus adjuntos. Después intenta
// asociarlo a un caso: por el hilo (respuesta a un correo que envió la app) o por el radicado.
// Lo que no se puede asociar queda en la bandeja "Correos por registrar".
// =====================================

type Direccion = { emailAddress?: { address?: string, name?: string } }
type MensajeGraph = {
  id: string
  subject?: string
  from?: Direccion
  toRecipients?: Direccion[]
  ccRecipients?: Direccion[]
  receivedDateTime: string
  conversationId?: string
  internetMessageId?: string
  body?: { contentType: string, content: string }
  hasAttachments?: boolean
  isDraft?: boolean
}
type AdjuntoGraph = { '@odata.type': string, id: string, name: string, contentType?: string, size?: number, contentBytes?: string, isInline?: boolean }

const correoDe = (d?: Direccion) => d?.emailAddress?.address?.toLowerCase().trim() ?? ''

const textoPdf = async (contenido: Buffer) => {
  try {
    // Solo las 3 primeras páginas: el radicado va en el encabezado del oficio o del auto
    const r = await pdf(contenido, { max: 3 })
    return r.text
  } catch {
    return '' // PDF escaneado o dañado: el asistente lo registra a mano
  }
}

const enlacesDe = (texto: string) => [...new Set(texto.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [])].slice(0, 30)

const guardarMensaje = async (buzon: Buzon, id: string) => {
  if (await Correo.findOne({ where: { graphId: id }, attributes: ['id'] })) return null
  const base = rutaBuzon(buzon)
  const m = await graph<MensajeGraph>(
    `${base}/messages/${id}?$select=subject,from,toRecipients,ccRecipients,receivedDateTime,conversationId,internetMessageId,body,hasAttachments,isDraft`,
    { encabezados: { Prefer: 'outlook.body-content-type="text"' } }
  )
  if (m.isDraft) return null

  const cuerpo = m.body?.content ?? ''
  // La asignación trae etapa, criticidad, radicado y vencimiento en el asunto normalizado.
  // Sin él, la etapa se adivina por el texto (solo en el buzón de asignaciones)
  const asunto = leerAsunto(m.subject, parametro<string>('HORA_VENCIMIENTO_TERMINO'))
  let etapa = asunto.etapa
  let fuenteEtapa: 'ASUNTO' | 'TEXTO' | null = etapa ? 'ASUNTO' : null
  if (!etapa && buzon === 'ASIGNACIONES') {
    etapa = etapaPorTexto(m.subject, cuerpo)
    if (etapa) fuenteEtapa = 'TEXTO'
  }

  const correo = await Correo.create({
    graphId: m.id,
    internetMessageId: m.internetMessageId ?? null,
    conversationId: m.conversationId ?? null,
    direccion: 'ENTRANTE',
    buzon,
    etapaDetectada: etapa,
    fuenteEtapa,
    criticidadDetectada: asunto.criticidad,
    vencimientoDetectado: asunto.vence,
    remitente: correoDe(m.from) || null,
    nombreRemitente: m.from?.emailAddress?.name ?? null,
    para: (m.toRecipients ?? []).map(correoDe),
    cc: (m.ccRecipients ?? []).map(correoDe),
    asunto: m.subject ?? null,
    cuerpoTexto: cuerpo.slice(0, 20000),
    enlaces: enlacesDe(cuerpo),
    fechaCorreo: new Date(m.receivedDateTime),
    estado: 'POR_REGISTRAR'
  })

  const textosPdf: string[] = []
  if (m.hasAttachments) {
    const { value } = await graph<{ value: AdjuntoGraph[] }>(`${base}/messages/${id}/attachments`)
    // Hasta saber de qué caso es, el adjunto va a la bandeja; al asociarlo pasa al expediente
    const carpeta = carpetaBandeja(correo.id, new Date(m.receivedDateTime))
    for (const a of value) {
      // Solo archivos (no correos adjuntos ni enlaces) y no las imágenes de la firma
      if (a['@odata.type'] !== '#microsoft.graph.fileAttachment' || a.isInline || !a.contentBytes) continue
      const contenido = Buffer.from(a.contentBytes, 'base64')
      const ubicacion = await guardarArchivo(carpeta, a.name, contenido, a.contentType).catch(error => {
        console.error('❌ No se pudo guardar el adjunto', a.name, error)
        return { proveedor: null, ruta: null, itemId: null, webUrl: null }
      })
      await Archivo.create({ nombre: a.name, tipoMime: a.contentType ?? null, tamano: a.size ?? contenido.length, tipo: 'CORREO', ...ubicacion, correoId: correo.id, adjuntoGraphId: a.id })
      if ((a.contentType ?? '').includes('pdf') || a.name.toLowerCase().endsWith('.pdf')) textosPdf.push(await textoPdf(contenido))
    }
  }

  // El radicado del bloque del asunto va primero: es el que el cliente se comprometió a poner
  const encontrados = buscarRadicados(m.subject, cuerpo, ...textosPdf)
  correo.radicados = asunto.radicado ? [asunto.radicado, ...encontrados.filter(r => r !== asunto.radicado)] : encontrados
  await correo.save()
  return correo
}

// =====================================
// ASOCIAR EL CORREO A UN CASO
// =====================================

// Qué es la respuesta según lo que había enviado la app en ese hilo
const RESPUESTA_A: Record<string, string> = {
  SOLICITUD_INSUMOS: 'RESPUESTA_INSUMOS',
  SOLICITUD_DATOS_FALTANTES: 'RESPUESTA_DATOS_FALTANTES',
  ENTREGA_V1: 'RESPUESTA_ENTREGA',
  ENTREGA_V2: 'RESPUESTA_ENTREGA'
}

// Carpeta del expediente según lo que es la respuesta. Lo que adjunta la entidad al responder una
// entrega (el escrito con observaciones, por ejemplo) queda en la carpeta de esa versión y ligado a ella
const destinoAdjuntos = async (proposito: string, actuacionId: number): Promise<{ sub: Subcarpeta, tipo: Archivo['tipo'], escritoId: number | null }> => {
  if (proposito === 'RESPUESTA_INSUMOS') return { sub: 'Insumos', tipo: 'INSUMO', escritoId: null }
  if (proposito === 'RESPUESTA_ENTREGA') {
    const escrito = await Escrito.findOne({ where: { actuacionId }, order: [['version', 'DESC']], attributes: ['id', 'version'] })
    return { sub: `Escritos/V${escrito?.version ?? 1}`, tipo: 'RESPUESTA', escritoId: escrito?.id ?? null }
  }
  return { sub: 'Entrada', tipo: 'CORREO', escritoId: null }
}

const asociar = async (correo: Correo, actuacion: { id?: number, casoId: number }, proposito: string, porRevisar: boolean) => {
  const actuacionId = actuacion.id as number
  await correo.update({ estado: 'ASOCIADO', casoId: actuacion.casoId, actuacionId, proposito, porRevisar })
  const { sub, tipo, escritoId } = await destinoAdjuntos(proposito, actuacionId)
  await archivarAdjuntos(correo.id, actuacionId, sub, tipo, escritoId)
}

// Número interno de la firma (GPA-2026-00001) en el asunto o el cuerpo: lo pedimos en los correos
// de salida para que el cliente lo cite aunque responda en otro hilo
const numerosInternos = (correo: Correo) =>
  [...new Set([...`${correo.asunto ?? ''} ${correo.cuerpoTexto ?? ''}`.matchAll(/\bGPA-(\d{4})-(\d{5})\b/gi)].map(m => `GPA-${m[1]}-${m[2]}`))]

export const asociarCorreo = async (correo: Correo) => {
  // 1. Por el hilo: respuesta a un correo que envió la app (insumos, datos faltantes, entrega)
  if (correo.conversationId) {
    const enviado = await Correo.findOne({
      where: { conversationId: correo.conversationId, direccion: 'SALIENTE', actuacionId: { [Op.ne]: null } },
      order: [['fechaCorreo', 'DESC']]
    })
    if (enviado?.actuacionId && enviado.casoId) {
      const proposito = RESPUESTA_A[enviado.proposito ?? ''] ?? 'SEGUIMIENTO'
      // Toda respuesta queda "por revisar": la entrega se clasifica (acuse, aprobación o devolución
      // con tipo y motivo) y en los insumos se marca cuáles llegaron, porque el cliente suele mandarlos
      // por partes y el ANS sigue suspendido hasta la entrega completa (manual §12.3). La hora de
      // recepción que se registre es la de llegada de este correo, no la de la confirmación
      await asociar(correo, { id: enviado.actuacionId, casoId: enviado.casoId }, proposito, proposito !== 'SEGUIMIENTO')
      return
    }
  }

  // 2. Por el número interno del caso y, si no, por el radicado (respondió en otro hilo o escribió de nuevo)
  const numeros = numerosInternos(correo)
  let casos = numeros.length ? await Caso.findAll({ where: { numeroInterno: numeros }, attributes: ['id'] }) : []
  if (!casos.length && correo.radicados.length) casos = await Caso.findAll({ where: { radicado: correo.radicados }, attributes: ['id'] })
  if (casos.length !== 1) return
  const caso = casos[0]
  const abiertas = await Actuacion.findAll({ where: { casoId: caso.id, estado: { [Op.ne]: 'CERRADA' } }, attributes: ['id', 'casoId', 'etapa', 'estado'], order: [['fechaAsignacion', 'DESC']] })

  if (correo.buzon === 'INSUMOS') {
    const esperando = abiertas.find(a => a.estado === 'EN_INSUMOS') ?? abiertas[0]
    if (esperando) return asociar(correo, esperando, 'RESPUESTA_INSUMOS', true)
  }
  if (correo.buzon === 'ENTREGAS') {
    const entregada = abiertas.find(a => a.estado === 'ENTREGADO') ?? abiertas[0]
    if (entregada) return asociar(correo, entregada, 'RESPUESTA_ENTREGA', true)
  }
  // Asignaciones: si ya hay una actuación abierta de la misma etapa, es un correo más de esa
  // actuación. Si no (ej. llega la impugnación de un caso que estaba en contestación), es una
  // asignación nueva: queda por registrar, ya ligada al caso, para que el asistente abra la etapa
  const misma = correo.etapaDetectada ? abiertas.find(a => a.etapa === correo.etapaDetectada) : null
  if (misma) return asociar(correo, misma, 'SEGUIMIENTO', false)
  await correo.update({ casoId: caso.id })
}

// Tamaño del buzón (suma de sus carpetas), como máximo una vez por hora: avisa antes de llegar a los 50 GB
const medirBuzon = async (buzon: Buzon, estado: SincronizacionBuzon) => {
  if (estado.tamanoMedidoEn && Date.now() - estado.tamanoMedidoEn.getTime() < 60 * 60 * 1000) return
  let total = 0
  let url: string | undefined = `${rutaBuzon(buzon)}/mailFolders?includeHiddenFolders=true&$select=sizeInBytes&$top=100`
  while (url) {
    const pagina: { value: { sizeInBytes?: number }[], '@odata.nextLink'?: string } = await graph(url)
    total += pagina.value.reduce((s, f) => s + (f.sizeInBytes ?? 0), 0)
    url = pagina['@odata.nextLink']
  }
  await estado.update({ tamanoBytes: String(total), tamanoMedidoEn: new Date() })
}

const sincronizarUno = async (buzon: Buzon, direccion: string) => {
  const [estado] = await SincronizacionBuzon.findOrCreate({ where: { buzon: direccion }, defaults: { buzon: direccion } })
  // La primera vez solo se toman los correos desde BUZON_LEER_DESDE (o desde hoy)
  const desde = new Date(process.env.BUZON_LEER_DESDE || new Date().toISOString().slice(0, 10))

  let url: string | undefined = estado.deltaLink ?? `${rutaBuzon(buzon)}/mailFolders/inbox/messages/delta?$select=id,receivedDateTime`
  let nuevos = 0
  try {
    while (url) {
      const pagina: { value: { id: string, receivedDateTime?: string, '@removed'?: unknown }[], '@odata.nextLink'?: string, '@odata.deltaLink'?: string } =
        await graph(url, { encabezados: { Prefer: 'odata.maxpagesize=50' } })
      for (const item of pagina.value) {
        if (item['@removed']) continue
        if (!estado.deltaLink && item.receivedDateTime && new Date(item.receivedDateTime) < desde) continue
        try {
          const correo = await guardarMensaje(buzon, item.id)
          if (correo) {
            nuevos++
            await asociarCorreo(correo)
          }
        } catch (error) {
          // Un correo con problema no frena los demás: queda registrado para revisarlo
          console.error('❌ Correo', buzon, item.id, error)
        }
      }
      if (pagina['@odata.deltaLink']) estado.deltaLink = pagina['@odata.deltaLink']
      url = pagina['@odata.nextLink']
    }
    await estado.update({ deltaLink: estado.deltaLink, ultimaEjecucion: new Date(), ultimoError: null, correosLeidos: estado.correosLeidos + nuevos })
    await medirBuzon(buzon, estado).catch(error => console.error('❌ Tamaño del buzón', direccion, error))
  } catch (error) {
    // deltaLink vencido (410): se empieza de nuevo; los correos ya guardados no se repiten
    if (error instanceof ErrorGraph && error.status === 410) await estado.update({ deltaLink: null })
    await estado.update({ ultimaEjecucion: new Date(), ultimoError: String(error instanceof Error ? error.message : error).slice(0, 2000) })
    throw error
  }
  return nuevos
}

// Un buzón con problema (permiso, política de acceso) no impide leer los otros
export const sincronizarBuzon = () => ejecutarConContexto({ usuarioId: null, nombre: 'Buzón', origen: 'BUZON' }, async () => {
  const buzones = buzonesConfigurados()
  if (!buzones.length) throw new Error('No hay buzones en el .env (BUZON_ASIGNACIONES, BUZON_INSUMOS, BUZON_ENTREGAS)')
  let nuevos = 0
  const errores: string[] = []
  for (const { buzon, direccion } of buzones) {
    try {
      nuevos += await sincronizarUno(buzon, direccion)
    } catch (error) {
      errores.push(`${direccion}: ${error instanceof Error ? error.message : error}`)
    }
  }
  if (errores.length) throw new Error(errores.join(' | '))
  return nuevos
})
