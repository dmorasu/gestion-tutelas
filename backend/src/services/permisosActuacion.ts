import type { Request } from 'express'
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

export const exigirResponsable = (req: Request, a: Responsables) => {
  if (tieneRol(req, ROLES.COORDINADOR, ROLES.ASISTENTE)) return
  if (a.auxiliarId !== req.usuario!.id && !esRevisorDe(req, a)) throw new ErrorNegocio('Esta actuación no está asignada a usted', 403)
}

export const exigirRevisor = (req: Request, a: Responsables) => {
  if (tieneRol(req, ROLES.COORDINADOR)) return
  if (!esRevisorDe(req, a)) throw new ErrorNegocio('Solo el revisor del equipo o el coordinador pueden hacer esto', 403)
}
