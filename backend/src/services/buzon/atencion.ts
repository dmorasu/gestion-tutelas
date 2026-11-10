import { Op, type WhereOptions } from 'sequelize'
import { Correo, EnlaceCorreo, Rol, Usuario } from '../../models'
import { enviarCorreo, direccionBuzon } from './graph'
import { armarCorreoHtml, logoIncrustado, CID_LOGO } from './disenoCorreo'
import { modoEnvio } from './correosSalida'
import { parametro } from '../parametros'
import { ROLES } from '../constantes'
import { enBogota, minutosDeHora, textoFechaHora } from '../../utils/fechaColombia'
import { esDiaHabil } from '../../utils/diasHabiles'

// =====================================
// ATENCIÓN DE LA BANDEJA
// Ningún correo entrante puede quedar sin destino: o se registra como asignación, o se asocia a un
// caso (con su respuesta clasificada y sus enlaces traídos), o se descarta con motivo. Mientras no,
// está "por atender". Las asignaciones que pasan de MINUTOS_ALERTA_SIN_ATENDER sin atender se le
// avisan al coordinador por correo (en horario hábil, un solo aviso con todas).
// =====================================

// Por atender: por registrar, con una respuesta por revisar o con enlaces pendientes
export const filtroPorAtender = async (): Promise<WhereOptions> => {
  const conEnlaces = (await EnlaceCorreo.findAll({ where: { estado: 'PENDIENTE' }, attributes: ['correoId'], group: ['correoId'], raw: true })).map(e => e.correoId)
  return {
    direccion: 'ENTRANTE',
    estado: { [Op.ne]: 'DESCARTADO' },
    [Op.or]: [{ estado: 'POR_REGISTRAR' }, { porRevisar: true }, ...(conEnlaces.length ? [{ id: conEnlaces }] : [])]
  }
}

const limiteSinAtender = () => new Date(Date.now() - parametro<number>('MINUTOS_ALERTA_SIN_ATENDER') * 60_000)

// Asignaciones que nadie registró a tiempo (con o sin alguien que las haya tomado)
export const asignacionesVencidas = () => Correo.count({
  where: { direccion: 'ENTRANTE', buzon: 'ASIGNACIONES', estado: 'POR_REGISTRAR', fechaCorreo: { [Op.lt]: limiteSinAtender() } }
})

const enHorarioHabil = (ahora: Date) => {
  const { dia, minutos } = enBogota(ahora)
  return esDiaHabil(dia) && minutos >= minutosDeHora(parametro<string>('HORA_INICIO_JORNADA')) && minutos <= 19 * 60
}

export const avisarSinAtender = async () => {
  const ahora = new Date()
  if (!enHorarioHabil(ahora)) return 0
  const pendientes = await Correo.findAll({
    where: { direccion: 'ENTRANTE', buzon: 'ASIGNACIONES', estado: 'POR_REGISTRAR', avisoSinAtenderEn: null, fechaCorreo: { [Op.lt]: limiteSinAtender() } },
    attributes: ['id', 'asunto', 'remitente', 'fechaCorreo', 'responsableId'],
    order: [['fechaCorreo', 'ASC']]
  })
  if (!pendientes.length) return 0
  const coordinadores = await Usuario.findAll({
    where: { activo: true }, attributes: ['correo'],
    include: [{ model: Rol, where: { codigo: ROLES.COORDINADOR }, attributes: [], through: { attributes: [] } }]
  })
  const para = coordinadores.map(c => c.correo)
  if (!para.length) return 0
  const url = process.env.URL_FRONTEND ?? ''
  const lineas = pendientes.map(c => `- Llegó ${textoFechaHora(c.fechaCorreo)} de ${c.remitente ?? '—'}: ${c.asunto ?? '(sin asunto)'}${c.responsableId ? ' (alguien la tomó)' : ''} ${url}/correos/${c.id}`)
  const asunto = `[Aviso interno] ${pendientes.length} asignación(es) sin atender hace más de ${parametro<number>('MINUTOS_ALERTA_SIN_ATENDER')} minutos`
  const texto = `Estas asignaciones llegaron al buzón y no se han registrado:\n\n${lineas.join('\n')}`
  const html = armarCorreoHtml({
    titulo: 'Asignaciones sin atender',
    cuerpoHtml: `<p style="margin:0 0 14px 0;">Estas asignaciones llegaron al buzón y no se han registrado:</p><ul style="margin:0 0 14px 0;padding-left:20px;">${pendientes.map(c =>
      `<li style="margin:0 0 6px 0;"><a href="${url}/correos/${c.id}" style="color:#1e293b;">${(c.asunto ?? '(sin asunto)').replace(/</g, '&lt;')}</a><br><span style="color:#64748b;font-size:12px;">Llegó ${textoFechaHora(c.fechaCorreo)} de ${c.remitente ?? '—'}</span></li>`).join('')}</ul>`,
    buzon: 'asignaciones',
    logoSrc: `cid:${CID_LOGO}`
  })
  const registro = {
    direccion: 'SALIENTE' as const, buzon: 'ASIGNACIONES' as const, remitente: direccionBuzon('ASIGNACIONES'), para, cc: [], asunto,
    cuerpoTexto: texto, fechaCorreo: ahora, radicados: [], proposito: 'AVISO_INTERNO', usuarioId: null
  }
  if (modoEnvio() === 'SIMULADO') await Correo.create({ ...registro, estado: 'SIMULADO' })
  else {
    try {
      const logo = logoIncrustado()
      const enviado = await enviarCorreo('ASIGNACIONES', { para, asunto, html, adjuntos: logo ? [logo] : [] })
      await Correo.create({ ...registro, estado: 'ENVIADO', graphId: enviado.graphId, conversationId: enviado.conversationId })
    } catch (error) {
      // Sin aviso enviado no se marcan: se reintenta en la próxima lectura
      console.error('❌ Aviso de asignaciones sin atender', error)
      return 0
    }
  }
  await Correo.update({ avisoSinAtenderEn: ahora }, { where: { id: pendientes.map(c => c.id) } })
  return pendientes.length
}
