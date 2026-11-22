import { Op, type WhereOptions } from 'sequelize'
import { Actuacion, Caso, HistorialCaso, Usuario } from '../models'
import { enBogota, instanteBogota, sumarDias } from '../utils/fechaColombia'
import { productividadDelDia } from './tiempos'

// =====================================
// CIERRE DEL DÍA: CAPACIDAD DE RESPUESTA
// Qué movió cada persona en el día y en qué casos. Sale de la bitácora (cada cambio de estado de la
// actuación queda con quién lo hizo y a qué hora), así que cuenta también lo que se hizo y luego se
// deshizo: una V1 devuelta por el revisor y vuelta a enviar cuenta dos envíos, que fue el trabajo real.
// La capacidad de cada auxiliar es su capacidad diaria (Usuarios); lo que responde es lo que envía a revisión.
// =====================================

// Movimientos que interesan, según el estado al que pasó la actuación
const MOVIMIENTOS: Record<string, string> = {
  EN_ANALISIS: 'Tomó el caso',
  EN_INSUMOS: 'Pidió insumos',
  EN_REVISION: 'Envió a revisión',
  AJUSTE_INTERNO: 'Devolvió al auxiliar',
  ENTREGADO: 'Entregó a la entidad',
  APROBADO: 'Registró la aprobación',
  DEVUELTO: 'Registró la devolución de la entidad',
  RADICADO: 'Registró la radicación',
  CERRADA: 'Cerró la actuación'
}

const SIN_ENTREGAR = ['POR_ASUMIR', 'EN_ANALISIS', 'EN_INSUMOS', 'EN_PROYECCION', 'EN_REVISION', 'AJUSTE_INTERNO', 'DEVUELTO']

export const cierreDelDia = async (alcance: WhereOptions, dia = enBogota(new Date()).dia) => {
  const ini = instanteBogota(dia, '00:00')
  const fin = instanteBogota(sumarDias(dia, 1), '00:00')

  const registros = await HistorialCaso.findAll({
    where: { seccion: 'ACTUACION', accion: 'MODIFICADO', actuacionId: { [Op.ne]: null }, createdAt: { [Op.gte]: ini, [Op.lt]: fin } },
    attributes: ['actuacionId', 'cambios', 'usuarioId', 'nombreUsuario', 'createdAt'],
    order: [['createdAt', 'ASC']]
  })
  const cambiosDeEstado = registros.flatMap(r => {
    const estado = r.cambios.find(c => c.campo === 'Estado')?.despues
    return estado && MOVIMIENTOS[estado] && r.usuarioId ? [{ actuacionId: r.actuacionId!, estado, usuarioId: r.usuarioId, nombre: r.nombreUsuario, hora: r.createdAt as Date }] : []
  })

  // Solo lo que el perfil puede ver; las recibidas en el día cuentan aunque nadie las haya movido
  const actuaciones = await Actuacion.findAll({
    where: { [Op.and]: [alcance, { [Op.or]: [{ id: [...new Set(cambiosDeEstado.map(c => c.actuacionId))] }, { fechaAsignacion: { [Op.gte]: ini, [Op.lt]: fin } }] }] },
    attributes: ['id', 'casoId', 'etapa', 'estado', 'fechaAsignacion', 'fechaLimiteEntrega', 'auxiliarId'],
    include: [{ model: Caso, attributes: ['id', 'numeroInterno', 'radicado'] }]
  })
  const porId = new Map(actuaciones.map(a => [a.id, a]))
  const movimientos = cambiosDeEstado.filter(m => porId.has(m.actuacionId)).map(m => {
    const a = porId.get(m.actuacionId)!
    // Tiempo de respuesta: desde que llegó la asignación hasta el envío a revisión o la entrega
    const responde = m.estado === 'EN_REVISION' || m.estado === 'ENTREGADO'
    return {
      hora: m.hora, usuarioId: m.usuarioId, nombre: m.nombre, estado: m.estado, accion: MOVIMIENTOS[m.estado],
      casoId: a.casoId, numeroInterno: a.caso?.numeroInterno ?? null, radicado: a.caso?.radicado ?? '', etapa: a.etapa, actuacionId: a.id,
      horasDesdeAsignacion: responde ? Math.round((m.hora.getTime() - a.fechaAsignacion.getTime()) / 36e5 * 10) / 10 : null,
      aTiempo: responde && a.fechaLimiteEntrega ? m.hora <= a.fechaLimiteEntrega : null
    }
  })

  // Productividad (fase 7): escritos elaborados y corregidos con su tiempo, revisiones y registros
  const productividad = await productividadDelDia(dia, { alcance })
  // Pendientes al cierre de cada auxiliar (sin entregar), para ver con qué queda para mañana
  const ids = [...new Set([...movimientos.map(m => m.usuarioId), ...actuaciones.map(a => a.auxiliarId).filter((x): x is number => !!x), ...productividad.keys()])]
  const [usuarios, pendientes] = await Promise.all([
    Usuario.findAll({ where: { id: ids }, attributes: ['id', 'nombre', 'capacidadDiaria'] }),
    Actuacion.findAll({ where: { [Op.and]: [alcance, { auxiliarId: ids, estado: SIN_ENTREGAR }] }, attributes: ['auxiliarId', 'fechaLimiteEntrega'] })
  ])
  const cuenta = (id: number, estado: string) => new Set(movimientos.filter(m => m.usuarioId === id && m.estado === estado).map(m => m.actuacionId)).size
  const personas = usuarios.map(u => {
    const enviadas = movimientos.filter(m => m.usuarioId === u.id && m.estado === 'EN_REVISION').length
    const suyas = pendientes.filter(p => p.auxiliarId === u.id)
    return {
      id: u.id,
      nombre: u.nombre,
      capacidadDiaria: u.capacidadDiaria,
      recibidas: actuaciones.filter(a => a.auxiliarId === u.id && a.fechaAsignacion >= ini && a.fechaAsignacion < fin).length,
      tomadas: cuenta(u.id, 'EN_ANALISIS'),
      insumos: cuenta(u.id, 'EN_INSUMOS'),
      enviadasRevision: enviadas,
      devueltasAuxiliar: movimientos.filter(m => m.usuarioId === u.id && m.estado === 'AJUSTE_INTERNO').length,
      entregadas: movimientos.filter(m => m.usuarioId === u.id && m.estado === 'ENTREGADO').length,
      // Lo respondido frente a lo que la persona puede sacar en un día
      usoCapacidad: u.capacidadDiaria ? Math.round((enviadas / u.capacidadDiaria) * 100) : null,
      pendientes: suyas.length,
      vencidas: suyas.filter(p => p.fechaLimiteEntrega && p.fechaLimiteEntrega < new Date()).length,
      productividad: productividad.get(u.id) ?? null
    }
  }).filter(p => p.recibidas || p.tomadas || p.insumos || p.enviadasRevision || p.devueltasAuxiliar || p.entregadas || p.pendientes || p.productividad)
    .sort((a, b) => (b.enviadasRevision + b.entregadas) - (a.enviadasRevision + a.entregadas) || a.nombre.localeCompare(b.nombre))

  const respuestas = movimientos.filter(m => m.horasDesdeAsignacion !== null)
  return {
    dia,
    totales: {
      recibidas: actuaciones.filter(a => a.fechaAsignacion >= ini && a.fechaAsignacion < fin).length,
      enviadasRevision: movimientos.filter(m => m.estado === 'EN_REVISION').length,
      devueltasAuxiliar: movimientos.filter(m => m.estado === 'AJUSTE_INTERNO').length,
      entregadas: movimientos.filter(m => m.estado === 'ENTREGADO').length,
      aTiempo: respuestas.filter(m => m.aTiempo === true).length,
      tarde: respuestas.filter(m => m.aTiempo === false).length
    },
    personas,
    movimientos: movimientos.reverse()
  }
}
