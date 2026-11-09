import { Op, fn, col, type Transaction } from 'sequelize'
import { Actuacion, Usuario, Rol } from '../models'
import { ROLES } from './constantes'

// =====================================
// REPARTO
// Fase 1: al usuario activo del rol con menos actuaciones abiertas, sin pasar su capacidad diaria.
// Cuando se defina D16 (revisión de abogado) y la agenda del equipo, aquí se agrega esa regla.
// =====================================

const ABIERTAS = { [Op.notIn]: ['CERRADA', 'RADICADO'] }

const usuariosDelRol = (codigo: string) =>
  Usuario.findAll({
    where: { activo: true },
    attributes: ['id', 'nombre', 'capacidadDiaria'],
    include: [{ model: Rol, where: { codigo }, attributes: [], through: { attributes: [] } }]
  })

export const elegirResponsable = async (rol: typeof ROLES.AUXILIAR | typeof ROLES.ABOGADO, transaction?: Transaction) => {
  const candidatos = await usuariosDelRol(rol)
  if (!candidatos.length) return null
  const campo = rol === ROLES.AUXILIAR ? 'auxiliarId' : 'abogadoId'
  const ids = candidatos.map(u => u.id)

  const hoy = new Date()
  hoy.setUTCHours(5, 0, 0, 0) // medianoche de Bogotá
  const [abiertas, deHoy] = await Promise.all([
    Actuacion.findAll({ where: { [campo]: ids, estado: ABIERTAS }, attributes: [campo, [fn('COUNT', col('id')), 'total']], group: [campo], raw: true, transaction }),
    Actuacion.findAll({ where: { [campo]: ids, createdAt: { [Op.gte]: hoy } }, attributes: [campo, [fn('COUNT', col('id')), 'total']], group: [campo], raw: true, transaction })
  ])
  const cuenta = (filas: object[]) => new Map(filas.map(f => [Number((f as Record<string, unknown>)[campo]), Number((f as Record<string, unknown>).total)]))
  const carga = cuenta(abiertas)
  const hoyPor = cuenta(deHoy)

  const disponibles = candidatos.filter(u => !u.capacidadDiaria || (hoyPor.get(u.id) ?? 0) < u.capacidadDiaria)
  const lista = disponibles.length ? disponibles : candidatos
  lista.sort((a, b) => (carga.get(a.id) ?? 0) - (carga.get(b.id) ?? 0) || a.id - b.id)
  return lista[0].id
}
