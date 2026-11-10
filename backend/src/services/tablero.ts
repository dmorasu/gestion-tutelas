import { QueryTypes } from 'sequelize'
import { db } from '../config/db'
import { AnsPeriodo } from '../models'
import { calcularAns } from './indicadores'
import { nivelDe, reincidentes, totalDescuento } from './descuentos'
import { parametro } from './parametros'
import { NOMBRES_ETAPAS, TIPOS_ESCRITO } from './constantes'
import { enBogota, sumarDias } from '../utils/fechaColombia'
import { reduccionPosible } from './asistencia'

// =====================================
// TABLERO DE LA OPERACIÓN (D28)
// Vistas en el esquema "tablero" de Postgres: las lee Power BI con un usuario de solo lectura
// (Docs/tablero/USUARIO_LECTURA.sql) y la pantalla Tablero de la app con las mismas consultas.
// Una sola fuente: lo que ve el cliente en Power BI y lo que se ve en la app no pueden diferir.
// Los descuentos (D29) son internos: van en el esquema "tablero_interno", que no se comparte.
// Las vistas se rehacen al arrancar la API (idempotente); la del ANS lee la foto mensual
// (ans_periodos), que se refresca cada 30 minutos con el cálculo de services/indicadores.
// =====================================

const LECTOR = process.env.TABLERO_USUARIO_LECTURA || 'tablero_lectura'

// Nombres legibles en SQL a partir de las constantes de la app (una sola lista de nombres)
const casoTexto = (columna: string, nombres: Record<string, string>) =>
  `CASE ${columna} ${Object.entries(nombres).map(([k, v]) => `WHEN '${k}' THEN '${v.replace(/'/g, "''")}'`).join(' ')} ELSE ${columna} END`

const dia = (columna: string) => `(${columna} AT TIME ZONE 'America/Bogota')::date`
const param = (clave: string) => `(SELECT (valor #>> '{}')::numeric FROM parametros WHERE clave = '${clave}')`

// A tiempo: igual que ANS-01/02/03 (contra el límite al entregar y nunca después del vencimiento)
const aTiempo = (entrega: string, limite: string, vencimiento: string) =>
  `CASE WHEN ${entrega} IS NULL OR COALESCE(${limite}, ${vencimiento}) IS NULL THEN NULL
        ELSE ${entrega} <= COALESCE(${limite}, ${vencimiento}) AND (${vencimiento} IS NULL OR ${entrega} <= ${vencimiento}) END`

const VISTAS: Record<string, string> = {
  'tablero.casos': `
    SELECT c.id, c."numeroInterno" AS numero_interno, c.radicado, c."tipoSolicitud" AS tipo_solicitud,
      c."calidadEntidad" AS calidad_entidad, ${casoTexto('c."etapaInicial"', NOMBRES_ETAPAS)} AS etapa_inicial,
      ${casoTexto('c."etapaActual"', NOMBRES_ETAPAS)} AS etapa_actual, c.estado, c."createdAt" AS fecha_registro,
      ${dia('c."createdAt"')} AS dia_registro, c."fechaCierre" AS fecha_cierre, c."motivoCierre" AS motivo_cierre,
      j.nombre AS juzgado, c."deOtroOperador" AS de_otro_operador,
      (SELECT string_agg(p.nombre, '; ') FROM partes p WHERE p."casoId" = c.id AND p.rol = 'ACCIONANTE') AS accionantes
    FROM casos c LEFT JOIN juzgados j ON j.id = c."juzgadoId"`,

  'tablero.actuaciones': `
    SELECT a.id, a."casoId" AS caso_id, c."numeroInterno" AS numero_interno, c.radicado, c."tipoSolicitud" AS tipo_solicitud,
      a.etapa, ${casoTexto('a.etapa', NOMBRES_ETAPAS)} AS etapa_nombre, a.estado, a.criticidad,
      a."fechaAsignacion" AS fecha_asignacion, ${dia('a."fechaAsignacion"')} AS dia_asignacion,
      a."fechaVencimiento" AS fecha_vencimiento, a."fechaLimiteEntrega" AS fecha_limite_entrega, a."fechaCierre" AS fecha_cierre,
      a.estado <> 'CERRADA' AS abierta,
      a."datosFaltantesPendientes" AS esperando_datos, a."origenImpugnacion" AS origen_impugnacion,
      aux.nombre AS auxiliar, rev.nombre AS revisor, eq.nombre AS equipo,
      v1."fechaEntregaEntidad" AS fecha_entrega_v1, ${dia('v1."fechaEntregaEntidad"')} AS dia_entrega_v1,
      ${aTiempo('v1."fechaEntregaEntidad"', 'v1."limiteAns"', 'a."fechaVencimiento"')} AS v1_a_tiempo,
      CASE WHEN a.estado = 'CERRADA' THEN NULL
        WHEN COALESCE(a."fechaLimiteEntrega", a."fechaVencimiento") IS NULL THEN 'SIN_FECHA'
        WHEN COALESCE(a."fechaLimiteEntrega", a."fechaVencimiento") < now() THEN 'VENCIDO'
        WHEN COALESCE(a."fechaLimiteEntrega", a."fechaVencimiento") < now() + make_interval(hours => ${param('SEMAFORO_HORAS_ROJO')}::int) THEN 'ROJO'
        WHEN COALESCE(a."fechaLimiteEntrega", a."fechaVencimiento") < now() + make_interval(hours => ${param('SEMAFORO_HORAS_AMARILLO')}::int) THEN 'AMARILLO'
        ELSE 'VERDE' END AS semaforo,
      (${dia('COALESCE(a."fechaCierre", now())')} - ${dia('a."fechaAsignacion"')}) AS dias_abierta
    FROM actuaciones a
    JOIN casos c ON c.id = a."casoId"
    LEFT JOIN usuarios aux ON aux.id = a."auxiliarId"
    LEFT JOIN usuarios rev ON rev.id = a."revisorId"
    LEFT JOIN equipos eq ON eq.id = a."equipoId"
    LEFT JOIN escritos v1 ON v1."actuacionId" = a.id AND v1.version = 1`,

  'tablero.entregas': `
    SELECT e.id, e."actuacionId" AS actuacion_id, a."casoId" AS caso_id, c."numeroInterno" AS numero_interno, c.radicado,
      a.etapa, ${casoTexto('a.etapa', NOMBRES_ETAPAS)} AS etapa_nombre, ${casoTexto('e.tipo', TIPOS_ESCRITO)} AS tipo_escrito,
      e.version, e.estado, e."fechaEntregaEntidad" AS fecha_entrega, ${dia('e."fechaEntregaEntidad"')} AS dia_entrega,
      e."limiteAns" AS limite_ans, ${aTiempo('e."fechaEntregaEntidad"', 'e."limiteAns"', 'a."fechaVencimiento"')} AS a_tiempo,
      e."fechaAprobacion" AS fecha_aprobacion, aux.nombre AS auxiliar, rev.nombre AS revisor, eq.nombre AS equipo,
      (SELECT count(*) FROM devoluciones d WHERE d."escritoId" = e.id AND d.tipo = 'FONDO')::int AS devoluciones_fondo
    FROM escritos e
    JOIN actuaciones a ON a.id = e."actuacionId"
    JOIN casos c ON c.id = a."casoId"
    LEFT JOIN usuarios aux ON aux.id = e."elaboradoPorId"
    LEFT JOIN usuarios rev ON rev.id = e."revisadoPorId"
    LEFT JOIN equipos eq ON eq.id = a."equipoId"
    WHERE e."fechaEntregaEntidad" IS NOT NULL`,

  'tablero.devoluciones': `
    SELECT d.id, d."escritoId" AS escrito_id, a."casoId" AS caso_id, c."numeroInterno" AS numero_interno, c.radicado,
      ${casoTexto('a.etapa', NOMBRES_ETAPAS)} AS etapa_nombre, e.version, d.tipo, d."fechaDevolucion" AS fecha_devolucion,
      ${dia('d."fechaDevolucion"')} AS dia_devolucion, d.extemporanea, d."fechaLimiteCorreccion" AS fecha_limite_correccion,
      d."fechaNuevaEntrega" AS fecha_nueva_entrega,
      CASE WHEN d."fechaNuevaEntrega" IS NULL THEN NULL ELSE d."fechaNuevaEntrega" <= d."fechaLimiteCorreccion" END AS corregida_a_tiempo,
      m.nombre AS motivo
    FROM devoluciones d
    JOIN escritos e ON e.id = d."escritoId"
    JOIN actuaciones a ON a.id = e."actuacionId"
    JOIN casos c ON c.id = a."casoId"
    LEFT JOIN motivos_devolucion m ON m.id = d."motivoId"`,

  'tablero.alertas': `
    SELECT al.id, al.tipo, al."casoId" AS caso_id, c."numeroInterno" AS numero_interno, c.radicado, al.estado,
      al."fechaDeteccion" AS fecha_deteccion, ${dia('al."fechaDeteccion"')} AS dia_deteccion,
      al."fechaLimiteEmision" AS fecha_limite_emision, al."fechaEmision" AS fecha_emision,
      CASE WHEN al."fechaEmision" IS NULL THEN NULL ELSE al."fechaEmision" <= al."fechaLimiteEmision" END AS emitida_a_tiempo
    FROM alertas al JOIN casos c ON c.id = al."casoId"`,

  'tablero.fallos': `
    SELECT d.id, d."actuacionId" AS actuacion_id, a."casoId" AS caso_id, c."numeroInterno" AS numero_interno, c.radicado,
      ${casoTexto('a.etapa', NOMBRES_ETAPAS)} AS etapa_nombre, d.instancia, d.sentido, d.favorable,
      d."fechaDecision" AS fecha_decision, d."fechaNotificacion" AS fecha_notificacion, d."fechaVenceImpugnacion" AS vence_impugnacion,
      d."requiereCumplimiento" AS requiere_cumplimiento, d."actuacionCumplimientoId" AS actuacion_cumplimiento_id
    FROM decisiones d
    JOIN actuaciones a ON a.id = d."actuacionId"
    JOIN casos c ON c.id = a."casoId"`,

  'tablero.ans': `
    SELECT mes, codigo, nombre, sentido, meta, cumplen, total, porcentaje, cumple, "fueraDeApp" AS fuera_de_app, "updatedAt" AS actualizado
    FROM ans_periodos`,

  // Internas: descuentos y casos sin remuneración. No se le dan permisos al lector de Power BI
  'tablero_interno.descuentos': `
    SELECT mes, codigo, nombre, porcentaje, meta, nivel, descuento, "updatedAt" AS actualizado
    FROM ans_periodos WHERE nivel IS NOT NULL`,

  'tablero_interno.sin_remuneracion': `
    SELECT d.id AS decision_id, a."casoId" AS caso_id, c."numeroInterno" AS numero_interno, c.radicado,
      d.instancia, d.sentido, d."fechaDecision" AS fecha_decision
    FROM decisiones d
    JOIN actuaciones a ON a.id = d."actuacionId"
    JOIN casos c ON c.id = a."casoId"
    WHERE d."sancionAtribuible"`
}

// sync({ alter }) vuelve a alterar el tipo de todas las columnas y Postgres no lo deja en columnas
// que usa una vista: en desarrollo se borran antes del sync y se recrean después
export const borrarVistasTablero = async () => {
  for (const nombre of Object.keys(VISTAS).reverse()) await db.query(`DROP VIEW IF EXISTS ${nombre} CASCADE`)
}

// Se rehacen en cada arranque: si cambió una columna, CREATE OR REPLACE no basta (no deja quitar
// ni reordenar). Los permisos se vuelven a dar al lector si el usuario existe
export const crearVistasTablero = async () => {
  await db.transaction(async transaction => {
    await db.query('CREATE SCHEMA IF NOT EXISTS tablero', { transaction })
    await db.query('CREATE SCHEMA IF NOT EXISTS tablero_interno', { transaction })
    for (const nombre of Object.keys(VISTAS).reverse()) await db.query(`DROP VIEW IF EXISTS ${nombre} CASCADE`, { transaction })
    for (const [nombre, sql] of Object.entries(VISTAS)) await db.query(`CREATE VIEW ${nombre} AS ${sql}`, { transaction })
    await db.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${LECTOR}') THEN
        GRANT USAGE ON SCHEMA tablero TO ${LECTOR};
        GRANT SELECT ON ALL TABLES IN SCHEMA tablero TO ${LECTOR};
      END IF;
    END $$`, { transaction })
  })
}

// ── Foto mensual del ANS ──
const mesDe = (fecha: string) => fecha.slice(0, 7)
const primerDia = (mes: string) => `${mes}-01`
const ultimoDia = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return sumarDias(m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`, -1)
}
const mesAnterior = (mes: string) => mesDe(sumarDias(primerDia(mes), -1))

const conServicio = (mes: string) => {
  const inicio = parametro<string>('FECHA_INICIO_PLAN')
  return /^\d{4}-\d{2}-\d{2}$/.test(inicio) && mes >= mesDe(inicio)
}

let refrescadoEn = 0
let refrescando: Promise<void> | null = null

// El mes en curso (hasta hoy) y el anterior (puede recibir devoluciones o informes tardíos)
export const refrescarAns = async (forzar = false) => {
  if (!forzar && Date.now() - refrescadoEn < 30 * 60_000) return
  if (refrescando) return refrescando
  refrescando = (async () => {
    const hoy = enBogota(new Date()).dia
    const actual = mesDe(hoy)
    for (const mes of [mesAnterior(actual), actual]) {
      const hasta = mes === actual ? hoy : ultimoDia(mes)
      const indicadores = await calcularAns(primerDia(mes), hasta)
      for (const i of indicadores) {
        // D29: sin acta de inicio, o antes de su mes, no hay servicio que descontar
        const { nivel, descuento } = i.fueraDeApp || !conServicio(mes) ? { nivel: null, descuento: 0 } : nivelDe(i)
        await AnsPeriodo.upsert({
          mes, codigo: i.codigo, nombre: i.nombre, sentido: i.sentido, meta: i.meta, cumplen: i.cumplen, total: i.total,
          porcentaje: i.porcentaje, cumple: i.cumple, fueraDeApp: !!i.fueraDeApp, nivel, descuento: nivel ? descuento : null
        }, { conflictFields: ['mes', 'codigo'] })
      }
    }
    refrescadoEn = Date.now()
  })().finally(() => { refrescando = null })
  return refrescando
}

// ── Datos de la pantalla (las mismas vistas de Power BI) ──
const consulta = <T extends object>(sql: string, replacements: Record<string, unknown> = {}) =>
  db.query<T>(sql, { type: QueryTypes.SELECT, replacements })

const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export const datosTablero = async (d: { interno: boolean }) => {
  await refrescarAns().catch(error => console.error('❌ ANS del tablero', error))
  const hoy = enBogota(new Date()).dia
  const mes = mesDe(hoy)
  const desde30 = sumarDias(hoy, -29)

  const [kpis] = await consulta<Record<string, unknown>>(`
    SELECT
      count(*) FILTER (WHERE abierta)::int AS abiertas,
      count(*) FILTER (WHERE estado = 'POR_ASUMIR')::int AS por_asumir,
      count(*) FILTER (WHERE abierta AND semaforo = 'VENCIDO')::int AS vencidas,
      count(*) FILTER (WHERE abierta AND criticidad = 'CRITICO')::int AS criticas,
      count(*) FILTER (WHERE abierta AND esperando_datos)::int AS esperando_datos,
      count(*) FILTER (WHERE dia_asignacion = :hoy)::int AS asignadas_hoy,
      count(*) FILTER (WHERE to_char(dia_asignacion, 'YYYY-MM') = :mes)::int AS asignadas_mes,
      count(*) FILTER (WHERE dia_entrega_v1 = :hoy)::int AS primeras_hoy,
      count(*) FILTER (WHERE to_char(dia_entrega_v1, 'YYYY-MM') = :mes)::int AS primeras_mes,
      count(*) FILTER (WHERE to_char(dia_entrega_v1, 'YYYY-MM') = :mes AND v1_a_tiempo)::int AS primeras_mes_a_tiempo
    FROM tablero.actuaciones`, { hoy, mes })
  const [extra] = await consulta<Record<string, unknown>>(`
    SELECT
      (SELECT count(*) FROM tablero.devoluciones WHERE tipo = 'FONDO' AND to_char(dia_devolucion, 'YYYY-MM') = :mes)::int AS devoluciones_fondo_mes,
      (SELECT count(*) FROM tablero.alertas WHERE estado = 'PENDIENTE')::int AS alertas_pendientes,
      (SELECT count(*) FROM tablero.fallos WHERE requiere_cumplimiento AND actuacion_cumplimiento_id IS NULL)::int AS cumplimientos_pendientes`, { mes })

  const [porEtapa, semaforo, porEquipo, diario, ans] = await Promise.all([
    consulta<{ etapa: string, etapa_nombre: string, abiertas: number, vencidas: number }>(`
      SELECT etapa, etapa_nombre, count(*)::int AS abiertas, count(*) FILTER (WHERE semaforo = 'VENCIDO')::int AS vencidas
      FROM tablero.actuaciones WHERE abierta GROUP BY etapa, etapa_nombre ORDER BY abiertas DESC`),
    consulta<{ semaforo: string, total: number }>(`SELECT semaforo, count(*)::int AS total FROM tablero.actuaciones WHERE abierta GROUP BY semaforo`),
    consulta<{ equipo: string, abiertas: number, vencidas: number, rojas: number }>(`
      SELECT COALESCE(equipo, 'Sin equipo') AS equipo, count(*)::int AS abiertas,
        count(*) FILTER (WHERE semaforo = 'VENCIDO')::int AS vencidas, count(*) FILTER (WHERE semaforo = 'ROJO')::int AS rojas
      FROM tablero.actuaciones WHERE abierta GROUP BY 1 ORDER BY abiertas DESC`),
    // Asignaciones y primeras entregas por día (30 días), con los días sin movimiento en cero
    consulta<{ dia: string, asignadas: number, entregadas: number, a_tiempo: number }>(`
      SELECT to_char(g.dia, 'YYYY-MM-DD') AS dia,
        (SELECT count(*) FROM tablero.actuaciones WHERE dia_asignacion = g.dia)::int AS asignadas,
        (SELECT count(*) FROM tablero.entregas WHERE dia_entrega = g.dia AND version = 1)::int AS entregadas,
        (SELECT count(*) FROM tablero.entregas WHERE dia_entrega = g.dia AND version = 1 AND a_tiempo)::int AS a_tiempo
      FROM generate_series(CAST(:desde AS date), CAST(:hoy AS date), interval '1 day') AS g(dia) ORDER BY g.dia`, { desde: desde30, hoy }),
    consulta<Record<string, unknown>>(`SELECT * FROM tablero.ans WHERE mes = :mes ORDER BY codigo`, { mes })
  ])

  const resultado = {
    generado: new Date().toISOString(),
    mes,
    kpis: { ...kpis, ...extra },
    porEtapa, semaforo, porEquipo, diario,
    ans: ans.map(a => ({ ...a, meta: numero(a.meta), porcentaje: numero(a.porcentaje) })),
    interno: null as null | Awaited<ReturnType<typeof avisosInternos>>
  }
  if (d.interno) resultado.interno = await avisosInternos(mes)
  return resultado
}

// D29: descuentos del mes, reincidencia y casos sin remuneración (solo para la firma)
const avisosInternos = async (mes: string) => {
  const del = await consulta<{ codigo: string, nombre: string, porcentaje: string | null, meta: string | null, nivel: string, descuento: string }>(
    'SELECT codigo, nombre, porcentaje, meta, nivel, descuento FROM tablero_interno.descuentos WHERE mes = :mes ORDER BY codigo', { mes })
  const total = totalDescuento(del.map(x => Number(x.descuento)))
  const factura = parametro<number>('VALOR_FACTURA_MENSUAL')

  // Reincidencia: los últimos meses seguidos (la foto solo guarda los que se han calculado)
  const meses = [mes]
  for (let i = 1; i < 6; i++) meses.push(mesAnterior(meses[i - 1]))
  const filas = await AnsPeriodo.findAll({ where: { mes: meses }, attributes: ['mes', 'codigo', 'nivel'], raw: true })
  const historia = meses.map(m => ({ mes: m, niveles: Object.fromEntries(filas.filter(f => f.mes === m).map(f => [f.codigo, f.nivel])) }))
  const sinRemuneracion = await consulta<Record<string, unknown>>('SELECT * FROM tablero_interno.sin_remuneracion ORDER BY fecha_decision DESC NULLS LAST')

  return {
    descuentos: del.map(x => ({ ...x, porcentaje: numero(x.porcentaje), meta: numero(x.meta), descuento: Number(x.descuento) })),
    total: { ...total, valor: factura > 0 ? Math.round(factura * total.aplicado / 100) : null },
    reincidencia: reincidentes(historia),
    sinRemuneracion,
    // D27: a los 10 días hábiles, con menos de la mitad de los casos asignados, el equipo puede bajar
    reduccionEquipo: await reduccionPosible()
  }
}
