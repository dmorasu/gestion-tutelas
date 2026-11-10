import { Op, fn, col, type Transaction } from 'sequelize'
import { Actuacion, Usuario, Rol, Equipo } from '../models'
import { ROLES, type Etapa } from './constantes'

// =====================================
// REPARTO POR EQUIPO
// Cada equipo (un revisor y sus auxiliares) atiende unas etapas. La actuación va al auxiliar con
// menos actuaciones abiertas entre los equipos de esa etapa, sin pasar su capacidad diaria, y el
// revisor es el de su equipo. Si ningún equipo atiende la etapa, se reparte entre todos los auxiliares:
// mejor un responsable provisional que una actuación sin dueño.
// =====================================

const ABIERTAS = { [Op.notIn]: ['CERRADA', 'RADICADO', 'APROBADO'] }

const usuariosDelRol = (codigo: string, equipoIds?: number[], transaction?: Transaction) =>
  Usuario.findAll({
    where: { activo: true, ...(equipoIds && { equipoId: equipoIds }) },
    attributes: ['id', 'nombre', 'capacidadDiaria', 'equipoId'],
    include: [{ model: Rol, where: { codigo }, attributes: [], through: { attributes: [] } }],
    transaction
  })

// Conteo por usuario de las actuaciones abiertas y de las recibidas hoy
const cargas = async (campo: 'auxiliarId' | 'revisorId', ids: number[], transaction?: Transaction) => {
  const hoy = new Date()
  hoy.setUTCHours(5, 0, 0, 0) // medianoche de Bogotá
  if (hoy.getTime() > Date.now()) hoy.setUTCDate(hoy.getUTCDate() - 1)
  const [abiertas, deHoy] = await Promise.all([
    Actuacion.findAll({ where: { [campo]: ids, estado: ABIERTAS }, attributes: [campo, [fn('COUNT', col('id')), 'total']], group: [campo], raw: true, transaction }),
    Actuacion.findAll({ where: { [campo]: ids, createdAt: { [Op.gte]: hoy } }, attributes: [campo, [fn('COUNT', col('id')), 'total']], group: [campo], raw: true, transaction })
  ])
  const cuenta = (filas: object[]) => new Map(filas.map(f => [Number((f as Record<string, unknown>)[campo]), Number((f as Record<string, unknown>).total)]))
  return { abiertas: cuenta(abiertas), deHoy: cuenta(deHoy) }
}

const menosCargado = async (candidatos: Usuario[], campo: 'auxiliarId' | 'revisorId', transaction?: Transaction) => {
  if (!candidatos.length) return null
  const { abiertas, deHoy } = await cargas(campo, candidatos.map(u => u.id), transaction)
  const disponibles = candidatos.filter(u => !u.capacidadDiaria || (deHoy.get(u.id) ?? 0) < u.capacidadDiaria)
  const lista = disponibles.length ? disponibles : candidatos
  lista.sort((a, b) => (abiertas.get(a.id) ?? 0) - (abiertas.get(b.id) ?? 0) || a.id - b.id)
  return lista[0]
}

export const equiposDeEtapa = async (etapa: Etapa, transaction?: Transaction) =>
  (await Equipo.findAll({ where: { activo: true, etapas: { [Op.contains]: [etapa] } }, attributes: ['id'], transaction })).map(e => e.id)

// Revisor del equipo; si el equipo no tiene (o no hay equipo), el revisor con menos carga
export const revisorDeEquipo = async (equipoId: number | null, transaction?: Transaction) => {
  const delEquipo = equipoId ? await usuariosDelRol(ROLES.REVISOR, [equipoId], transaction) : []
  const elegido = await menosCargado(delEquipo.length ? delEquipo : await usuariosDelRol(ROLES.REVISOR, undefined, transaction), 'revisorId', transaction)
  return elegido?.id ?? null
}

export const repartir = async (etapa: Etapa, transaction?: Transaction) => {
  const equipos = await equiposDeEtapa(etapa, transaction)
  let auxiliares = equipos.length ? await usuariosDelRol(ROLES.AUXILIAR, equipos, transaction) : []
  if (!auxiliares.length) auxiliares = await usuariosDelRol(ROLES.AUXILIAR, undefined, transaction)
  const auxiliar = await menosCargado(auxiliares, 'auxiliarId', transaction)
  const equipoId = auxiliar?.equipoId ?? (equipos.length === 1 ? equipos[0] : null)
  return { auxiliarId: auxiliar?.id ?? null, equipoId, revisorId: await revisorDeEquipo(equipoId, transaction) }
}
