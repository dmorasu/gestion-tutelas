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

// Los insumos los piden solo el auxiliar de la actuación y el revisor (decisión de la firma): son
// quienes saben qué necesita el escrito. Ni asistencia ni coordinación los piden por ellos
export const exigirQuienPideInsumos = (req: Request, a: Responsables) => {
  if (a.auxiliarId !== req.usuario!.id && !esRevisorDe(req, a)) throw new ErrorNegocio('Los insumos los piden el auxiliar jurídico de la actuación o su revisor', 403)
}

// Reasignar (reunión 18-nov): el reparto es automático; el coordinador cambia cualquier responsable
// y el revisor mueve la actuación entre los auxiliares de su propio equipo, sin cambiar de equipo ni
// de revisor (eso ya es redistribuir entre equipos, que es del coordinador)
export const exigirQuienReasigna = (req: Request, a: Responsables, cambios: { auxiliarId?: unknown, revisorId?: unknown, equipoId?: unknown }, equipoDelNuevo: number | null | undefined) => {
  if (tieneRol(req, ROLES.COORDINADOR)) return
  if (!esRevisorDe(req, a)) throw new ErrorNegocio('Reasignan el coordinador o el revisor del equipo', 403)
  if ('revisorId' in cambios || 'equipoId' in cambios) throw new ErrorNegocio('Cambiar el revisor o el equipo es del coordinador', 403)
  if (!cambios.auxiliarId) throw new ErrorNegocio('Indique el auxiliar')
  if (!req.usuario!.equipoId || equipoDelNuevo !== req.usuario!.equipoId) throw new ErrorNegocio('El revisor reasigna solo entre los auxiliares de su equipo', 403)
}

// Al registrar, el reparto es automático. Solo el coordinador puede escoger a mano el auxiliar o el
// revisor; si otro perfil los manda, se ignoran y reparte el sistema
export const responsablesDelRegistro = <T extends { auxiliarId?: unknown, revisorId?: unknown }>(req: Request, datos: T): T =>
  tieneRol(req, ROLES.COORDINADOR) ? datos : { ...datos, auxiliarId: null, revisorId: null }

export const exigirRevisor = (req: Request, a: Responsables) => {
  if (tieneRol(req, ROLES.COORDINADOR)) return
  if (!esRevisorDe(req, a)) throw new ErrorNegocio('Solo el revisor del equipo o el coordinador pueden hacer esto', 403)
}
