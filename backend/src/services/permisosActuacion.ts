import type { Request } from 'express'
import { Op, type WhereOptions } from 'sequelize'
import { tieneRol } from '../middleware/auth'
import { ROLES } from './constantes'
import { ErrorNegocio } from '../utils/errores'

type Responsables = { auxiliarId: number | null, revisorId: number | null, equipoId: number | null }

// =====================================
// QUIÉN PUEDE QUÉ EN UNA ACTUACIÓN (roles del cliente)
// Auxiliar: la suya. Revisor: las que revisa y las de su equipo. Asistencia y coordinación: todas.
// Entregar y devolver al auxiliar: revisor o coordinador.
// =====================================

const esRevisorDe = (req: Request, a: Responsables) =>
  tieneRol(req, ROLES.REVISOR) && (a.revisorId === req.usuario!.id || (!!a.equipoId && a.equipoId === req.usuario!.equipoId))

// Lo que ve cada perfil en tableros y listados: coordinación y asistencia, todo; el revisor, lo de
// su equipo y lo que revisa (seguimiento de las personas a cargo); el auxiliar, lo suyo
export const alcanceActuaciones = (req: Request): WhereOptions => {
  if (tieneRol(req, ROLES.COORDINADOR, ROLES.ASISTENTE)) return {}
  const id = req.usuario!.id
  const condiciones: WhereOptions[] = [{ auxiliarId: id }]
  if (tieneRol(req, ROLES.REVISOR)) {
    condiciones.push({ revisorId: id })
    if (req.usuario!.equipoId) condiciones.push({ equipoId: req.usuario!.equipoId })
  }
  return { [Op.or]: condiciones }
}

export const exigirResponsable = (req: Request, a: Responsables) => {
  if (tieneRol(req, ROLES.COORDINADOR, ROLES.ASISTENTE)) return
  if (a.auxiliarId !== req.usuario!.id && !esRevisorDe(req, a)) throw new ErrorNegocio('Esta actuación no está asignada a usted', 403)
}

export const exigirRevisor = (req: Request, a: Responsables) => {
  if (tieneRol(req, ROLES.COORDINADOR)) return
  if (!esRevisorDe(req, a)) throw new ErrorNegocio('Solo el revisor del equipo o el coordinador pueden hacer esto', 403)
}
