import { Op } from 'sequelize'
import { Actuacion, Caso, Decision } from '../models'
import { ErrorNegocio } from '../utils/errores'
import { parametro } from './parametros'
import { vencimientoImpugnacion } from './plazos'
import { registrarAsignacion } from './registroCasos'

// =====================================
// FALLOS: el sentido de la decisión, si es favorable a la entidad y lo que dispara (D12, D13).
// Todo fallo desfavorable lleva memorial de cumplimiento aunque se impugne. La actuación de
// cumplimiento no se abre sola: la asigna la entidad por correo (D15) y desde ahí corre el ANS.
// El fallo queda "esperando cumplimiento" hasta que llega esa asignación; si tarda, sale una alerta.
// =====================================

export const INSTANCIAS = ['PRIMERA', 'SEGUNDA', 'DESACATO'] as const
export type Instancia = typeof INSTANCIAS[number]

export const SENTIDOS_POR_INSTANCIA: Record<Instancia, string[]> = {
  PRIMERA: ['CONCEDE', 'CONCEDE_PARCIAL', 'NIEGA', 'IMPROCEDENTE', 'HECHO_SUPERADO'],
  SEGUNDA: ['CONFIRMA', 'REVOCA', 'MODIFICA'],
  DESACATO: ['SANCIONA', 'NO_SANCIONA']
}

// D13: en primera (y desacato) manda el parámetro. En segunda, confirmar lo favorable es favorable y
// revocar lo que concedió también; lo demás (modifica, confirma una concesión, revoca un fallo
// favorable) es desfavorable
export const esFavorable = (instancia: Instancia, sentido: string, primeraFavorable: boolean | null) => {
  if (instancia !== 'SEGUNDA') return parametro<string[]>('SENTIDOS_FAVORABLES').includes(sentido)
  if (primeraFavorable === null) return null
  if (sentido === 'CONFIRMA') return primeraFavorable
  if (sentido === 'REVOCA') return !primeraFavorable
  return false
}

// El fallo de primera instancia del caso (el más reciente), para leer la segunda
const primeraDelCaso = (casoId: number) => Decision.findOne({
  where: { instancia: 'PRIMERA' },
  include: [{ model: Actuacion, attributes: [], where: { casoId }, required: true }],
  order: [['createdAt', 'DESC']]
})

const fecha = (valor?: string | null) => {
  if (!valor) return null
  const d = new Date(valor)
  if (isNaN(d.getTime())) throw new ErrorNegocio(`Fecha no válida: ${valor}`)
  return d
}

export type DatosDecision = {
  actuacionId: number
  instancia: Instancia
  sentido: string
  fechaDecision?: string | null
  fechaNotificacion?: string | null
  // D5: notificada por correo electrónico (puede sumar días al término de impugnación)
  notificadaPorCorreo?: boolean
  usuarioId: number
}

// Se registra aunque la actuación esté cerrada: el fallo llega semanas después de radicar
export const registrarDecision = async (d: DatosDecision) => {
  const a = await Actuacion.findByPk(d.actuacionId, { attributes: ['id', 'casoId', 'etapa'] })
  if (!a) throw new ErrorNegocio('La actuación no existe', 404)
  if (!INSTANCIAS.includes(d.instancia)) throw new ErrorNegocio('Instancia no válida')
  if (!SENTIDOS_POR_INSTANCIA[d.instancia].includes(d.sentido)) throw new ErrorNegocio('El sentido no corresponde a la instancia')

  let primeraFavorable: boolean | null = null
  if (d.instancia === 'SEGUNDA') {
    const primera = await primeraDelCaso(a.casoId)
    if (!primera) throw new ErrorNegocio('Registre primero el fallo de primera instancia: la segunda se lee contra ella')
    primeraFavorable = primera.favorable
  }
  const favorable = esFavorable(d.instancia, d.sentido, primeraFavorable)
  const notificacion = fecha(d.fechaNotificacion)
  // D12: memorial de cumplimiento en todo fallo de tutela desfavorable (primera o segunda)
  const requiereCumplimiento = d.instancia !== 'DESACATO' && favorable === false && parametro<boolean>('CUMPLIMIENTO_DURANTE_IMPUGNACION')
  // Si el caso ya tiene un cumplimiento abierto, ese es el que atiende este fallo
  const cumplimiento = requiereCumplimiento
    ? await Actuacion.findOne({ where: { casoId: a.casoId, etapa: 'CUMPLIMIENTO', estado: { [Op.ne]: 'CERRADA' } }, attributes: ['id'] })
    : null

  const decision = await Decision.create({
    actuacionId: a.id,
    instancia: d.instancia,
    sentido: d.sentido,
    fechaDecision: d.fechaDecision?.slice(0, 10) || null,
    fechaNotificacion: notificacion,
    notificadaPorCorreo: !!d.notificadaPorCorreo,
    favorable,
    fechaVenceImpugnacion: d.instancia === 'PRIMERA' && notificacion ? vencimientoImpugnacion(notificacion, !!d.notificadaPorCorreo) : null,
    requiereCumplimiento,
    actuacionCumplimientoId: cumplimiento?.id ?? null
  })

  // La segunda instancia revoca la concesión: el cumplimiento que se esperaba ya no hace falta
  if (d.instancia === 'SEGUNDA' && favorable) {
    const pendientes = await Decision.findAll({
      where: { requiereCumplimiento: true, actuacionCumplimientoId: null, id: { [Op.ne]: decision.id } },
      include: [{ model: Actuacion, attributes: [], where: { casoId: a.casoId }, required: true }]
    })
    for (const p of pendientes) await p.update({ requiereCumplimiento: false })
  }
  return decision
}

// Cuando la entidad pidió el memorial por otro canal: el coordinador abre el cumplimiento a mano.
// La asignación es este momento (no hay correo), sin acuse
export const abrirCumplimiento = async (d: { decisionId: number, usuarioId: number }) => {
  const decision = await Decision.findByPk(d.decisionId, { include: [{ model: Actuacion, include: [{ model: Caso, attributes: ['id', 'radicado', 'tipoSolicitud'] }] }] })
  const caso = decision?.actuacion?.caso
  if (!decision || !caso) throw new ErrorNegocio('El fallo no existe', 404)
  if (!decision.requiereCumplimiento || decision.actuacionCumplimientoId) throw new ErrorNegocio('Este fallo no está esperando cumplimiento')
  return registrarAsignacion({
    radicado: caso.radicado,
    tipoSolicitud: caso.tipoSolicitud,
    etapa: 'CUMPLIMIENTO',
    fechaAsignacion: new Date().toISOString(),
    fechaNotificacion: decision.fechaNotificacion?.toISOString() ?? null,
    sinAcuse: true
  }, d.usuarioId)
}
