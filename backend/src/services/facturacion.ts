import { Op } from 'sequelize'
import { Caso, CasoRelacion, Juzgado } from '../models'

// =====================================
// RELACIÓN DE CASOS PARA LA FACTURA (reunión 18-nov)
// Cada radicado se factura una sola vez, en el mes de su primera asignación (Caso.fechaFacturacion),
// con la etapa con la que llegó. Lo que se asigne después del mismo radicado va incluido en ese pago.
// Dos radicados que son el mismo proceso (relación MISMO_PROCESO confirmada) también se facturan una
// vez: el que llegó primero. Los que se unieron ya son un solo caso. La temeridad y los antecedentes
// son radicados distintos: cada uno se factura.
// =====================================
export const casosAFacturar = async (ini: Date, fin: Date) => {
  const casos = await Caso.findAll({
    where: { fechaFacturacion: { [Op.gte]: ini, [Op.lt]: fin } },
    attributes: ['id', 'numeroInterno', 'radicado', 'etapaInicial', 'fechaFacturacion', 'deOtroOperador', 'radicadosAlternos', 'juzgadoId'],
    include: [{ model: Juzgado, attributes: ['nombre'] }],
    order: [['fechaFacturacion', 'ASC'], ['id', 'ASC']]
  })
  const ids = casos.map(c => c.id)
  const relaciones = ids.length
    ? await CasoRelacion.findAll({ where: { tipo: 'MISMO_PROCESO', estado: 'CONFIRMADA', [Op.or]: [{ casoId: ids }, { relacionadoId: ids }] }, attributes: ['casoId', 'relacionadoId'] })
    : []
  const otrosIds = [...new Set(relaciones.flatMap(r => [r.casoId, r.relacionadoId]))]
  const otros = new Map((await Caso.findAll({ where: { id: otrosIds }, attributes: ['id', 'numeroInterno', 'radicado', 'fechaFacturacion'] })).map(c => [c.id, c]))
  // El caso va incluido en el pago de otro del mismo proceso que llegó antes (a igual fecha, el de id menor)
  const antes = (a: Caso, b: Caso) => {
    const fa = a.fechaFacturacion?.getTime() ?? Infinity
    const fb = b.fechaFacturacion?.getTime() ?? Infinity
    return fa < fb || (fa === fb && a.id < b.id)
  }
  const facturables: Caso[] = []
  const incluidos: { caso: Caso, con: { numeroInterno: string | null, radicado: string } }[] = []
  for (const caso of casos) {
    const primero = relaciones
      .map(r => otros.get(r.casoId === caso.id ? r.relacionadoId : r.relacionadoId === caso.id ? r.casoId : 0))
      .filter((o): o is Caso => !!o && antes(o, caso))
      .sort((a, b) => (antes(a, b) ? -1 : 1))[0]
    if (primero) incluidos.push({ caso, con: { numeroInterno: primero.numeroInterno, radicado: primero.radicado } })
    else facturables.push(caso)
  }
  return { facturables, incluidos }
}
