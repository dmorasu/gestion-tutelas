import { Op, type Model, type Transaction, type WhereOptions } from 'sequelize'
import { Actuacion, HistorialCaso, ItemCatalogo, TramoActuacion, Usuario } from '../models'
import { parametro } from './parametros'
import { NOMBRES_ETAPAS } from './constantes'
import { contextoActual } from '../utils/contextoPeticion'
import { esDiaHabil, esMedioDia } from '../utils/diasHabiles'
import { enBogota, instanteBogota, sumarDias } from '../utils/fechaColombia'

// =====================================
// TIEMPOS Y PRODUCTIVIDAD (reunión 18-nov, fase 7)
// Cada cambio de estado de una actuación cierra el tramo en curso y abre el siguiente, con quién lo
// tiene. Con eso se estima cuánto toma cada paso por etapa y tipo de respuesta, y cuánto produce cada
// persona al día. Las horas que importan son las hábiles (jornada de días hábiles): un escrito que se
// toma a las 4 p. m. y se envía a las 9 a. m. no tomó 17 horas de trabajo.
// =====================================

type Fase = TramoActuacion['fase']
type Perfil = TramoActuacion['perfil']

// Qué paso es cada estado y de quién es. RADICADO y CERRADA no abren tramo: ya no hay trabajo nuestro
const PASO: Record<string, { fase: Fase, perfil: Perfil }> = {
  POR_ASUMIR: { fase: 'POR_ASUMIR', perfil: 'AUXILIAR' },
  EN_ANALISIS: { fase: 'ELABORACION', perfil: 'AUXILIAR' },
  EN_PROYECCION: { fase: 'ELABORACION', perfil: 'AUXILIAR' },
  EN_INSUMOS: { fase: 'INSUMOS', perfil: 'ENTIDAD' },
  EN_REVISION: { fase: 'REVISION', perfil: 'REVISOR' },
  AJUSTE_INTERNO: { fase: 'AJUSTE', perfil: 'AUXILIAR' },
  ENTREGADO: { fase: 'ENTIDAD', perfil: 'ENTIDAD' },
  DEVUELTO: { fase: 'CORRECCION', perfil: 'AUXILIAR' },
  APROBADO: { fase: 'RADICACION', perfil: 'ENTIDAD' }
}

export const NOMBRES_FASE: Record<Fase | 'CORREGIDO', string> = {
  REGISTRO: 'Registro de la asignación',
  POR_ASUMIR: 'Espera hasta que el auxiliar la toma',
  ELABORACION: 'Elaboración del escrito (V1)',
  CORREGIDO: 'Corrección del escrito',
  INSUMOS: 'Espera de insumos de la entidad',
  REVISION: 'Revisión',
  AJUSTE: 'Ajuste pedido por el revisor',
  ENTIDAD: 'Validación de la entidad',
  CORRECCION: 'Corrección de la devolución de la entidad',
  RADICACION: 'Radicación por la entidad'
}

// Fases en que el auxiliar trabaja el escrito: su suma hasta el envío a revisión es el tiempo de producción
const PRODUCCION = new Set<Fase>(['ELABORACION', 'AJUSTE', 'CORRECCION'])

// ── Horas hábiles ──

const redondear = (n: number) => Math.round(n * 100) / 100

// Horas entre dos instantes que caen dentro de la jornada (HORA_INICIO_JORNADA a HORA_FIN_JORNADA) de
// los días hábiles. Los medios días terminan en HORA_CORTE_MEDIO_DIA
export const horasHabilesEntre = (inicio: Date, fin: Date) => {
  if (fin <= inicio) return 0
  const apertura = parametro<string>('HORA_INICIO_JORNADA')
  let dia = enBogota(inicio).dia
  const ultimo = enBogota(fin).dia
  let ms = 0
  // Tope de un año: un tramo abierto por error no debe colgar el cálculo
  for (let i = 0; i < 370 && dia <= ultimo; i++, dia = sumarDias(dia, 1)) {
    if (!esDiaHabil(dia)) continue
    const cierre = esMedioDia(dia) ? parametro<string>('HORA_CORTE_MEDIO_DIA') : parametro<string>('HORA_FIN_JORNADA')
    const desde = Math.max(inicio.getTime(), instanteBogota(dia, apertura).getTime())
    const hasta = Math.min(fin.getTime(), instanteBogota(dia, cierre).getTime())
    if (hasta > desde) ms += hasta - desde
  }
  return redondear(ms / 3_600_000)
}

const medir = (inicio: Date, fin: Date) => ({ horas: redondear((fin.getTime() - inicio.getTime()) / 3_600_000), horasHabiles: horasHabilesEntre(inicio, fin) })

// ── Registro con los hooks de la actuación ──

type Foto = { id: number, casoId: number, etapa: string, estado: string, auxiliarId: number | null, revisorId: number | null }

const responsable = (perfil: Perfil, a: Foto) => (perfil === 'AUXILIAR' ? a.auxiliarId : perfil === 'REVISOR' ? a.revisorId : null)

const abrir = async (a: Foto, desde: Date) => {
  const paso = PASO[a.estado]
  if (!paso) return
  await TramoActuacion.create({ actuacionId: a.id, casoId: a.casoId, etapa: a.etapa, estado: a.estado, fase: paso.fase, perfil: paso.perfil, usuarioId: responsable(paso.perfil, a), inicio: desde })
}

const cerrarAbiertos = async (actuacionId: number, hasta: Date, estadoSiguiente: string | null) => {
  for (const t of await TramoActuacion.findAll({ where: { actuacionId, fin: null } })) {
    await t.update({ fin: hasta, estadoSiguiente, ...medir(t.inicio, hasta) })
  }
}

// Una actuación a la vez: dos cambios seguidos (tomar y pedir insumos en la misma petición) no deben
// cruzar sus escrituras
const colas = new Map<number, Promise<unknown>>()
const enCola = (id: number, fn: () => Promise<unknown>) => {
  const siguiente = (colas.get(id) ?? Promise.resolve()).then(fn).catch(error => console.error('❌ Tramos de la actuación:', error))
  colas.set(id, siguiente)
  void siguiente.finally(() => { if (colas.get(id) === siguiente) colas.delete(id) })
}

// Después de confirmar la transacción: si se revierte, el tramo no existió
const despues = (transaction: Transaction | null | undefined, fn: () => void) => (transaction ? transaction.afterCommit(fn) : fn())

// Se relee de la base al escribir: la instancia del hook puede venir con pocos atributos cargados
const fotoActual = async (id: number): Promise<Foto | null> => {
  const a = await Actuacion.findByPk(id, { attributes: ['id', 'casoId', 'etapa', 'estado', 'auxiliarId', 'revisorId'] })
  return a ? { id: a.id, casoId: a.casoId, etapa: a.etapa, estado: a.estado, auxiliarId: a.auxiliarId, revisorId: a.revisorId } : null
}

// Cambió el valor (solo si el atributo venía cargado: si no, previous y get son undefined)
const cambio = (i: Model, campo: string) => {
  const antes = i.previous(campo as never)
  const ahora = i.get(campo)
  return antes !== undefined && ahora !== undefined && antes !== ahora
}

let activo = false

export const activarTramos = () => {
  if (activo) return
  activo = true
  Actuacion.addHook('afterCreate', 'tramos', (i: Model, o: { transaction?: Transaction | null }) => {
    const id = Number(i.get('id'))
    const llegada = i.get('fechaAsignacion') as Date
    const registrada = new Date()
    // El paso del asistente: desde que llegó la asignación hasta que quedó registrada. Lo que registra
    // el lector del buzón o un script no es tiempo de nadie
    const quien = contextoActual()
    despues(o.transaction, () => enCola(id, async () => {
      const a = await fotoActual(id)
      if (!a) return
      if (llegada && llegada < registrada) {
        await TramoActuacion.create({
          actuacionId: a.id, casoId: a.casoId, etapa: a.etapa, estado: 'REGISTRO', estadoSiguiente: a.estado, fase: 'REGISTRO', perfil: 'ASISTENTE',
          usuarioId: quien.origen === 'WEB' || quien.origen === 'MASIVO' ? quien.usuarioId : null, inicio: llegada, fin: registrada, ...medir(llegada, registrada)
        })
      }
      await abrir(a, registrada)
    }))
  })
  Actuacion.addHook('afterUpdate', 'tramos', (i: Model, o: { transaction?: Transaction | null }) => {
    const id = Number(i.get('id'))
    const estado = String(i.get('estado'))
    // Si cambia quien tiene el paso en curso (reasignación), el tramo se parte: cada uno con su tiempo
    const perfil = PASO[estado]?.perfil
    const cambioResponsable = (perfil === 'AUXILIAR' && cambio(i, 'auxiliarId')) || (perfil === 'REVISOR' && cambio(i, 'revisorId'))
    if (!cambio(i, 'estado') && !cambio(i, 'etapa') && !cambioResponsable) return
    const ahora = new Date()
    despues(o.transaction, () => enCola(id, async () => {
      const a = await fotoActual(id)
      if (!a) return
      await cerrarAbiertos(a.id, ahora, a.estado)
      await abrir(a, ahora)
    }))
  })
  // Model.update en bloque no pasa por los hooks de cada fila si no se pide (lo pide también el historial)
  Actuacion.addHook('beforeBulkUpdate', 'tramos', (o: { individualHooks?: boolean }) => { o.individualHooks = true })
}

// Primera vez: arma los tramos de lo que ya existía a partir de los cambios de estado de la bitácora.
// Los responsables son los de hoy (la bitácora no guarda el id de cada uno): es una aproximación
// para no arrancar en cero. Solo corre con la tabla vacía
export const reconstruirTramos = async () => {
  if (await TramoActuacion.count()) return 0
  const actuaciones = await Actuacion.findAll({ attributes: ['id', 'casoId', 'etapa', 'estado', 'auxiliarId', 'revisorId', 'fechaAsignacion', 'createdAt'] })
  if (!actuaciones.length) return 0
  const historial = await HistorialCaso.findAll({
    where: { seccion: 'ACTUACION', actuacionId: { [Op.ne]: null } },
    attributes: ['actuacionId', 'accion', 'cambios', 'usuarioId', 'origen', 'createdAt'], order: [['createdAt', 'ASC']]
  })
  const porActuacion = new Map<number, HistorialCaso[]>()
  for (const h of historial) porActuacion.set(h.actuacionId!, [...(porActuacion.get(h.actuacionId!) ?? []), h])
  const filas: Record<string, unknown>[] = []
  for (const a of actuaciones) {
    const registros = porActuacion.get(a.id) ?? []
    const creado = registros.find(r => r.accion === 'CREADO')
    const registrada = (a.get('createdAt') as Date)
    const fotoA: Foto = { id: a.id, casoId: a.casoId, etapa: a.etapa, estado: a.estado, auxiliarId: a.auxiliarId, revisorId: a.revisorId }
    if (a.fechaAsignacion < registrada) {
      filas.push({
        actuacionId: a.id, casoId: a.casoId, etapa: a.etapa, estado: 'REGISTRO', fase: 'REGISTRO', perfil: 'ASISTENTE',
        usuarioId: creado && creado.origen !== 'BUZON' && creado.origen !== 'SISTEMA' ? creado.usuarioId : null,
        inicio: a.fechaAsignacion, fin: registrada, ...medir(a.fechaAsignacion, registrada)
      })
    }
    const cambios = registros.flatMap(r => {
      const c = r.cambios.find(x => x.campo === 'Estado')
      return r.accion === 'MODIFICADO' && c ? [{ antes: String(c.antes), despues: String(c.despues), cuando: r.createdAt as Date }] : []
    })
    let estado = cambios[0]?.antes ?? a.estado
    let desde = registrada
    for (const c of [...cambios, null]) {
      const paso = PASO[estado]
      const hasta = c ? c.cuando : null
      if (paso) {
        filas.push({
          actuacionId: a.id, casoId: a.casoId, etapa: a.etapa, estado, estadoSiguiente: c?.despues ?? null, fase: paso.fase, perfil: paso.perfil,
          usuarioId: responsable(paso.perfil, fotoA), inicio: desde, fin: hasta, ...(hasta ? medir(desde, hasta) : { horas: null, horasHabiles: null })
        })
      }
      if (c) { estado = c.despues; desde = c.cuando }
    }
  }
  await TramoActuacion.bulkCreate(filas)
  return filas.length
}

// ── Lecturas ──

type TramoPlano = Pick<TramoActuacion, 'actuacionId' | 'etapa' | 'estado' | 'estadoSiguiente' | 'fase' | 'perfil' | 'usuarioId' | 'inicio' | 'fin' | 'horasHabiles'>

// Un ciclo de producción termina cada vez que el auxiliar envía a revisión: suma sus horas de trabajo
// desde el envío anterior. El primero de la actuación es la elaboración; los demás, correcciones
export type Ciclo = { actuacionId: number, etapa: string, usuarioId: number | null, fin: Date, horasHabiles: number, tipo: 'ELABORADO' | 'CORREGIDO' }

export const ciclosDe = (tramos: TramoPlano[]): Ciclo[] => {
  const ciclos: Ciclo[] = []
  const porActuacion = new Map<number, TramoPlano[]>()
  for (const t of tramos) porActuacion.set(t.actuacionId, [...(porActuacion.get(t.actuacionId) ?? []), t])
  for (const lista of porActuacion.values()) {
    lista.sort((x, y) => x.inicio.getTime() - y.inicio.getTime())
    let horas = 0
    let envios = 0
    for (const t of lista) {
      if (!PRODUCCION.has(t.fase) || !t.fin) continue
      horas += t.horasHabiles ?? 0
      if (t.estadoSiguiente !== 'EN_REVISION') continue
      ciclos.push({ actuacionId: t.actuacionId, etapa: t.etapa, usuarioId: t.usuarioId, fin: t.fin, horasHabiles: redondear(horas), tipo: envios ? 'CORREGIDO' : 'ELABORADO' })
      envios++
      horas = 0
    }
  }
  return ciclos
}

const promedio = (xs: number[]) => (xs.length ? redondear(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
const mediana = (xs: number[]) => {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return redondear(o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2)
}

// Tramos de las actuaciones que tuvieron un envío a revisión en el rango, completos desde el inicio,
// para que el primer ciclo se reconozca como elaboración aunque haya empezado antes
const tramosConEnvios = async (ini: Date, fin: Date) => {
  const envios = await TramoActuacion.findAll({ where: { estadoSiguiente: 'EN_REVISION', fin: { [Op.gte]: ini, [Op.lt]: fin } }, attributes: ['actuacionId'], raw: true })
  const ids = [...new Set(envios.map(e => e.actuacionId))]
  if (!ids.length) return []
  return TramoActuacion.findAll({ where: { actuacionId: ids, fin: { [Op.lt]: fin } }, raw: true }) as unknown as Promise<TramoPlano[]>
}

export type Productividad = {
  usuarioId: number
  elaborados: number, horasElaboracion: number | null
  corregidos: number, horasCorreccion: number | null
  revisados: number, devueltosAuxiliar: number, horasRevision: number | null
  registrados: number, horasRegistro: number | null
}

// Productividad del día por persona: escritos elaborados y corregidos con su tiempo de producción
// (auxiliar), revisiones y devoluciones (revisor) y registros (asistente). alcance: solo las actuaciones
// que el perfil puede ver (como el cierre del día); usuarioIds limita a quiénes
export const productividadDelDia = async (dia: string, d: { alcance?: WhereOptions, usuarioIds?: number[] } = {}) => {
  const { usuarioIds } = d
  const ini = instanteBogota(dia, '00:00')
  const fin = instanteBogota(sumarDias(dia, 1), '00:00')
  let [tramos, cerrados] = await Promise.all([
    tramosConEnvios(ini, fin),
    TramoActuacion.findAll({ where: { fase: ['REVISION', 'REGISTRO'], fin: { [Op.gte]: ini, [Op.lt]: fin } }, raw: true }) as unknown as Promise<TramoPlano[]>
  ])
  if (d.alcance) {
    const candidatas = [...new Set([...tramos, ...cerrados].map(t => t.actuacionId))]
    const visibles = new Set((await Actuacion.findAll({ where: { [Op.and]: [d.alcance, { id: candidatas }] }, attributes: ['id'], raw: true })).map(a => a.id))
    tramos = tramos.filter(t => visibles.has(t.actuacionId))
    cerrados = cerrados.filter(t => visibles.has(t.actuacionId))
  }
  const ciclos = ciclosDe(tramos).filter(c => c.fin >= ini && c.fin < fin)
  const ids = new Set<number>([...ciclos.map(c => c.usuarioId), ...cerrados.map(t => t.usuarioId)].filter((x): x is number => !!x))
  const porUsuario = new Map<number, Productividad>()
  for (const id of ids) {
    if (usuarioIds && !usuarioIds.includes(id)) continue
    const suyos = ciclos.filter(c => c.usuarioId === id)
    const elaborados = suyos.filter(c => c.tipo === 'ELABORADO')
    const corregidos = suyos.filter(c => c.tipo === 'CORREGIDO')
    const revisiones = cerrados.filter(t => t.fase === 'REVISION' && t.usuarioId === id)
    const registros = cerrados.filter(t => t.fase === 'REGISTRO' && t.usuarioId === id)
    porUsuario.set(id, {
      usuarioId: id,
      elaborados: elaborados.length, horasElaboracion: promedio(elaborados.map(c => c.horasHabiles)),
      corregidos: corregidos.length, horasCorreccion: promedio(corregidos.map(c => c.horasHabiles)),
      revisados: revisiones.length, devueltosAuxiliar: revisiones.filter(t => t.estadoSiguiente === 'AJUSTE_INTERNO').length,
      horasRevision: promedio(revisiones.map(t => t.horasHabiles ?? 0)),
      registrados: registros.length, horasRegistro: promedio(registros.map(t => t.horasHabiles ?? 0))
    })
  }
  return porUsuario
}

type Medida = { fase: Fase | 'CORREGIDO', cantidad: number, promedio: number | null, mediana: number | null }
const medidas = (muestras: { fase: Fase | 'CORREGIDO', horas: number }[]): Medida[] => {
  const grupos = new Map<Fase | 'CORREGIDO', number[]>()
  for (const m of muestras) grupos.set(m.fase, [...(grupos.get(m.fase) ?? []), m.horas])
  const orden = Object.keys(NOMBRES_FASE)
  return [...grupos].map(([fase, xs]) => ({ fase, cantidad: xs.length, promedio: promedio(xs), mediana: mediana(xs) }))
    .sort((a, b) => orden.indexOf(a.fase) - orden.indexOf(b.fase))
}

// Estimado de tiempos de un periodo (lo que terminó entre desde y hasta, días de Bogotá): por paso, por
// etapa y tipo de respuesta, y por persona. Elaboración y corrección van por ciclo (suma de los tramos de
// trabajo hasta el envío a revisión); lo demás, por tramo
export const tiemposDelPeriodo = async (desde: string, hasta: string) => {
  const ini = instanteBogota(desde, '00:00')
  const fin = instanteBogota(sumarDias(hasta, 1), '00:00')
  const [conEnvios, otros] = await Promise.all([
    tramosConEnvios(ini, fin),
    TramoActuacion.findAll({ where: { fase: { [Op.notIn]: [...PRODUCCION] }, fin: { [Op.gte]: ini, [Op.lt]: fin } }, raw: true }) as unknown as Promise<TramoPlano[]>
  ])
  const ciclos = ciclosDe(conEnvios).filter(c => c.fin >= ini && c.fin < fin)
  type Muestra = { actuacionId: number, etapa: string, usuarioId: number | null, perfil: Perfil, fase: Fase | 'CORREGIDO', horas: number }
  const muestras: Muestra[] = [
    ...ciclos.map(c => ({ actuacionId: c.actuacionId, etapa: c.etapa, usuarioId: c.usuarioId, perfil: 'AUXILIAR' as const, fase: c.tipo === 'ELABORADO' ? 'ELABORACION' as const : 'CORREGIDO' as const, horas: c.horasHabiles })),
    ...otros.map(t => ({ actuacionId: t.actuacionId, etapa: t.etapa, usuarioId: t.usuarioId, perfil: t.perfil, fase: t.fase, horas: t.horasHabiles ?? 0 }))
  ]
  // El tipo de respuesta es el de la actuación hoy (se define al elaborar, después del registro)
  const actuaciones = await Actuacion.findAll({ where: { id: [...new Set(muestras.map(m => m.actuacionId))] }, attributes: ['id', 'tipoRespuestaId'], raw: true })
  const tipoDe = new Map(actuaciones.map(a => [a.id, a.tipoRespuestaId]))
  const tipos = await ItemCatalogo.findAll({ where: { id: [...new Set(actuaciones.map(a => a.tipoRespuestaId).filter((x): x is number => !!x))] }, attributes: ['id', 'nombre'], raw: true })
  const nombreTipo = new Map(tipos.map(t => [t.id, t.nombre]))
  const personas = await Usuario.findAll({ where: { id: [...new Set(muestras.map(m => m.usuarioId).filter((x): x is number => !!x))] }, attributes: ['id', 'nombre'], raw: true })
  const nombrePersona = new Map(personas.map(p => [p.id, p.nombre]))

  const agrupar = <K extends string>(clave: (m: Muestra) => K | null) => {
    const g = new Map<K, Muestra[]>()
    for (const m of muestras) {
      const k = clave(m)
      if (k !== null) g.set(k, [...(g.get(k) ?? []), m])
    }
    return g
  }
  const porEtapaTipo = [...agrupar(m => `${m.etapa}|${tipoDe.get(m.actuacionId) ?? ''}`)].map(([k, lista]) => {
    const [etapa, tipo] = k.split('|')
    return {
      etapa, nombreEtapa: NOMBRES_ETAPAS[etapa as keyof typeof NOMBRES_ETAPAS] ?? etapa,
      tipoRespuesta: tipo ? nombreTipo.get(Number(tipo)) ?? 'Sin tipo' : 'Sin tipo de respuesta',
      actuaciones: new Set(lista.map(m => m.actuacionId)).size, fases: medidas(lista)
    }
  }).sort((a, b) => a.nombreEtapa.localeCompare(b.nombreEtapa) || b.actuaciones - a.actuaciones)
  const porPersona = [...agrupar(m => (m.usuarioId && m.perfil !== 'ENTIDAD' ? `${m.usuarioId}|${m.perfil}` : null))].map(([k, lista]) => {
    const [id, perfil] = k.split('|')
    return { usuarioId: Number(id), nombre: nombrePersona.get(Number(id)) ?? '—', perfil, fases: medidas(lista) }
  }).sort((a, b) => a.perfil.localeCompare(b.perfil) || a.nombre.localeCompare(b.nombre))

  return { desde, hasta, general: medidas(muestras), porEtapaTipo, porPersona, nombresFase: NOMBRES_FASE }
}
