import { Op, fn, col, where as condicionSql, type Transaction, type WhereOptions } from 'sequelize'
import { db } from '../config/db'
import { Caso, CasoRelacion, Parte, Actuacion, Correo, Archivo, HistorialCaso, NotaCaso, Alerta, Usuario } from '../models'
import { TIPOS_RELACION, type TipoRelacion } from '../models/casos'
import { ErrorNegocio } from '../utils/errores'
import { digitosDistintos, formatoRadicado, raizProceso } from '../utils/radicado'
import { carpetaCaso, moverArchivo } from './almacenamiento'
import { NOMBRES_ETAPAS } from './constantes'

// =====================================
// CASOS QUE PUEDEN SER EL MISMO (reunión 18-nov)
// La app sugiere relaciones entre casos y una persona las confirma o descarta. El coordinador puede
// unir dos casos que resultaron ser el mismo proceso.
// =====================================

export const NOMBRES_RELACION: Record<TipoRelacion, string> = {
  MISMO_PROCESO: 'Mismo proceso',
  TEMERIDAD: 'Posible temeridad',
  ANTECEDENTE: 'Antecedente del accionante'
}

type Usuario_ = { id: number, nombre: string }

// Un caso por su radicado, también si llegó con el de un caso que se le unió
export const dondeRadicado = (radicados: string | string[]): WhereOptions => {
  const lista = Array.isArray(radicados) ? radicados : [radicados]
  return { [Op.or]: [{ radicado: lista }, { radicadosAlternos: { [Op.overlap]: lista } }] }
}
export const dondeNumeroInterno = (numeros: string[]): WhereOptions =>
  ({ [Op.or]: [{ numeroInterno: numeros }, { numerosInternosAlternos: { [Op.overlap]: numeros } }] })

const sinSeparadores = (texto: string | null | undefined) => (texto ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase()
const nombreNormal = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Una fila por pareja: el caso más antiguo va primero
const pareja = (a: number, b: number) => (a < b ? { casoId: a, relacionadoId: b } : { casoId: b, relacionadoId: a })

const registrarEnBitacora = async (casoId: number, seccion: string, cambios: { campo: string, despues: string | null }[], usuario: Usuario_ | null, transaction?: Transaction) =>
  HistorialCaso.create({
    casoId, actuacionId: null, seccion, accion: 'MODIFICADO',
    cambios: cambios.filter(c => c.despues).map(c => ({ campo: c.campo, antes: null, despues: c.despues })),
    usuarioId: usuario?.id ?? null, nombreUsuario: usuario?.nombre ?? 'Sistema', origen: 'Casos'
  }, { transaction })

const etiqueta = (c: Pick<Caso, 'numeroInterno' | 'radicado'>) => `${c.numeroInterno ?? 'Caso'} (${formatoRadicado(c.radicado)})`

// =====================================
// SUGERENCIAS
// 1. Mismo proceso: los 21 primeros dígitos del radicado iguales (cambia la instancia o el recurso)
// 2. Mismo accionante por documento: antecedente; si además el radicado difiere en uno o dos dígitos
//    y es el mismo despacho, probablemente se digitó mal y es el mismo proceso
// 3. Sin documento, el mismo nombre completo: antecedente por confirmar
// La temeridad la decide quien revisa (mismos hechos y derechos): la app la propone como antecedente.
// Lo ya decidido (confirmado o descartado) no se vuelve a sugerir
// =====================================
export const sugerirRelaciones = async (casoId: number) => {
  const caso = await Caso.findByPk(casoId, {
    attributes: ['id', 'radicado', 'juzgadoId', 'casoRelacionadoId'],
    include: [{ model: Parte, attributes: ['rol', 'nombre', 'numeroDocumento'], required: false }]
  })
  if (!caso) return 0
  const candidatos = new Map<number, { tipo: TipoRelacion, motivo: string }>()
  const proponer = (id: number, tipo: TipoRelacion, motivo: string) => {
    // Mismo proceso pesa más que antecedente si las dos reglas lo encuentran
    if (id === caso.id || (candidatos.get(id)?.tipo === 'MISMO_PROCESO' && tipo !== 'MISMO_PROCESO')) return
    candidatos.set(id, { tipo, motivo })
  }

  const raiz = raizProceso(caso.radicado)
  if (raiz) {
    const mismos = await Caso.findAll({ where: { id: { [Op.ne]: caso.id }, radicado: { [Op.like]: `${raiz}%` } }, attributes: ['id'] })
    for (const m of mismos) proponer(m.id, 'MISMO_PROCESO', 'El radicado es igual salvo los dos últimos dígitos (instancia o recurso)')
  }

  const accionantes = (caso.partes ?? []).filter(p => p.rol === 'ACCIONANTE')
  const documentos = [...new Set(accionantes.map(p => sinSeparadores(p.numeroDocumento)).filter(d => d.length >= 5))]
  if (documentos.length) {
    const mismos = await Parte.findAll({
      where: { casoId: { [Op.ne]: caso.id }, rol: 'ACCIONANTE', [Op.and]: [condicionSql(fn('upper', fn('regexp_replace', col('numeroDocumento'), '[^0-9A-Za-z]', '', 'g')), { [Op.in]: documentos })] },
      attributes: ['casoId', 'numeroDocumento'],
      include: [{ model: Caso, attributes: ['id', 'radicado', 'juzgadoId'] }]
    })
    for (const p of mismos) {
      const otro = p.caso!
      const casiIgual = digitosDistintos(otro.radicado, caso.radicado) <= 2 && !!caso.juzgadoId && otro.juzgadoId === caso.juzgadoId
      if (casiIgual) proponer(otro.id, 'MISMO_PROCESO', 'Mismo accionante y mismo despacho, con el radicado casi igual: puede estar mal digitado')
      else proponer(otro.id, 'ANTECEDENTE', `El accionante (documento ${p.numeroDocumento}) figura también en este caso`)
    }
  }
  const sinDocumento = accionantes.filter(p => sinSeparadores(p.numeroDocumento).length < 5).map(p => nombreNormal(p.nombre)).filter(n => n.split(' ').length >= 2)
  if (sinDocumento.length) {
    const mismos = await Parte.findAll({
      where: { casoId: { [Op.ne]: caso.id }, rol: 'ACCIONANTE', [Op.and]: [condicionSql(fn('lower', fn('regexp_replace', fn('trim', col('nombre')), '\\s+', ' ', 'g')), { [Op.in]: sinDocumento })] },
      attributes: ['casoId']
    })
    for (const p of mismos) proponer(p.casoId, 'ANTECEDENTE', 'Mismo nombre del accionante (sin documento para confirmarlo)')
  }

  // La PQRS ligada a la tutela (D24) ya tiene su relación propia
  const ligadas = new Set((await Caso.findAll({ where: { [Op.or]: [{ casoRelacionadoId: caso.id }, { id: caso.casoRelacionadoId ?? 0 }] }, attributes: ['id'] })).map(c => c.id))
  let nuevas = 0
  for (const [otroId, s] of candidatos) {
    if (ligadas.has(otroId)) continue
    const [, creada] = await CasoRelacion.findOrCreate({ where: pareja(caso.id, otroId), defaults: { ...pareja(caso.id, otroId), tipo: s.tipo, motivo: s.motivo } })
    if (creada) nuevas++
  }
  return nuevas
}

// Relaciones vigentes de un caso (sin las descartadas), con lo básico del otro caso
export const relacionesDe = async (casoId: number) => {
  const filas = await CasoRelacion.findAll({
    where: { [Op.or]: [{ casoId }, { relacionadoId: casoId }], estado: { [Op.ne]: 'DESCARTADA' } },
    include: [{ model: Usuario, as: 'decididoPor', attributes: ['nombre'] }],
    order: [['estado', 'DESC'], ['createdAt', 'ASC']]
  })
  const otrosIds = filas.map(f => (f.casoId === casoId ? f.relacionadoId : f.casoId))
  const otros = new Map((await Caso.findAll({
    where: { id: otrosIds },
    attributes: ['id', 'numeroInterno', 'radicado', 'estado', 'juzgadoId', 'fechaFacturacion', 'derechosInvolucrados'],
    include: [
      { model: Parte, attributes: ['rol', 'nombre', 'numeroDocumento'], required: false },
      { model: Actuacion, attributes: ['id', 'etapa', 'estado', 'fechaAsignacion'], required: false }
    ]
  })).map(c => [c.id, c]))
  return filas.flatMap(f => {
    const otro = otros.get(f.casoId === casoId ? f.relacionadoId : f.casoId)
    if (!otro) return []
    return [{
      id: f.id, tipo: f.tipo, estado: f.estado, motivo: f.motivo, nota: f.nota, decididoPor: f.decididoPor?.nombre ?? null, fechaDecision: f.fechaDecision,
      otro: {
        id: otro.id, numeroInterno: otro.numeroInterno, radicado: otro.radicado, estado: otro.estado, fechaFacturacion: otro.fechaFacturacion,
        derechos: otro.derechosInvolucrados,
        accionantes: (otro.partes ?? []).filter(p => p.rol === 'ACCIONANTE').map(p => p.nombre),
        actuaciones: (otro.actuaciones ?? []).map(a => ({ id: a.id, etapa: a.etapa, estado: a.estado, fechaAsignacion: a.fechaAsignacion }))
      }
    }]
  })
}

// Confirmar (con el tipo que decida quien revisa) o descartar una sugerencia. Queda en la bitácora de los dos
export const decidirRelacion = async (d: { relacionId: number, estado: 'CONFIRMADA' | 'DESCARTADA', tipo?: TipoRelacion | null, nota?: string | null, usuario: Usuario_ }) => {
  const r = await CasoRelacion.findByPk(d.relacionId, { include: [{ model: Caso, as: 'caso', attributes: ['id', 'numeroInterno', 'radicado'] }, { model: Caso, as: 'relacionado', attributes: ['id', 'numeroInterno', 'radicado'] }] })
  if (!r?.caso || !r.relacionado) throw new ErrorNegocio('La relación no existe', 404)
  if (d.tipo && !TIPOS_RELACION.includes(d.tipo)) throw new ErrorNegocio('Tipo de relación no válido')
  const tipo = d.estado === 'CONFIRMADA' ? d.tipo ?? r.tipo : r.tipo
  await db.transaction(async transaction => {
    await r.update({ estado: d.estado, tipo, nota: d.nota?.trim() || null, decididoPorId: d.usuario.id, fechaDecision: new Date() }, { transaction })
    for (const [este, otro] of [[r.caso!, r.relacionado!], [r.relacionado!, r.caso!]]) {
      await registrarEnBitacora(este.id, 'RELACION', [
        { campo: 'Caso relacionado', despues: etiqueta(otro) },
        { campo: 'Relación', despues: NOMBRES_RELACION[tipo] },
        { campo: 'Decisión', despues: d.estado === 'CONFIRMADA' ? 'Confirmada' : 'Descartada' },
        { campo: 'Nota', despues: d.nota?.trim() || null }
      ], d.usuario, transaction)
    }
  })
  return r
}

// Relacionar a mano con otro caso (por número interno o radicado): queda confirmada
export const relacionarManual = async (d: { casoId: number, otro: string, tipo: TipoRelacion, nota?: string | null, usuario: Usuario_ }) => {
  if (!TIPOS_RELACION.includes(d.tipo)) throw new ErrorNegocio('Tipo de relación no válido')
  const texto = d.otro.trim()
  const digitos = texto.replace(/\D/g, '')
  const otro = await Caso.findOne({ where: { [Op.or]: [dondeNumeroInterno([texto.toUpperCase()]), ...(digitos.length >= 4 ? [dondeRadicado(digitos)] : []), dondeRadicado(texto.toUpperCase().replace(/[^A-Z0-9]/g, ''))] }, attributes: ['id'] })
  if (!otro) throw new ErrorNegocio('No se encontró ese caso: escriba el número interno (GPA-…) o el radicado completo')
  if (otro.id === d.casoId) throw new ErrorNegocio('Es el mismo caso')
  const [r] = await CasoRelacion.findOrCreate({ where: pareja(d.casoId, otro.id), defaults: { ...pareja(d.casoId, otro.id), tipo: d.tipo, motivo: 'Relacionado a mano' } })
  return decidirRelacion({ relacionId: r.id, estado: 'CONFIRMADA', tipo: d.tipo, nota: d.nota, usuario: d.usuario })
}

// =====================================
// UNIR DOS CASOS (coordinador)
// El absorbido pasa entero al principal: actuaciones, partes que falten, correos, documentos, notas,
// alertas, bitácora y relaciones. El principal guarda el radicado y el número interno del absorbido
// para seguir reconociéndolos y se factura una sola vez, con la fecha más antigua de los dos.
// Los documentos se mueven a la carpeta del principal después de confirmar (SharePoint va aparte:
// si falla, el archivo queda donde estaba y ligado al caso correcto).
// =====================================
export const unirCasos = async (d: { principalId: number, absorbidoId: number, motivo: string, usuario: Usuario_ }) => {
  if (!d.motivo.trim()) throw new ErrorNegocio('Indique por qué se unen los casos')
  if (d.principalId === d.absorbidoId) throw new ErrorNegocio('Es el mismo caso')
  const archivosMovidos = await db.transaction(async transaction => {
    const [principal, absorbido] = await Promise.all([d.principalId, d.absorbidoId].map(id => Caso.findByPk(id, {
      include: [{ model: Parte, required: false }, { model: Actuacion, attributes: ['id', 'etapa', 'estado', 'fechaAsignacion'], required: false }],
      transaction, lock: transaction.LOCK.UPDATE
    })))
    if (!principal || !absorbido) throw new ErrorNegocio('El caso no existe', 404)
    if (principal.tipoSolicitud !== absorbido.tipoSolicitud) throw new ErrorNegocio('Solo se unen casos del mismo tipo (tutela con tutela, PQRS con PQRS)')
    // Dos actuaciones abiertas de la misma etapa en un caso no se pueden atender por separado
    const abiertas = (c: Caso) => new Set((c.actuaciones ?? []).filter(a => a.estado !== 'CERRADA').map(a => a.etapa))
    const choque = [...abiertas(absorbido)].find(e => abiertas(principal).has(e))
    if (choque) throw new ErrorNegocio(`Los dos casos tienen abierta la etapa de ${NOMBRES_ETAPAS[choque].toLowerCase()}: cierre o elimine una antes de unirlos`)

    await Actuacion.update({ casoId: principal.id }, { where: { casoId: absorbido.id }, transaction })
    // Partes: las que el principal no tenga (por documento o, sin documento, por nombre)
    const conocidas = new Set((principal.partes ?? []).map(p => sinSeparadores(p.numeroDocumento) || nombreNormal(p.nombre)))
    for (const p of absorbido.partes ?? []) {
      if (conocidas.has(sinSeparadores(p.numeroDocumento) || nombreNormal(p.nombre))) await p.destroy({ transaction })
      else await p.update({ casoId: principal.id }, { transaction })
    }
    const archivos = await Archivo.findAll({ where: { casoId: absorbido.id }, attributes: ['id'], transaction })
    for (const modelo of [Correo, Archivo, NotaCaso, Alerta, HistorialCaso] as const) {
      await (modelo as typeof Correo).update({ casoId: principal.id }, { where: { casoId: absorbido.id }, transaction })
    }
    await Caso.update({ casoRelacionadoId: principal.id }, { where: { casoRelacionadoId: absorbido.id }, transaction })
    // Relaciones del absorbido: pasan al principal; la de los dos entre sí y las repetidas se van
    for (const r of await CasoRelacion.findAll({ where: { [Op.or]: [{ casoId: absorbido.id }, { relacionadoId: absorbido.id }] }, transaction })) {
      const otro = r.casoId === absorbido.id ? r.relacionadoId : r.casoId
      const nueva = pareja(principal.id, otro)
      if (otro === principal.id || await CasoRelacion.count({ where: nueva, transaction })) await r.destroy({ transaction })
      else await r.update(nueva, { transaction })
    }

    // Se factura una vez: con la primera asignación de los dos, y la etapa inicial es la de esa
    const fechas = [principal, absorbido].filter(c => c.fechaFacturacion).sort((a, b) => a.fechaFacturacion!.getTime() - b.fechaFacturacion!.getTime())
    const primero = fechas[0] ?? principal
    const todas = [...(principal.actuaciones ?? []), ...(absorbido.actuaciones ?? [])]
    await principal.update({
      radicadosAlternos: [...new Set([...principal.radicadosAlternos, absorbido.radicado, ...absorbido.radicadosAlternos])],
      numerosInternosAlternos: [...new Set([...principal.numerosInternosAlternos, ...(absorbido.numeroInterno ? [absorbido.numeroInterno] : []), ...absorbido.numerosInternosAlternos])],
      fechaFacturacion: primero.fechaFacturacion ?? null,
      etapaInicial: primero.etapaInicial,
      estado: todas.some(a => a.estado !== 'CERRADA') ? 'ABIERTO' : principal.estado,
      deOtroOperador: principal.deOtroOperador || absorbido.deOtroOperador,
      juzgadoId: principal.juzgadoId ?? absorbido.juzgadoId,
      derechosInvolucrados: principal.derechosInvolucrados ?? absorbido.derechosInvolucrados
    }, { transaction })
    await registrarEnBitacora(principal.id, 'UNION', [
      { campo: 'Caso unido', despues: etiqueta(absorbido) },
      { campo: 'Motivo', despues: d.motivo.trim().slice(0, 500) }
    ], d.usuario, transaction)
    // Sin el gancho de la bitácora: el caso deja de existir y su historia ya pasó al principal
    await absorbido.destroy({ transaction, hooks: false })
    return { ids: archivos.map(a => a.id), carpetaAnterior: carpetaCaso(absorbido), carpetaNueva: carpetaCaso(principal) }
  })

  // Los documentos a la carpeta del principal, conservando la etapa y la subcarpeta
  let movidos = 0
  for (const archivo of await Archivo.findAll({ where: { id: archivosMovidos.ids } })) {
    if (!archivo.proveedor || !archivo.ruta?.startsWith(`${archivosMovidos.carpetaAnterior}/`)) continue
    const resto = archivo.ruta.slice(archivosMovidos.carpetaAnterior.length + 1).split('/').slice(0, -1).join('/')
    try {
      await archivo.update(await moverArchivo({ proveedor: archivo.proveedor, ruta: archivo.ruta, itemId: archivo.itemId, webUrl: archivo.webUrl }, [archivosMovidos.carpetaNueva, resto].filter(Boolean).join('/')))
      movidos++
    } catch (error) {
      console.error('❌ No se pudo mover el documento del caso unido', archivo.id, error)
    }
  }
  return { ok: true, documentos: archivosMovidos.ids.length, movidos }
}
