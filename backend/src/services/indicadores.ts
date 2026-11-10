import { Op, type WhereOptions } from 'sequelize'
import { Actuacion, Alerta, Caso, Devolucion, Escrito, Equipo, Informe, SolicitudInsumo, Usuario } from '../models'
import { parametro } from './parametros'
import { limiteSolicitudInsumos } from './plazos'
import { enBogota, instanteBogota, sumarDias, textoFechaHora } from '../utils/fechaColombia'
import { contarDiasHabiles, esDiaHabil, sumarDiasHabiles } from '../utils/diasHabiles'
import { ESTADOS_ACTUACION, ETAPAS } from './constantes'

// =====================================
// INDICADORES (ANS) Y TABLERO DIARIO
// Cada ANS con la regla del manual (§21) y sus exclusiones documentadas: los casos asignados con
// menos de DIAS_MINIMOS_ANS01 días hábiles al vencimiento se miden solo por calidad; la espera de
// insumos ya está descontada en la fecha límite (el ANS se suspende mientras se esperan).
// Los plazos se comparan contra la fecha límite que había al entregar (escritos.limiteAns).
// ANS-11 (equipo mínimo) y ANS-12 (incidentes de datos) no se llevan en la app.
// =====================================

type Fila = { casoId: number, numeroInterno: string | null, radicado: string, detalle: string }
export type Indicador = {
  codigo: string, nombre: string, regla: string, meta: number | null, sentido: 'MIN' | 'MAX' | 'CERO'
  cumplen: number, total: number, porcentaje: number | null, cumple: boolean | null, fueraDeApp?: boolean, incumplidos: Fila[]
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null)
const fila = (caso: { id?: number, numeroInterno: string | null, radicado: string } | undefined, detalle: string): Fila =>
  ({ casoId: caso?.id ?? 0, numeroInterno: caso?.numeroInterno ?? null, radicado: caso?.radicado ?? '', detalle })

export const rango = (desde: string, hasta: string) => ({ ini: instanteBogota(desde, '00:00'), fin: instanteBogota(sumarDias(hasta, 1), '00:00') })

const META_POR_DEFECTO: Record<string, number> = { 'ANS-10': 100, 'ANS-13': 0 }
const meta = (codigo: string) => parametro<Record<string, number>>('META_ANS')[codigo] ?? META_POR_DEFECTO[codigo] ?? null

const armar = (codigo: string, nombre: string, regla: string, sentido: Indicador['sentido'], cumplen: number, total: number, incumplidos: Fila[]): Indicador => {
  const m = meta(codigo)
  const porcentaje = pct(cumplen, total)
  const cumple = sentido === 'CERO' ? total === 0
    : porcentaje === null || m === null ? null
      : sentido === 'MIN' ? porcentaje >= m : porcentaje <= m
  return { codigo, nombre, regla, meta: m, sentido, cumplen, total, porcentaje, cumple, incumplidos: incumplidos.slice(0, 50) }
}

// Con menos de N días hábiles entre la asignación y el vencimiento, el caso se mide solo por calidad
const asignadoSinHolgura = (a: Actuacion) => {
  if (!a.fechaVencimiento || !a.fechaAsignacionEfectiva) return false
  return sumarDiasHabiles(enBogota(a.fechaAsignacionEfectiva).dia, parametro<number>('DIAS_MINIMOS_ANS01'), a.etapa, true) > enBogota(a.fechaVencimiento).dia
}

const esCritica = (a: Actuacion) => a.criticidad === 'CRITICO' || parametro<string[]>('ETAPAS_CRITICAS').includes(a.etapa)

// El n-ésimo día hábil contando desde "dia" (el 1 es el primero hábil en o después de él)
const diaHabilNumero = (dia: string, n: number) => {
  let actual = dia
  let cuenta = esDiaHabil(actual) ? 1 : 0
  while (cuenta < n) { actual = sumarDias(actual, 1); if (esDiaHabil(actual)) cuenta++ }
  return actual
}

// Fechas límite de los informes de un periodo: semanal el 2.º día hábil de cada semana, mensual el
// 5.º día hábil de cada mes (correo del cliente, punto 5)
export const limiteInforme = (tipo: 'SEMANAL' | 'MENSUAL', desdePeriodo: string) => {
  // El informe de la semana (lunes) o del mes (día 1) que empieza en desdePeriodo se entrega en el
  // periodo siguiente
  const siguiente = tipo === 'SEMANAL' ? sumarDias(desdePeriodo, 7) : (() => {
    const [a, m] = desdePeriodo.split('-').map(Number)
    return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
  })()
  return instanteBogota(diaHabilNumero(siguiente, tipo === 'SEMANAL' ? 2 : 5), parametro<string>('HORA_FIN_DIA_ANS'))
}

export const calcularAns = async (desde: string, hasta: string): Promise<Indicador[]> => {
  const { ini, fin } = rango(desde, hasta)
  const enPeriodo = { [Op.gte]: ini, [Op.lt]: fin }
  const ahora = new Date()
  const conCaso = { model: Caso, attributes: ['id', 'numeroInterno', 'radicado', 'deOtroOperador'] }

  // Primeras entregas (V1) del periodo: ANS-01, 02 y 03
  const v1 = await Escrito.findAll({ where: { version: 1, fechaEntregaEntidad: enPeriodo }, include: [{ model: Actuacion, include: [conCaso] }] })
  const oportunidad = (filtro: (a: Actuacion) => boolean, conExclusion: boolean) => {
    let cumplen = 0, total = 0
    const malos: Fila[] = []
    for (const e of v1) {
      const a = e.actuacion!
      if (!filtro(a) || (conExclusion && asignadoSinHolgura(a))) continue
      const limite = e.limiteAns ?? a.fechaVencimiento
      if (!limite) continue
      total++
      const entrega = e.fechaEntregaEntidad!
      if (entrega <= limite && (!a.fechaVencimiento || entrega <= a.fechaVencimiento)) cumplen++
      else malos.push(fila(a.caso, `Entregado ${textoFechaHora(entrega)}; límite ${textoFechaHora(limite)}`))
    }
    return { cumplen, total, malos }
  }
  const ans01 = oportunidad(a => a.etapa === 'ACCION' && !esCritica(a), true)
  const ans02 = oportunidad(a => esCritica(a), false)
  // D14: el descorre (respuesta a la impugnación del accionante) cuenta si el parámetro lo dice
  const conDescorre = parametro<boolean>('ANS03_INCLUYE_DESCORRE')
  const ans03 = oportunidad(a => a.etapa === 'IMPUGNACION' && !esCritica(a) && (conDescorre || a.origenImpugnacion !== 'ACCIONANTE'), true)

  // ANS-04: avance del plan de choque (acumulado desde el acta de inicio)
  let ans04: Indicador
  const inicioPlan = parametro<string>('FECHA_INICIO_PLAN')
  if (/^\d{4}-\d{2}-\d{2}$/.test(inicioPlan)) {
    const finPlan = rango(inicioPlan, hasta).fin
    const [primeros, asignadas, conInsumosPendientes] = await Promise.all([
      Escrito.count({ where: { version: 1, fechaEntregaEntidad: { [Op.gte]: instanteBogota(inicioPlan, '00:00'), [Op.lt]: finPlan } } }),
      Actuacion.count({ where: { fechaAsignacion: { [Op.lt]: finPlan } } }),
      Actuacion.count({ where: { fechaAsignacion: { [Op.lt]: finPlan } }, include: [{ model: SolicitudInsumo, required: true, where: { minimo: true, fechaRecepcion: null }, attributes: [] }], distinct: true })
    ])
    const esperado = Math.min(parametro<number>('META_DIARIA_PLAN') * contarDiasHabiles(inicioPlan, hasta), asignadas - conInsumosPendientes)
    ans04 = armar('ANS-04', 'Avance del plan de choque', 'Primeros escritos acumulados frente al menor entre la meta del cronograma y los casos asignados con insumos', 'MIN', Math.min(primeros, esperado), esperado, [])
  } else {
    ans04 = { ...armar('ANS-04', 'Avance del plan de choque', 'Falta la fecha del acta de inicio (parámetro FECHA_INICIO_PLAN)', 'MIN', 0, 0, []), cumple: null }
  }

  // ANS-05: devoluciones de fondo frente a escritos entregados en el periodo
  const [entregados, fondo] = await Promise.all([
    Escrito.count({ where: { fechaEntregaEntidad: enPeriodo } }),
    Devolucion.findAll({ where: { tipo: 'FONDO', fechaDevolucion: enPeriodo }, include: [{ model: Escrito, include: [{ model: Actuacion, include: [conCaso] }] }] })
  ])
  const ans05 = armar('ANS-05', 'Calidad jurídica', 'Devoluciones de fondo frente a escritos entregados', 'MAX', fondo.length, entregados,
    fondo.map(d => fila(d.escrito?.actuacion?.caso, `Devolución de fondo${d.observacion ? `: ${d.observacion}` : ''}`)))

  // ANS-06: devoluciones de fondo cuyo plazo de corrección venció en el periodo
  const porCorregir = await Devolucion.findAll({
    where: { tipo: 'FONDO', fechaLimiteCorreccion: { [Op.gte]: ini, [Op.lt]: fin < ahora ? fin : ahora } },
    include: [{ model: Escrito, include: [{ model: Actuacion, include: [conCaso] }] }]
  })
  const malos06 = porCorregir.filter(d => !d.fechaNuevaEntrega || d.fechaNuevaEntrega > d.fechaLimiteCorreccion!)
  const ans06 = armar('ANS-06', 'Corrección de devoluciones', 'Corrección dentro del día hábil siguiente o antes del vencimiento', 'MIN',
    porCorregir.length - malos06.length, porCorregir.length, malos06.map(d => fila(d.escrito?.actuacion?.caso, d.fechaNuevaEntrega ? 'Corregida tarde' : 'Sin corregir')))

  // ANS-07: primera solicitud de insumos de cada actuación, dentro del día hábil siguiente a la asignación
  const solicitudes = await SolicitudInsumo.findAll({ where: { fechaSolicitud: enPeriodo }, include: [{ model: Actuacion, include: [conCaso] }], order: [['fechaSolicitud', 'ASC']] })
  const primeras = new Map<number, SolicitudInsumo>()
  for (const s of solicitudes) if (!primeras.has(s.actuacionId)) primeras.set(s.actuacionId, s)
  const malos07: Fila[] = []
  let cumplen07 = 0
  for (const s of primeras.values()) {
    const a = s.actuacion!
    if (s.fechaSolicitud! <= limiteSolicitudInsumos(a.fechaAsignacion, a.etapa)) cumplen07++
    else malos07.push(fila(a.caso, 'Insumos pedidos después del día hábil siguiente'))
  }
  const ans07 = armar('ANS-07', 'Solicitud oportuna de insumos', 'Dentro del día hábil siguiente a la asignación', 'MIN', cumplen07, primeras.size, malos07)

  // ANS-08: alertas emitidas a tiempo (las pendientes cuyo plazo ya pasó cuentan como incumplidas)
  const alertas = await Alerta.findAll({ where: { fechaDeteccion: enPeriodo, estado: { [Op.ne]: 'DESCARTADA' } }, include: [{ model: Caso, attributes: ['id', 'numeroInterno', 'radicado'] }] })
  const medibles = alertas.filter(x => x.fechaEmision || (x.fechaLimiteEmision && x.fechaLimiteEmision < ahora))
  const malos08 = medibles.filter(x => !x.fechaEmision || (x.fechaLimiteEmision && x.fechaEmision > x.fechaLimiteEmision))
  const ans08 = armar('ANS-08', 'Alertas tempranas', 'El mismo día hábil del conocimiento o el siguiente si ocurre después del corte', 'MIN',
    medibles.length - malos08.length, medibles.length, malos08.map(x => fila(x.caso, x.mensaje)))

  // ANS-10: informes que debían entregarse en el periodo
  const debidos: { tipo: 'SEMANAL' | 'MENSUAL', desde: string, limite: Date }[] = []
  for (let d = sumarDias(desde, -40); d <= hasta; d = sumarDias(d, 1)) {
    const fecha = new Date(`${d}T12:00:00Z`)
    const tipo = fecha.getUTCDay() === 1 ? 'SEMANAL' : fecha.getUTCDate() === 1 ? 'MENSUAL' : null
    if (!tipo) continue
    // Solo los periodos que terminan después del acta de inicio: antes no había servicio que reportar
    const terminaPeriodo = tipo === 'SEMANAL' ? sumarDias(d, 6) : sumarDias(new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 1)).toISOString().slice(0, 10), -1)
    if (/^\d{4}-\d{2}-\d{2}$/.test(inicioPlan) && terminaPeriodo < inicioPlan) continue
    const limite = limiteInforme(tipo, d)
    if (limite >= ini && limite < fin && limite < ahora) debidos.push({ tipo, desde: d, limite })
    if (fecha.getUTCDay() === 1 && fecha.getUTCDate() === 1) {
      const lm = limiteInforme('MENSUAL', d)
      if (lm >= ini && lm < fin && lm < ahora) debidos.push({ tipo: 'MENSUAL', desde: d, limite: lm })
    }
  }
  const informes = await Informe.findAll({ where: { desde: debidos.map(x => x.desde) }, attributes: ['tipo', 'desde', 'createdAt'] })
  const malos10 = debidos.filter(x => !informes.some(i => i.tipo === x.tipo && i.desde === x.desde && i.createdAt <= x.limite))
  const ans10 = armar('ANS-10', 'Reportes', 'Semanal el segundo día hábil; mensual en los cinco primeros días hábiles', 'MIN',
    debidos.length - malos10.length, debidos.length, malos10.map(x => ({ casoId: 0, numeroInterno: null, radicado: '', detalle: `Informe ${x.tipo.toLowerCase()} desde ${x.desde} no generado a tiempo` })))

  // ANS-13: escritos entregados sobre radicados de otro operador (meta: cero)
  const duplicados = await Escrito.findAll({
    where: { fechaEntregaEntidad: enPeriodo },
    include: [{ model: Actuacion, required: true, include: [{ ...conCaso, required: true, where: { deOtroOperador: true } }] }]
  })
  const ans13 = armar('ANS-13', 'No duplicidad', 'Escritos sobre radicados que el archivo maestro asigna a otro operador', 'CERO',
    0, duplicados.length, duplicados.map(e => fila(e.actuacion?.caso, 'Escrito entregado sobre un radicado de otro operador')))

  const fuera = (codigo: string, nombre: string): Indicador => ({ codigo, nombre, regla: 'Se mide fuera de la app', meta: meta(codigo), sentido: 'MIN', cumplen: 0, total: 0, porcentaje: null, cumple: null, fueraDeApp: true, incumplidos: [] })

  return [
    armar('ANS-01', 'Oportunidad de contestaciones', 'Al menos 1 día hábil antes del vencimiento si median 2 o más; si no, el día hábil siguiente', 'MIN', ans01.cumplen, ans01.total, ans01.malos),
    armar('ANS-02', 'Oportunidad en términos críticos', 'Dentro del día hábil siguiente a la asignación con insumos y antes del vencimiento', 'MIN', ans02.cumplen, ans02.total, ans02.malos),
    armar('ANS-03', 'Oportunidad de impugnaciones', 'Al menos 1 día hábil antes del vencimiento', 'MIN', ans03.cumplen, ans03.total, ans03.malos),
    ans04, ans05, ans06, ans07, ans08, ans10,
    fuera('ANS-11', 'Equipo mínimo'),
    fuera('ANS-12', 'Incidentes de seguridad y datos'),
    ans13
  ]
}

// ── Tablero diario (manual §26): cómo está hoy lo que ve cada perfil ──
const ABIERTA = { [Op.ne]: 'CERRADA' }
const SIN_ENTREGAR = ['POR_ASUMIR', 'EN_ANALISIS', 'EN_INSUMOS', 'EN_PROYECCION', 'EN_REVISION', 'AJUSTE_INTERNO', 'DEVUELTO']

export const tableroDiario = async (alcance: WhereOptions) => {
  const ahora = new Date()
  const hoy = instanteBogota(enBogota(ahora).dia, '00:00')
  const semana = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000)
  const abiertas = await Actuacion.findAll({
    where: { ...alcance, estado: ABIERTA },
    attributes: ['id', 'etapa', 'estado', 'criticidad', 'fechaLimiteEntrega', 'fechaVencimiento', 'auxiliarId', 'revisorId', 'equipoId', 'createdAt'],
    include: [{ model: Caso, attributes: ['deOtroOperador'] }]
  })
  const vencida = (a: Actuacion) => SIN_ENTREGAR.includes(a.estado) && !!(a.fechaLimiteEntrega ?? a.fechaVencimiento) && (a.fechaLimiteEntrega ?? a.fechaVencimiento)! < ahora

  const porEstado = Object.fromEntries(ESTADOS_ACTUACION.filter(e => e !== 'CERRADA').map(e => [e, abiertas.filter(a => a.estado === e).length]))
  const matriz = ETAPAS.filter(e => e !== 'PQRS').map(etapa => ({
    etapa,
    estados: Object.fromEntries(ESTADOS_ACTUACION.filter(e => e !== 'CERRADA').map(e => [e, abiertas.filter(a => a.etapa === etapa && a.estado === e).length]))
  }))

  // Carga por persona (auxiliares) y por equipo
  const [usuarios, equipos, entregadasSemana] = await Promise.all([
    Usuario.findAll({ where: { activo: true }, attributes: ['id', 'nombre', 'equipoId'] }),
    Equipo.findAll({ where: { activo: true }, attributes: ['id', 'nombre'] }),
    Escrito.findAll({ where: { fechaEntregaEntidad: { [Op.gte]: semana } }, attributes: ['id'], include: [{ model: Actuacion, where: alcance, attributes: ['auxiliarId', 'equipoId'] }] })
  ])
  const carga = (campo: 'auxiliarId' | 'equipoId', id: number) => {
    const suyas = abiertas.filter(a => a[campo] === id)
    return {
      abiertas: suyas.length,
      criticas: suyas.filter(a => a.criticidad === 'CRITICO').length,
      vencidas: suyas.filter(vencida).length,
      entregadasSemana: entregadasSemana.filter(e => e.actuacion?.[campo] === id).length
    }
  }
  const personas = usuarios
    .filter(u => abiertas.some(a => a.auxiliarId === u.id) || entregadasSemana.some(e => e.actuacion?.auxiliarId === u.id))
    .map(u => ({ id: u.id, nombre: u.nombre, equipo: equipos.find(e => e.id === u.equipoId)?.nombre ?? null, ...carga('auxiliarId', u.id) }))
    .sort((a, b) => b.abiertas - a.abiertas)
  const porEquipo = equipos.map(e => ({ id: e.id, nombre: e.nombre, ...carga('equipoId', e.id) })).filter(e => e.abiertas || e.entregadasSemana)

  return {
    totales: {
      abiertas: abiertas.length,
      asignadasHoy: abiertas.filter(a => a.createdAt >= hoy).length,
      criticas: abiertas.filter(a => a.criticidad === 'CRITICO').length,
      vencidas: abiertas.filter(vencida).length,
      pendientesInsumos: porEstado.EN_INSUMOS ?? 0,
      duplicados: abiertas.filter(a => a.caso?.deOtroOperador).length,
      entregadasSemana: entregadasSemana.length,
      sinAsignar: abiertas.filter(a => !a.auxiliarId).length
    },
    porEstado,
    matriz,
    personas,
    porEquipo,
    alertasPendientes: await Alerta.count({ where: { estado: 'PENDIENTE' } })
  }
}
