import pdf from 'pdf-parse/lib/pdf-parse.js'
import { Op } from 'sequelize'
import { Correo, Archivo, SincronizacionBuzon, Caso, Actuacion, SolicitudInsumo } from '../../models'
import { graph, rutaBuzon, ErrorGraph } from './graph'
import { subirArchivo } from '../almacenamiento'
import { buscarRadicados } from '../../utils/radicado'
import { ETAPAS_DE_ALIAS, type Etapa } from '../constantes'
import { ejecutarConContexto } from '../../utils/contextoPeticion'

// =====================================
// LECTURA DEL BUZÓN DE TUTELAS
// Cada 2 minutos (worker): pide a Graph lo cambiado en la bandeja de entrada desde la última
// consulta (consulta delta) y guarda cada correo nuevo con sus adjuntos. Después intenta
// asociarlo a un caso: por el hilo (respuestas a lo que envió la app) o por el radicado.
// Lo que no se puede asociar queda en "Correos por registrar".
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
  internetMessageHeaders?: { name: string, value: string }[]
  body?: { contentType: string, content: string }
  hasAttachments?: boolean
  isDraft?: boolean
}
type AdjuntoGraph = { '@odata.type': string, id: string, name: string, contentType?: string, size?: number, contentBytes?: string, isInline?: boolean }

const correoDe = (d?: Direccion) => d?.emailAddress?.address?.toLowerCase().trim() ?? ''

// Etapa: primero el encabezado que pone la regla de Exchange (ve copias ocultas y varios alias);
// si no viene, el alias al que llegó
const detectarEtapa = (m: MensajeGraph): { etapa: Etapa | null, fuente: 'ENCABEZADO' | 'ALIAS' | null } => {
  const encabezado = m.internetMessageHeaders?.find(h => h.name.toLowerCase() === 'x-tutelas-etapa')?.value?.trim().toUpperCase()
  if (encabezado && ETAPAS_DE_ALIAS[encabezado]) return { etapa: ETAPAS_DE_ALIAS[encabezado], fuente: 'ENCABEZADO' }
  const destinos = [...(m.toRecipients ?? []), ...(m.ccRecipients ?? [])].map(correoDe)
  const alias: [string | undefined, Etapa][] = [
    [process.env.ALIAS_IMPUGNACION, 'IMPUGNACION'],
    [process.env.ALIAS_CUMPLIMIENTO, 'CUMPLIMIENTO'],
    [process.env.ALIAS_ACCION, 'ACCION']
  ]
  for (const [direccion, etapa] of alias) {
    if (direccion && destinos.includes(direccion.toLowerCase())) return { etapa, fuente: 'ALIAS' }
  }
  return { etapa: null, fuente: null }
}

const textoPdf = async (contenido: Buffer) => {
  try {
    // Solo las 3 primeras páginas: el radicado va en el encabezado del oficio o del auto
    const r = await pdf(contenido, { max: 3 })
    return r.text
  } catch {
    return '' // PDF escaneado o dañado: el asistente lo registra a mano
  }
}

const guardarMensaje = async (id: string) => {
  if (await Correo.findOne({ where: { graphId: id }, attributes: ['id'] })) return null
  const base = rutaBuzon()
  const m = await graph<MensajeGraph>(
    `${base}/messages/${id}?$select=subject,from,toRecipients,ccRecipients,receivedDateTime,conversationId,internetMessageId,internetMessageHeaders,body,hasAttachments,isDraft`,
    { encabezados: { Prefer: 'outlook.body-content-type="text"' } }
  )
  if (m.isDraft) return null

  const { etapa, fuente } = detectarEtapa(m)
  const cuerpo = m.body?.content ?? ''
  const correo = await Correo.create({
    graphId: m.id,
    internetMessageId: m.internetMessageId ?? null,
    conversationId: m.conversationId ?? null,
    direccion: 'ENTRANTE',
    etapaDetectada: etapa,
    fuenteEtapa: fuente,
    remitente: correoDe(m.from) || null,
    nombreRemitente: m.from?.emailAddress?.name ?? null,
    para: (m.toRecipients ?? []).map(correoDe),
    cc: (m.ccRecipients ?? []).map(correoDe),
    asunto: m.subject ?? null,
    cuerpoTexto: cuerpo.slice(0, 20000),
    fechaCorreo: new Date(m.receivedDateTime),
    estado: 'POR_REGISTRAR'
  })

  const textosPdf: string[] = []
  if (m.hasAttachments) {
    const { value } = await graph<{ value: AdjuntoGraph[] }>(`${base}/messages/${id}/attachments`)
    const fecha = new Date(m.receivedDateTime)
    const carpeta = `correos/${fecha.getUTCFullYear()}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}/${correo.id}`
    for (const a of value) {
      // Solo archivos (no correos adjuntos ni enlaces) y no las imágenes de la firma
      if (a['@odata.type'] !== '#microsoft.graph.fileAttachment' || a.isInline || !a.contentBytes) continue
      const contenido = Buffer.from(a.contentBytes, 'base64')
      const rutaBlob = await subirArchivo(carpeta, a.name, contenido, a.contentType).catch(error => {
        console.error('❌ No se pudo subir el adjunto', a.name, error)
        return null
      })
      await Archivo.create({ nombre: a.name, tipoMime: a.contentType ?? null, tamano: a.size ?? contenido.length, rutaBlob, correoId: correo.id })
      if ((a.contentType ?? '').includes('pdf') || a.name.toLowerCase().endsWith('.pdf')) textosPdf.push(await textoPdf(contenido))
    }
  }

  correo.radicados = buscarRadicados(m.subject, cuerpo, ...textosPdf)
  await correo.save()
  return correo
}

// =====================================
// ASOCIAR EL CORREO A UN CASO
// =====================================
export const asociarCorreo = async (correo: Correo) => {
  // 1. Por el hilo: respuesta a un correo que envió la app (insumos, entrega, devolución...)
  if (correo.conversationId) {
    const enviado = await Correo.findOne({
      where: { conversationId: correo.conversationId, direccion: 'SALIENTE', actuacionId: { [Op.ne]: null } },
      order: [['fechaCorreo', 'DESC']]
    })
    if (enviado) {
      let proposito = 'RESPUESTA'
      if (enviado.proposito === 'SOLICITUD_INSUMOS') {
        proposito = 'RESPUESTA_INSUMOS'
        // Hora de recepción de insumos = llegada del correo (automática, cuenta para el ANS)
        await SolicitudInsumo.update(
          { fechaRecepcion: correo.fechaCorreo },
          { where: { actuacionId: enviado.actuacionId, conversationId: correo.conversationId, fechaRecepcion: null } }
        )
      }
      if (enviado.proposito === 'ENTREGA_ENTIDAD') proposito = 'RESPUESTA_ENTREGA' // devolución o constancia: lo clasifica el asistente
      await correo.update({ estado: 'ASOCIADO', casoId: enviado.casoId, actuacionId: enviado.actuacionId, proposito })
      return
    }
  }

  // 2. Por el radicado
  if (correo.radicados.length) {
    const casos = await Caso.findAll({ where: { radicado: correo.radicados }, attributes: ['id'] })
    if (casos.length === 1) {
      const caso = casos[0]
      // Si ya hay una actuación abierta de la misma etapa, es un correo más de esa actuación.
      // Si no (ej. llega la impugnación de un caso que estaba en acción), es una asignación nueva:
      // queda por registrar, ya ligada al caso, para que el asistente abra la etapa
      const abierta = correo.etapaDetectada
        ? await Actuacion.findOne({ where: { casoId: caso.id, etapa: correo.etapaDetectada, estado: { [Op.ne]: 'CERRADA' } }, attributes: ['id'] })
        : null
      if (abierta) await correo.update({ estado: 'ASOCIADO', casoId: caso.id, actuacionId: abierta.id, proposito: 'SEGUIMIENTO' })
      else await correo.update({ casoId: caso.id })
    }
  }
}

// Las fechas de los correos se guardan como llegaron; la de asignación sale de aquí
export const sincronizarBuzon = () => ejecutarConContexto({ usuarioId: null, nombre: 'Buzón', origen: 'BUZON' }, async () => {
  const buzon = process.env.BUZON_CORREO as string
  const [estado] = await SincronizacionBuzon.findOrCreate({ where: { buzon }, defaults: { buzon } })
  // La primera vez solo se toman los correos desde BUZON_LEER_DESDE (o desde hoy)
  const desde = new Date(process.env.BUZON_LEER_DESDE || new Date().toISOString().slice(0, 10))

  let url: string | undefined = estado.deltaLink ?? `${rutaBuzon()}/mailFolders/inbox/messages/delta?$select=id,receivedDateTime`
  let nuevos = 0
  try {
    while (url) {
      const pagina: { value: { id: string, receivedDateTime?: string, '@removed'?: unknown }[], '@odata.nextLink'?: string, '@odata.deltaLink'?: string } =
        await graph(url, { encabezados: { Prefer: 'odata.maxpagesize=50' } })
      for (const item of pagina.value) {
        if (item['@removed']) continue
        if (!estado.deltaLink && item.receivedDateTime && new Date(item.receivedDateTime) < desde) continue
        try {
          const correo = await guardarMensaje(item.id)
          if (correo) {
            nuevos++
            await asociarCorreo(correo)
          }
        } catch (error) {
          // Un correo con problema no frena los demás: queda registrado para revisarlo
          console.error('❌ Correo', item.id, error)
        }
      }
      if (pagina['@odata.deltaLink']) estado.deltaLink = pagina['@odata.deltaLink']
      url = pagina['@odata.nextLink']
    }
    await estado.update({ deltaLink: estado.deltaLink, ultimaEjecucion: new Date(), ultimoError: null, correosLeidos: estado.correosLeidos + nuevos })
  } catch (error) {
    // deltaLink vencido (410): se empieza de nuevo; los correos ya guardados no se repiten
    if (error instanceof ErrorGraph && error.status === 410) await estado.update({ deltaLink: null })
    await estado.update({ ultimaEjecucion: new Date(), ultimoError: String(error instanceof Error ? error.message : error).slice(0, 2000) })
    throw error
  }
  return nuevos
})
