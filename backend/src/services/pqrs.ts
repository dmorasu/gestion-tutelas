import { Actuacion, Caso } from '../models'
import { ErrorNegocio } from '../utils/errores'
import { registrarAsignacion } from './registroCasos'
import type { TipoPeticion } from './constantes'

// =====================================
// PQRS LIGADA A UNA TUTELA (D24)
// La tutela por un derecho de petición sin responder lleva siempre una PQRS ligada: se responde la
// petición, se entrega a la entidad para que la firme y la envíe al ciudadano (D22), y en la
// contestación se pide al juez hecho superado. La PQRS cuenta desde la misma asignación de la tutela
// (es parte de esa defensa); su vencimiento sale del tipo de petición y la fecha en que se radicó.
// =====================================
export const crearPqrsLigada = async (d: {
  casoId: number, radicado: string, tipoPeticion: TipoPeticion, fechaRadicacionPeticion: string | null, observaciones?: string | null, usuarioId: number
}) => {
  const tutela = await Caso.findByPk(d.casoId, { attributes: ['id', 'tipoSolicitud', 'juzgadoId'] })
  if (!tutela) throw new ErrorNegocio('El caso no existe', 404)
  if (tutela.tipoSolicitud === 'PQRS') throw new ErrorNegocio('Una PQRS no lleva otra PQRS ligada')
  const accion = await Actuacion.findOne({ where: { casoId: tutela.id }, order: [['fechaAsignacion', 'ASC']], attributes: ['fechaAsignacion'] })
  if (!accion) throw new ErrorNegocio('La tutela no tiene actuaciones')

  const r = await registrarAsignacion({
    radicado: d.radicado,
    tipoSolicitud: 'PQRS',
    etapa: 'PQRS',
    fechaAsignacion: accion.fechaAsignacion.toISOString(),
    fechaNotificacion: d.fechaRadicacionPeticion,
    tipoPeticion: d.tipoPeticion,
    casoRelacionadoId: tutela.id,
    observaciones: d.observaciones ?? null,
    sinAcuse: true
  }, d.usuarioId)
  await tutela.update({ porDerechoPeticion: true })
  return r
}
