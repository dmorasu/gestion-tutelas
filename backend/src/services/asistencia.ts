import { Op } from 'sequelize'
import { Actuacion, Asistencia, Rol, Usuario } from '../models'
import { parametro } from './parametros'
import { esDiaHabil, sumarDiasHabiles } from '../utils/diasHabiles'
import { enBogota, instanteBogota, sumarDias } from '../utils/fechaColombia'
import { ErrorNegocio } from '../utils/errores'

// =====================================
// EQUIPO MÍNIMO (D27, ANS-11)
// Cada día hábil, por rol, cuenta quién estuvo (y las ausencias justificadas del parámetro
// ASISTENCIA_JUSTIFICADA). El día cumple si todos los roles llegan a su mínimo. Un día hábil sin
// registro de asistencia cuenta como incumplido: la asistencia se lleva todos los días.
// =====================================

export const ESTADOS_ASISTENCIA = ['PRESENTE', 'AUSENTE', 'INCAPACIDAD', 'VACACIONES', 'PERMISO'] as const
export const ROLES_EQUIPO = ['COORDINADOR', 'REVISOR', 'AUXILIAR', 'ASISTENTE'] as const

// Personas activas del equipo con su rol del equipo mínimo (el primero que tengan en este orden)
const integrantes = async () => {
  const usuarios = await Usuario.findAll({
    where: { activo: true }, attributes: ['id', 'nombre'],
    include: [{ model: Rol, attributes: ['codigo'], through: { attributes: [] }, where: { codigo: [...ROLES_EQUIPO] } }],
    order: [['nombre', 'ASC']]
  })
  return usuarios.map(u => ({ id: u.id, nombre: u.nombre, rol: ROLES_EQUIPO.find(r => (u.roles ?? []).some(x => x.codigo === r))! }))
}

const resumenDia = (personas: { id: number, rol: string }[], registros: { usuarioId: number, estado: string }[]) => {
  const minimo = parametro<Record<string, number>>('EQUIPO_MINIMO')
  const justificadas = parametro<string[]>('ASISTENCIA_JUSTIFICADA')
  const porRol = ROLES_EQUIPO.map(rol => {
    const delRol = personas.filter(p => p.rol === rol)
    const estados = delRol.map(p => registros.find(r => r.usuarioId === p.id)?.estado)
    const presentes = estados.filter(e => e === 'PRESENTE').length
    const justificados = estados.filter(e => e && justificadas.includes(e)).length
    const requerido = minimo[rol] ?? 0
    return { rol, presentes, justificados, requerido, cumple: presentes + justificados >= requerido }
  })
  return { porRol, cumple: registros.length > 0 && porRol.every(r => r.cumple), registrado: registros.length > 0 }
}

export const asistenciaDelDia = async (fecha: string) => {
  const [personas, registros] = await Promise.all([integrantes(), Asistencia.findAll({ where: { fecha }, raw: true })])
  return {
    fecha, habil: esDiaHabil(fecha),
    personas: personas.map(p => ({ ...p, estado: registros.find(r => r.usuarioId === p.id)?.estado ?? null, observacion: registros.find(r => r.usuarioId === p.id)?.observacion ?? null })),
    ...resumenDia(personas, registros)
  }
}

export const guardarAsistencia = async (d: { fecha: string, registros: { usuarioId: number, estado: string, observacion?: string | null }[], usuarioId: number }) => {
  if (d.fecha > enBogota(new Date()).dia) throw new ErrorNegocio('No se registra asistencia de días que no han llegado')
  for (const r of d.registros) {
    if (!ESTADOS_ASISTENCIA.includes(r.estado as typeof ESTADOS_ASISTENCIA[number])) throw new ErrorNegocio(`Estado no válido: ${r.estado}`)
    await Asistencia.upsert({ fecha: d.fecha, usuarioId: r.usuarioId, estado: r.estado, observacion: r.observacion?.trim() || null, registradaPorId: d.usuarioId }, { conflictFields: ['fecha', 'usuarioId'] })
  }
  return asistenciaDelDia(d.fecha)
}

// ANS-11 del periodo: días hábiles (desde el acta de inicio y hasta ayer, o hoy si ya se registró)
export const medirEquipoMinimo = async (desde: string, hasta: string) => {
  const inicio = parametro<string>('FECHA_INICIO_PLAN')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return null
  const hoy = enBogota(new Date()).dia
  const ini = desde < inicio ? inicio : desde
  const [personas, registros] = await Promise.all([integrantes(), Asistencia.findAll({ where: { fecha: { [Op.between]: [ini, hasta] } }, raw: true })])
  const dias: { dia: string, cumple: boolean, detalle: string }[] = []
  for (let dia = ini; dia <= hasta; dia = sumarDias(dia, 1)) {
    if (!esDiaHabil(dia)) continue
    const delDia = registros.filter(r => r.fecha === dia)
    // Hoy solo cuenta si ya se registró (el día no ha terminado)
    if (dia === hoy && !delDia.length) continue
    if (dia > hoy) break
    const r = resumenDia(personas, delDia)
    const faltan = r.porRol.filter(x => !x.cumple).map(x => `${x.rol.toLowerCase()} ${x.presentes + x.justificados}/${x.requerido}`)
    dias.push({ dia, cumple: r.cumple, detalle: !r.registrado ? 'Sin registro de asistencia' : faltan.length ? `Por debajo del mínimo: ${faltan.join(', ')}` : '' })
  }
  return dias
}

// D27: a los 10 días hábiles del inicio, si no se ha asignado la mitad de los casos del plan, el
// equipo mínimo puede disminuir (aviso interno para el coordinador)
export const reduccionPosible = async () => {
  const inicio = parametro<string>('FECHA_INICIO_PLAN')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return null
  const corte = sumarDiasHabiles(inicio, 10)
  if (enBogota(new Date()).dia < corte) return null
  const asignadas = await Actuacion.count({ where: { fechaAsignacion: { [Op.lt]: instanteBogota(sumarDias(corte, 1), '00:00') } } })
  const total = parametro<number>('CASOS_TOTALES_PLAN')
  return asignadas < total / 2 ? { corte, asignadas, mitad: Math.ceil(total / 2) } : null
}
