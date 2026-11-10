// =====================================
// CASOS DE EJEMPLO PARA REVISIÓN VISUAL
// 4 casos por etapa (contestación, impugnación, cumplimiento, requerimiento previo, desacato) en
// distintos momentos del flujo, y 4 PQRS ligadas a tutelas por derecho de petición. Los datos son
// inventados. Guarda los ids en Docs/herramientas/salida-ejemplos/ids.json para borrarlos después.
//
//   cd backend
//   npx ts-node --transpile-only --project tsconfig.json ../Docs/herramientas/ejemplos.ts crear
//   npx ts-node --transpile-only --project tsconfig.json ../Docs/herramientas/ejemplos.ts borrar
// =====================================
import fs from 'fs'
import path from 'path'
import { db } from '../../backend/src/config/db'
import { Actuacion, Alerta, Caso, Devolucion, Escrito, HistorialCaso, Juzgado, RadicacionJuzgado, SolicitudInsumo, Usuario } from '../../backend/src/models'
import { cargarParametros } from '../../backend/src/services/parametros'
import { cargarCalendario } from '../../backend/src/services/calendario'
import { activarHistorialCasos } from '../../backend/src/services/historialCasos'
import { registrarAsignacion, recalcularPlazos } from '../../backend/src/services/registroCasos'
import { registrarDecision } from '../../backend/src/services/fallos'
import { crearPqrsLigada } from '../../backend/src/services/pqrs'
import { detectarAlertas } from '../../backend/src/services/alertas'
import { refrescarAns } from '../../backend/src/services/tablero'
import { finDeDiasHabilesSiguientes } from '../../backend/src/services/plazos'
import { tipoEscrito, type Etapa } from '../../backend/src/services/constantes'

const SALIDA = path.join(__dirname, 'salida-ejemplos')
const ARCHIVO_IDS = path.join(SALIDA, 'ids.json')
const MARCA = 'Caso de ejemplo para revisión visual'

const HORA = 3600_000
const ahora = Date.now()
const h = (n: number) => new Date(ahora + n * HORA)
const iso = (n: number) => h(n).toISOString()

const NOMBRES = [
  'Laura Gómez Ruiz', 'Carlos Andrés Pérez', 'María Fernanda Rojas', 'Jorge Iván Castro', 'Ana Lucía Martínez',
  'Pedro Pablo Suárez', 'Diana Carolina López', 'Luis Felipe Herrera', 'Sandra Milena Torres', 'Andrés Felipe Díaz',
  'Paula Andrea Moreno', 'Ricardo Salazar Gil', 'Claudia Patricia Vargas', 'Héctor Fabio Ramírez', 'Natalia Ospina Mejía',
  'Julián David Cárdenas', 'Mónica Lizarazo Peña', 'Fernando Arias Quintero', 'Viviana Restrepo Cano', 'Óscar Eduardo Niño'
]
const DERECHOS = ['Petición', 'Debido proceso', 'Petición y debido proceso', 'Igualdad', 'Habeas data']
const JUZGADOS = [
  { nombre: 'Juzgado 12 Civil Municipal de Bogotá', ciudad: 'Bogotá', codigoDespacho: '110014003012' },
  { nombre: 'Juzgado 5 Penal Municipal con Función de Control de Garantías', ciudad: 'Bogotá', codigoDespacho: '110014088005' },
  { nombre: 'Juzgado 21 Administrativo del Circuito de Bogotá', ciudad: 'Bogotá', codigoDespacho: '110013337021' },
  { nombre: 'Juzgado 3 Laboral del Circuito de Bogotá', ciudad: 'Bogotá', codigoDespacho: '110013105003' }
]

// Radicado de 23 dígitos que no choca con uno real: despacho 9xx
let consecutivo = 0
const radicado = () => {
  consecutivo++
  const base = (ahora % 90000) + consecutivo
  return `11001${'31'}${'05'}${String(900 + consecutivo).slice(-3)}2026${String(base % 100000).padStart(5, '0')}00`
}

type Ids = { casos: number[], juzgados: number[] }

const crear = async () => {
  if (fs.existsSync(ARCHIVO_IDS)) throw new Error(`Ya hay ejemplos creados (${ARCHIVO_IDS}). Bórrelos primero`)
  const admin = await Usuario.findOne({ order: [['id', 'ASC']] })
  if (!admin) throw new Error('No hay usuarios')
  const ids: Ids = { casos: [], juzgados: [] }
  const guardar = () => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(ARCHIVO_IDS, JSON.stringify(ids, null, 2)) }

  try {
    for (const j of JUZGADOS) ids.juzgados.push((await Juzgado.create({ ...j, correos: [], activo: true })).id)
    guardar()
    let n = 0

    // Un caso: registro por la app (número interno, plazos, reparto) y después su estado
    const caso = async (etapa: Etapa, d: { asignadaHace: number, venceEn: number, origen?: 'ACCIONANTE' | 'ACCIONADO', porDP?: boolean }) => {
      const r = await registrarAsignacion({
        radicado: radicado(), tipoSolicitud: 'TUTELA', etapa, fechaAsignacion: iso(-d.asignadaHace), fechaVencimiento: iso(d.venceEn),
        juzgadoId: ids.juzgados[n % 4], calidadEntidad: n % 3 === 0 ? 'VINCULADO' : 'ACCIONADO',
        partes: [{ rol: 'ACCIONANTE', tipoDocumento: 'CC', numeroDocumento: String(52000000 + n * 7919), nombre: NOMBRES[n % NOMBRES.length] }],
        derechosInvolucrados: d.porDP ? 'Petición' : DERECHOS[n % DERECHOS.length], origenImpugnacion: d.origen ?? null,
        porDerechoPeticion: !!d.porDP, observaciones: MARCA, sinAcuse: true
      }, admin.id)
      n++
      ids.casos.push(r.casoId)
      guardar()
      return { casoId: r.casoId, a: (await Actuacion.findByPk(r.actuacionId))! }
    }
    const asumir = (a: Actuacion, estado = 'EN_PROYECCION', haceHoras = 1) => a.update({ estado, fechaAsumida: h(-haceHoras) })
    const insumos = async (a: Actuacion, recibido: boolean) => {
      await a.update({ requiereInsumos: true, estado: recibido ? 'EN_PROYECCION' : 'EN_INSUMOS' })
      await SolicitudInsumo.create({ actuacionId: a.id, descripcion: 'Copia del expediente administrativo del comparendo', minimo: false, fechaSolicitud: h(-20), fechaLimite: h(10), fechaRecepcion: h(-4) })
      await SolicitudInsumo.create({ actuacionId: a.id, descripcion: 'Certificación de notificación de la resolución', minimo: false, fechaSolicitud: h(-20), fechaLimite: h(10), fechaRecepcion: recibido ? h(-2) : null })
      await recalcularPlazos(a.id)
    }
    const escrito = async (a: Actuacion, estado: Escrito['estado'], entregadoHace: number | null) => {
      await a.reload()
      return Escrito.create({
        actuacionId: a.id, version: 1, tipo: tipoEscrito(a), estado, elaboradoPorId: admin.id, fechaEnvioRevision: h(-(entregadoHace ?? 1) - 3),
        fechaEntregaEntidad: entregadoHace === null ? null : h(-entregadoHace), limiteAns: entregadoHace === null ? null : a.fechaLimiteEntrega,
        fechaAcuse: entregadoHace === null ? null : h(-entregadoHace + 0.5), revisadoPorId: entregadoHace === null ? null : admin.id
      })
    }
    const devolver = async (a: Actuacion, e: Escrito) => {
      await e.update({ estado: 'DEVUELTO' })
      const fecha = h(-3)
      await Devolucion.create({ escritoId: e.id, fechaDevolucion: fecha, tipo: 'FONDO', observacion: 'Falta pronunciarse sobre la notificación por aviso', fechaLimiteCorreccion: finDeDiasHabilesSiguientes(fecha, 1, a.etapa) })
      await a.update({ estado: 'DEVUELTO' })
    }
    const radicar = async (a: Actuacion, e: Escrito, haceHoras: number) => {
      await e.update({ estado: 'APROBADO', fechaAprobacion: h(-haceHoras - 20) })
      await RadicacionJuzgado.create({ actuacionId: a.id, fechaRadicacion: h(-haceHoras), fuente: 'MANUAL' })
      await a.update({ estado: 'RADICADO' })
    }

    // ── CONTESTACIÓN ──
    const acc0 = await caso('ACCION', { asignadaHace: 1, venceEn: 6 * 24, porDP: true })
    const acc1 = await caso('ACCION', { asignadaHace: 22, venceEn: 52, porDP: true })
    await asumir(acc1.a, 'EN_PROYECCION', 20); await insumos(acc1.a, false)
    const acc2 = await caso('ACCION', { asignadaHace: 24 * 12, venceEn: -24 * 8 })
    await asumir(acc2.a, 'EN_PROYECCION', 24 * 11); await radicar(acc2.a, await escrito(acc2.a, 'ENTREGADO', 24 * 10), 24 * 9)
    await registrarDecision({ actuacionId: acc2.a.id, instancia: 'PRIMERA', sentido: 'CONCEDE', fechaDecision: new Date(ahora - 4 * 24 * HORA).toISOString().slice(0, 10), fechaNotificacion: iso(-24 * 3), notificadaPorCorreo: true, usuarioId: admin.id })
    const acc3 = await caso('ACCION', { asignadaHace: 30, venceEn: -2 })
    await asumir(acc3.a, 'EN_REVISION', 28); await escrito(acc3.a, 'EN_REVISION', null)

    // ── IMPUGNACIÓN ──
    const imp0 = await caso('IMPUGNACION', { asignadaHace: 2, venceEn: 70, origen: 'ACCIONADO', porDP: true })
    const imp1 = await caso('IMPUGNACION', { asignadaHace: 6, venceEn: 30, origen: 'ACCIONANTE' })
    await asumir(imp1.a, 'EN_PROYECCION', 5)
    const imp2 = await caso('IMPUGNACION', { asignadaHace: 26, venceEn: 20, origen: 'ACCIONADO', porDP: true })
    await asumir(imp2.a, 'EN_PROYECCION', 25); await escrito(imp2.a, 'ENTREGADO', 2); await imp2.a.update({ estado: 'ENTREGADO' })
    const imp3 = await caso('IMPUGNACION', { asignadaHace: 30, venceEn: 18, origen: 'ACCIONADO' })
    await asumir(imp3.a, 'EN_PROYECCION', 29); await devolver(imp3.a, await escrito(imp3.a, 'ENTREGADO', 8))

    // ── CUMPLIMIENTO, REQUERIMIENTO PREVIO Y DESACATO (críticos por etapa) ──
    const cum0 = await caso('CUMPLIMIENTO', { asignadaHace: 1, venceEn: 40 })
    const cum1 = await caso('CUMPLIMIENTO', { asignadaHace: 5, venceEn: 3 })
    await asumir(cum1.a, 'EN_PROYECCION', 4); await insumos(cum1.a, true)
    const cum2 = await caso('CUMPLIMIENTO', { asignadaHace: 20, venceEn: 10 })
    await asumir(cum2.a, 'EN_PROYECCION', 19); await escrito(cum2.a, 'ENTREGADO', 3); await cum2.a.update({ estado: 'ENTREGADO' })
    const cum3 = await caso('CUMPLIMIENTO', { asignadaHace: 24 * 6, venceEn: -24 * 3 })
    await asumir(cum3.a, 'EN_PROYECCION', 24 * 6 - 1); await radicar(cum3.a, await escrito(cum3.a, 'ENTREGADO', 24 * 5), 24 * 4)

    const req0 = await caso('REQUERIMIENTO_PREVIO', { asignadaHace: 0.5, venceEn: 46 })
    const req1 = await caso('REQUERIMIENTO_PREVIO', { asignadaHace: 3, venceEn: 20 })
    await asumir(req1.a, 'EN_ANALISIS', 2); await req1.a.update({ datosFaltantesPendientes: true }); await recalcularPlazos(req1.a.id)
    const req2 = await caso('REQUERIMIENTO_PREVIO', { asignadaHace: 8, venceEn: 2 })
    await asumir(req2.a, 'EN_PROYECCION', 7)
    const req3 = await caso('REQUERIMIENTO_PREVIO', { asignadaHace: 24, venceEn: 22 })
    await asumir(req3.a, 'EN_PROYECCION', 23); await devolver(req3.a, await escrito(req3.a, 'ENTREGADO', 6))

    const des0 = await caso('DESACATO', { asignadaHace: 1, venceEn: 60 })
    const des1 = await caso('DESACATO', { asignadaHace: 4, venceEn: 12 })
    await asumir(des1.a, 'EN_PROYECCION', 3); await insumos(des1.a, false)
    const des2 = await caso('DESACATO', { asignadaHace: 30, venceEn: -6 })
    await asumir(des2.a, 'EN_PROYECCION', 29)
    const des3 = await caso('DESACATO', { asignadaHace: 24 * 8, venceEn: -24 * 5 })
    await asumir(des3.a, 'EN_PROYECCION', 24 * 8 - 1); await radicar(des3.a, await escrito(des3.a, 'ENTREGADO', 24 * 7), 24 * 6)
    await registrarDecision({ actuacionId: des3.a.id, instancia: 'DESACATO', sentido: 'NO_SANCIONA', fechaDecision: new Date(ahora - 2 * 24 * HORA).toISOString().slice(0, 10), fechaNotificacion: iso(-24 * 2), usuarioId: admin.id })

    // ── PQRS ligadas a las tutelas por derecho de petición (D24) ──
    const tipos = ['GENERAL', 'DOCUMENTOS', 'CONSULTA', 'GENERAL'] as const
    const tutelas = [acc0, acc1, imp0, imp2]
    for (const [i, t] of tutelas.entries()) {
      const r = await crearPqrsLigada({
        casoId: t.casoId, radicado: `SDM-2026-${String(ahora % 1000000).padStart(6, '0')}-${i + 1}`, tipoPeticion: tipos[i],
        fechaRadicacionPeticion: iso(-24 * (25 - i * 4)), observaciones: MARCA, usuarioId: admin.id
      })
      ids.casos.push(r.casoId)
      guardar()
      const p = (await Actuacion.findByPk(r.actuacionId))!
      if (i === 1) await asumir(p, 'EN_PROYECCION', 10)
      if (i === 2) { await asumir(p, 'EN_PROYECCION', 30); await escrito(p, 'ENTREGADO', 4); await p.update({ estado: 'ENTREGADO' }) }
    }

    // Lo que haría el worker: alertas y la foto del ANS para el tablero
    console.log('Alertas nuevas:', await detectarAlertas())
    await refrescarAns(true)
    console.log(`Listo: ${ids.casos.length} casos y ${ids.juzgados.length} juzgados de ejemplo`)
  } catch (error) {
    console.error('Falló a mitad: lo creado quedó en', ARCHIVO_IDS, '(se puede borrar con "borrar")')
    throw error
  }
}

const borrar = async () => {
  if (!fs.existsSync(ARCHIVO_IDS)) throw new Error('No hay ejemplos registrados')
  const ids = JSON.parse(fs.readFileSync(ARCHIVO_IDS, 'utf8')) as Ids
  // Solo los casos con la marca de ejemplo, por si un id se reutilizó
  const casos = (await Caso.findAll({ where: { id: ids.casos }, attributes: ['id', 'observaciones'] })).filter(c => c.observaciones === MARCA).map(c => c.id)
  await Alerta.destroy({ where: { casoId: casos } })
  await HistorialCaso.destroy({ where: { casoId: casos } })
  // Las PQRS ligadas apuntan a su tutela: primero ellas
  await Caso.destroy({ where: { id: casos, tipoSolicitud: 'PQRS' } })
  await Caso.destroy({ where: { id: casos } })
  await Juzgado.destroy({ where: { id: ids.juzgados } })
  // El consecutivo vuelve al mayor número interno que quede
  await db.query(`SELECT setval('casos_numero_interno_seq', GREATEST(1, COALESCE((SELECT max(substring("numeroInterno" from '[0-9]+$')::int) FROM casos), 0)), EXISTS (SELECT 1 FROM casos WHERE "numeroInterno" IS NOT NULL))`)
  await refrescarAns(true)
  fs.unlinkSync(ARCHIVO_IDS)
  console.log(`Borrados ${casos.length} casos y ${ids.juzgados.length} juzgados de ejemplo`)
}

const main = async () => {
  await cargarParametros(true)
  await cargarCalendario(true)
  activarHistorialCasos()
  const modo = process.argv[2]
  if (modo === 'crear') await crear()
  else if (modo === 'borrar') await borrar()
  else console.log('Uso: ejemplos.ts crear | borrar')
  await db.close()
}
main().catch(async error => { console.error(error); await db.close(); process.exit(1) })
