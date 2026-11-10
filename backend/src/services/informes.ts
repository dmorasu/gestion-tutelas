import ExcelJS from 'exceljs'
import { Op } from 'sequelize'
import { Actuacion, Alerta, Archivo, Caso, Decision, Devolucion, Equipo, Escrito, Informe, Juzgado, RadicacionJuzgado, SolicitudInsumo, Usuario } from '../models'
import { calcularAns, limiteInforme, rango, type Indicador } from './indicadores'
import { guardarArchivo } from './almacenamiento'
import { CRITICIDADES, NOMBRES_CRITICIDAD, NOMBRES_ETAPAS, type Etapa } from './constantes'
import { NOMBRES_ALERTA } from './alertas'
import { sumarDias, textoFechaHora, enBogota } from '../utils/fechaColombia'
import { formatoRadicado } from '../utils/radicado'
import { ErrorNegocio } from '../utils/errores'

// =====================================
// INFORMES SEMANAL Y MENSUAL (correo del cliente, punto 5; manual §21.2 y §26)
// Semanal: asignaciones, actividades, entregas, devoluciones, ANS y alertas de la semana.
// D28: novedades procesales (fallos y radicaciones) y bloqueos (lo que frena la entrega), para que
// el coordinador anexe las acciones.
// Mensual: lo mismo para el mes, la matriz de casos abiertos y la relación de casos causados para
// la factura (primer escrito entregado en el mes: radicado, despacho, asignación y entrega).
// Sin nombres ni documentos de los accionantes: el manual pide minimizar datos personales en los
// reportes (§23). El Excel queda en SharePoint (Informes/AAAA) y en la app.
// =====================================

const ESTADOS: Record<string, string> = {
  POR_ASUMIR: 'Por asumir', EN_ANALISIS: 'En análisis', EN_INSUMOS: 'Esperando insumos', EN_PROYECCION: 'En proyección',
  EN_REVISION: 'Con el revisor', AJUSTE_INTERNO: 'Ajuste interno', ENTREGADO: 'Entregado', DEVUELTO: 'Devuelto',
  APROBADO: 'Aprobado', RADICADO: 'Radicado', CERRADA: 'Cerrada'
}
const TIPOS_DEVOLUCION: Record<string, string> = { FONDO: 'Fondo', SOPORTE: 'Falta de soporte', CRITERIO: 'Criterio institucional', ESTILO: 'Estilo', SIN_CLASIFICAR: 'Sin clasificar' }

// Periodo del informe: la semana (lunes a domingo) o el mes calendario que empieza en "desde"
export const periodo = (tipo: 'SEMANAL' | 'MENSUAL', desde: string) => {
  const d = new Date(`${desde}T12:00:00Z`)
  if (tipo === 'SEMANAL') {
    if (d.getUTCDay() !== 1) throw new ErrorNegocio('El informe semanal empieza un lunes')
    return { desde, hasta: sumarDias(desde, 6) }
  }
  if (d.getUTCDate() !== 1) throw new ErrorNegocio('El informe mensual empieza el día 1')
  const siguiente = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
  return { desde, hasta: sumarDias(siguiente, -1) }
}

// El periodo anterior al de hoy: es el que se reporta (semana pasada, mes pasado)
export const periodoAnterior = (tipo: 'SEMANAL' | 'MENSUAL') => {
  const hoy = enBogota(new Date()).dia
  const d = new Date(`${hoy}T12:00:00Z`)
  if (tipo === 'SEMANAL') return sumarDias(hoy, -((d.getUTCDay() + 6) % 7) - 7)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

const fecha = (d: Date | null | undefined) => (d ? textoFechaHora(d) : '')
const etapa = (e: string) => NOMBRES_ETAPAS[e as Etapa] ?? e

// Hoja con encabezado grafito, filtros y la primera fila fija
const hoja = (libro: ExcelJS.Workbook, nombre: string, columnas: { titulo: string, ancho: number }[], filas: (string | number | null)[][]) => {
  const h = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] })
  h.columns = columnas.map(c => ({ header: c.titulo, width: c.ancho }))
  const encabezado = h.getRow(1)
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  encabezado.alignment = { vertical: 'middle' }
  filas.forEach(f => h.addRow(f))
  if (filas.length) h.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } }
  return h
}

export const generarInforme = async (d: { tipo: 'SEMANAL' | 'MENSUAL', desde: string, usuarioId: number }) => {
  const { desde, hasta } = periodo(d.tipo, d.desde)
  const { ini, fin } = rango(desde, hasta)
  const enPeriodo = { [Op.gte]: ini, [Op.lt]: fin }
  const caso = { model: Caso, attributes: ['id', 'numeroInterno', 'radicado', 'deOtroOperador', 'juzgadoId'], include: [{ model: Juzgado, attributes: ['nombre'] }] }
  const personas = [{ model: Usuario, as: 'auxiliar', attributes: ['nombre'] }, { model: Usuario, as: 'revisor', attributes: ['nombre'] }, { model: Equipo, attributes: ['nombre'] }]

  const [asignadas, entregas, devoluciones, aprobados, abiertas, alertas, ans] = await Promise.all([
    Actuacion.findAll({ where: { fechaAsignacion: enPeriodo }, attributes: ['id', 'etapa', 'criticidad', 'equipoId'] }),
    Escrito.findAll({ where: { fechaEntregaEntidad: enPeriodo }, include: [{ model: Actuacion, include: [caso, ...personas] }], order: [['fechaEntregaEntidad', 'ASC']] }),
    Devolucion.findAll({ where: { fechaDevolucion: enPeriodo }, include: [{ model: Escrito, include: [{ model: Actuacion, include: [caso] }] }], order: [['fechaDevolucion', 'ASC']] }),
    Escrito.count({ where: { fechaAprobacion: enPeriodo } }),
    Actuacion.findAll({
      where: { estado: { [Op.notIn]: ['CERRADA'] }, fechaAsignacion: { [Op.lt]: fin } },
      include: [caso, ...personas, { model: SolicitudInsumo, attributes: ['fechaRecepcion', 'descripcion'] }],
      order: [['fechaVencimiento', 'ASC NULLS LAST']]
    }),
    Alerta.findAll({ where: { fechaDeteccion: enPeriodo }, attributes: ['tipo', 'estado', 'actuacionId'] }),
    calcularAns(desde, hasta)
  ])
  const ahora = new Date()
  const equipos = await Equipo.findAll({ attributes: ['id', 'nombre'] })

  const resumen = {
    asignadas: asignadas.length,
    porEtapa: Object.fromEntries(Object.keys(NOMBRES_ETAPAS).map(e => [e, asignadas.filter(a => a.etapa === e).length]).filter(([, n]) => n)),
    porCriticidad: Object.fromEntries(CRITICIDADES.map(c => [c, asignadas.filter(a => a.criticidad === c).length])),
    entregasV1: entregas.filter(e => e.version === 1).length,
    entregasCorreccion: entregas.filter(e => e.version > 1).length,
    devoluciones: Object.fromEntries(Object.keys(TIPOS_DEVOLUCION).map(t => [t, devoluciones.filter(x => x.tipo === t).length]).filter(([, n]) => n)),
    aprobados,
    abiertasAlCierre: abiertas.length,
    alertasDetectadas: alertas.length,
    alertasEmitidas: alertas.filter(a => a.estado === 'EMITIDA').length,
    ans: ans.map(i => ({ codigo: i.codigo, porcentaje: i.porcentaje, meta: i.meta, cumple: i.cumple, cumplen: i.cumplen, total: i.total }))
  }

  const libro = new ExcelJS.Workbook()
  libro.creator = 'Nodex Tutelas · GPA Legal'
  const titulo = `Informe ${d.tipo === 'SEMANAL' ? 'semanal' : 'mensual'} del ${desde} al ${hasta}`

  // Resumen y ANS
  const r = libro.addWorksheet('Resumen')
  r.columns = [{ width: 46 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }]
  r.addRow([titulo]).font = { bold: true, size: 14 }
  r.addRow([`Generado ${textoFechaHora(ahora)}`]).font = { color: { argb: 'FF64748B' } }
  r.addRow([])
  const filaDato = (nombre: string, valor: number | string) => r.addRow([nombre, valor])
  r.addRow(['Volumen']).font = { bold: true }
  filaDato('Asignaciones recibidas', resumen.asignadas)
  for (const [e, n] of Object.entries(resumen.porEtapa)) filaDato(`   ${etapa(e)}`, n as number)
  for (const c of CRITICIDADES) filaDato(`   ${NOMBRES_CRITICIDAD[c].toLowerCase()}`, resumen.porCriticidad[c])
  filaDato('Primeros escritos entregados (V1)', resumen.entregasV1)
  filaDato('Escritos corregidos entregados (V2 o más)', resumen.entregasCorreccion)
  filaDato('Escritos aprobados por la entidad', resumen.aprobados)
  for (const [t, n] of Object.entries(resumen.devoluciones)) filaDato(`Devoluciones: ${TIPOS_DEVOLUCION[t].toLowerCase()}`, n as number)
  filaDato('Casos abiertos al cierre del periodo', resumen.abiertasAlCierre)
  filaDato('Alertas detectadas / emitidas', `${resumen.alertasDetectadas} / ${resumen.alertasEmitidas}`)
  r.addRow([])
  const enc = r.addRow(['Indicador', 'Cumplen / total', 'Resultado', 'Meta', 'Estado'])
  enc.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  enc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  const estado = (i: Indicador) => (i.fueraDeApp ? 'Fuera de la app' : i.cumple === null ? 'Sin datos' : i.cumple ? 'Cumple' : 'No cumple')
  for (const i of ans) {
    const meta = i.meta === null ? '' : i.sentido === 'CERO' ? '0 eventos' : `${i.sentido === 'MIN' ? '≥' : '≤'} ${i.meta} %`
    const fila = r.addRow([`${i.codigo} ${i.nombre}`, i.fueraDeApp ? '' : i.sentido === 'CERO' ? `${i.total} eventos` : `${i.cumplen} / ${i.total}`, i.porcentaje === null ? '' : `${i.porcentaje} %`, meta, estado(i)])
    if (i.cumple === false) fila.getCell(5).font = { bold: true, color: { argb: 'FFB91C1C' } }
  }

  // Carga por equipo
  hoja(libro, 'Por equipo', [
    { titulo: 'Equipo', ancho: 32 }, { titulo: 'Asignadas en el periodo', ancho: 22 }, { titulo: 'Entregas en el periodo', ancho: 22 },
    { titulo: 'Abiertas al cierre', ancho: 18 }, { titulo: 'Críticas abiertas', ancho: 16 }
  ], [...equipos, { id: 0, nombre: 'Sin equipo' }].map(e => {
    const id = e.id || null
    return [e.nombre, asignadas.filter(a => a.equipoId === id).length, entregas.filter(x => x.actuacion?.equipoId === id).length,
      abiertas.filter(a => a.equipoId === id).length, abiertas.filter(a => a.equipoId === id && a.criticidad === 'CRITICO').length]
  }).filter(f => (f.slice(1) as number[]).some(Boolean)))

  // Matriz de casos abiertos (manual §26)
  hoja(libro, 'Casos abiertos', [
    { titulo: 'Caso', ancho: 16 }, { titulo: 'Radicado', ancho: 30 }, { titulo: 'Despacho', ancho: 30 }, { titulo: 'Etapa', ancho: 20 },
    { titulo: 'Estado', ancho: 20 }, { titulo: 'Criticidad', ancho: 11 }, { titulo: 'Asignado', ancho: 17 }, { titulo: 'Vence', ancho: 17 },
    { titulo: 'Límite ANS', ancho: 17 }, { titulo: 'Insumos pendientes', ancho: 12 }, { titulo: 'Auxiliar', ancho: 22 }, { titulo: 'Revisor', ancho: 22 },
    { titulo: 'Equipo', ancho: 26 }, { titulo: 'Días abierto', ancho: 11 }, { titulo: 'Otro operador', ancho: 11 }
  ], abiertas.map(a => [
    a.caso?.numeroInterno ?? '', formatoRadicado(a.caso?.radicado ?? ''), a.caso?.juzgado?.nombre ?? '', etapa(a.etapa), ESTADOS[a.estado] ?? a.estado,
    NOMBRES_CRITICIDAD[a.criticidad], fecha(a.fechaAsignacion), fecha(a.fechaVencimiento), fecha(a.fechaLimiteEntrega),
    (a.insumos ?? []).filter(i => !i.fechaRecepcion).length, a.auxiliar?.nombre ?? '', a.revisor?.nombre ?? '', a.equipo?.nombre ?? '',
    Math.floor((ahora.getTime() - a.fechaAsignacion.getTime()) / 86_400_000), a.caso?.deOtroOperador ? 'Sí' : ''
  ]))

  // D28: novedades procesales del periodo: fallos registrados y radicaciones de la entidad
  const casoMin = { model: Caso, attributes: ['numeroInterno', 'radicado'] }
  const [fallos, radicaciones] = await Promise.all([
    Decision.findAll({ where: { createdAt: enPeriodo }, include: [{ model: Actuacion, attributes: ['etapa'], include: [casoMin] }], order: [['createdAt', 'ASC']] }),
    RadicacionJuzgado.findAll({ where: { fechaRadicacion: enPeriodo }, include: [{ model: Actuacion, attributes: ['etapa'], include: [casoMin] }], order: [['fechaRadicacion', 'ASC']] })
  ])
  const SENTIDO: Record<string, string> = {
    CONCEDE: 'Concede', CONCEDE_PARCIAL: 'Concede parcialmente', NIEGA: 'Niega', IMPROCEDENTE: 'Improcedente', HECHO_SUPERADO: 'Hecho superado',
    CONFIRMA: 'Confirma', REVOCA: 'Revoca', MODIFICA: 'Modifica', SANCIONA: 'Sanciona', NO_SANCIONA: 'No sanciona'
  }
  const INSTANCIA: Record<string, string> = { PRIMERA: 'Primera instancia', SEGUNDA: 'Segunda instancia', DESACATO: 'Desacato' }
  hoja(libro, 'Novedades procesales', [
    { titulo: 'Fecha', ancho: 17 }, { titulo: 'Caso', ancho: 16 }, { titulo: 'Radicado', ancho: 30 }, { titulo: 'Etapa', ancho: 20 }, { titulo: 'Novedad', ancho: 60 }
  ], [
    ...fallos.map(x => ({ cuando: x.fechaNotificacion ?? x.createdAt, a: x.actuacion, texto: `Fallo de ${INSTANCIA[x.instancia] ?? x.instancia}: ${SENTIDO[x.sentido] ?? x.sentido}${x.favorable === null ? '' : x.favorable ? ' (favorable)' : ' (desfavorable)'}${x.requiereCumplimiento ? '. Exige memorial de cumplimiento' : ''}` })),
    ...radicaciones.map(x => ({ cuando: x.fechaRadicacion, a: x.actuacion, texto: 'La entidad radicó el escrito en el juzgado' }))
  ].sort((p, q) => p.cuando.getTime() - q.cuando.getTime()).map(n => [fecha(n.cuando), n.a?.caso?.numeroInterno ?? '', formatoRadicado(n.a?.caso?.radicado ?? ''), etapa(n.a?.etapa ?? ''), n.texto]))

  // D28: bloqueos al cierre del periodo, con una columna para la acción que anota el coordinador
  const bloqueos = [
    ...abiertas.filter(a => (a.insumos ?? []).some(i => !i.fechaRecepcion)).map(a => ({ a, texto: `Esperando insumos: ${(a.insumos ?? []).filter(i => !i.fechaRecepcion).map(i => i.descripcion).join('; ')}` })),
    ...abiertas.filter(a => a.datosFaltantesPendientes).map(a => ({ a, texto: 'Esperando los datos faltantes de la asignación (el ANS no corre)' })),
    ...abiertas.filter(a => a.caso?.deOtroOperador).map(a => ({ a, texto: 'Radicado asignado a otro operador en el archivo maestro' })),
    ...alertas.filter(x => x.estado === 'PENDIENTE').map(x => ({ a: abiertas.find(a => a.id === x.actuacionId), texto: `Alerta sin emitir: ${NOMBRES_ALERTA[x.tipo]}` }))
  ]
  hoja(libro, 'Bloqueos', [
    { titulo: 'Caso', ancho: 16 }, { titulo: 'Radicado', ancho: 30 }, { titulo: 'Etapa', ancho: 20 }, { titulo: 'Bloqueo', ancho: 60 }, { titulo: 'Acción', ancho: 50 }
  ], bloqueos.filter(b => b.a).map(b => [b.a!.caso?.numeroInterno ?? '', formatoRadicado(b.a!.caso?.radicado ?? ''), etapa(b.a!.etapa), b.texto, '']))

  // Entregas del periodo
  hoja(libro, 'Entregas', [
    { titulo: 'Entregado', ancho: 17 }, { titulo: 'Versión', ancho: 9 }, { titulo: 'Caso', ancho: 16 }, { titulo: 'Radicado', ancho: 30 },
    { titulo: 'Etapa', ancho: 20 }, { titulo: 'Límite ANS', ancho: 17 }, { titulo: 'A tiempo', ancho: 10 }, { titulo: 'Auxiliar', ancho: 22 }, { titulo: 'Revisor', ancho: 22 }
  ], entregas.map(e => {
    const a = e.actuacion!
    const limite = e.limiteAns ?? a.fechaVencimiento
    return [fecha(e.fechaEntregaEntidad), `V${e.version}`, a.caso?.numeroInterno ?? '', formatoRadicado(a.caso?.radicado ?? ''), etapa(a.etapa),
      fecha(limite), limite ? (e.fechaEntregaEntidad! <= limite ? 'Sí' : 'No') : '', a.auxiliar?.nombre ?? '', a.revisor?.nombre ?? '']
  }))

  hoja(libro, 'Devoluciones', [
    { titulo: 'Devuelto', ancho: 17 }, { titulo: 'Caso', ancho: 16 }, { titulo: 'Radicado', ancho: 30 }, { titulo: 'Versión', ancho: 9 },
    { titulo: 'Tipo', ancho: 22 }, { titulo: 'Observación', ancho: 50 }, { titulo: 'Corregir antes de', ancho: 17 }, { titulo: 'Corregido', ancho: 17 }, { titulo: 'Extemporánea', ancho: 12 }
  ], devoluciones.map(x => [
    fecha(x.fechaDevolucion), x.escrito?.actuacion?.caso?.numeroInterno ?? '', formatoRadicado(x.escrito?.actuacion?.caso?.radicado ?? ''), `V${x.escrito?.version ?? ''}`,
    TIPOS_DEVOLUCION[x.tipo] ?? x.tipo, x.observacion ?? '', fecha(x.fechaLimiteCorreccion), fecha(x.fechaNuevaEntrega), x.extemporanea ? 'Sí' : ''
  ]))

  // Incumplimientos de ANS con su caso, para explicar desviaciones (manual §21.2)
  hoja(libro, 'ANS incumplidos', [{ titulo: 'Indicador', ancho: 12 }, { titulo: 'Caso', ancho: 16 }, { titulo: 'Radicado', ancho: 30 }, { titulo: 'Detalle', ancho: 70 }],
    ans.flatMap(i => i.incumplidos.map(f => [i.codigo, f.numeroInterno ?? '', f.radicado ? formatoRadicado(f.radicado) : '', f.detalle])))

  // Relación para la factura: casos cuyo primer escrito se entregó en el mes (§26.1)
  if (d.tipo === 'MENSUAL') {
    const primeros = entregas.filter(e => e.version === 1)
    hoja(libro, 'Facturación', [
      { titulo: 'Radicado', ancho: 30 }, { titulo: 'Caso', ancho: 16 }, { titulo: 'Despacho', ancho: 34 }, { titulo: 'Fecha de asignación', ancho: 19 }, { titulo: 'Fecha de entrega', ancho: 19 }
    ], primeros.map(e => [formatoRadicado(e.actuacion?.caso?.radicado ?? ''), e.actuacion?.caso?.numeroInterno ?? '', e.actuacion?.caso?.juzgado?.nombre ?? '',
      fecha(e.actuacion?.fechaAsignacion), fecha(e.fechaEntregaEntidad)]))
  }

  const contenido = Buffer.from(await libro.xlsx.writeBuffer())
  const nombre = `Informe ${d.tipo === 'SEMANAL' ? 'semanal' : 'mensual'} ${desde} a ${hasta}.xlsx`
  const tipoMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const ubicacion = await guardarArchivo(`Informes/${desde.slice(0, 4)}`, nombre, contenido, tipoMime)
  const archivo = await Archivo.create({ nombre, tipoMime, tamano: contenido.length, tipo: 'SOPORTE', ...ubicacion, usuarioId: d.usuarioId })
  return Informe.create({ tipo: d.tipo, desde, hasta, fechaLimite: limiteInforme(d.tipo, desde), archivoId: archivo.id, usuarioId: d.usuarioId, resumen })
}
