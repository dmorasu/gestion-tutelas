import { Router } from 'express'
import { body, param } from 'express-validator'
import { Op, type WhereOptions } from 'sequelize'
import { Caso, Parte, Actuacion, Juzgado, Usuario, SolicitudInsumo, Escrito, Devolucion, Decision, RadicacionJuzgado, Correo, Archivo, HistorialCaso } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol, tieneRol } from '../middleware/auth'
import { registrarAsignacion, recalcularPlazos } from '../services/registroCasos'
import { semaforo } from '../services/plazos'
import { parametro } from '../services/parametros'
import { ROLES, ETAPAS, TIPOS_SOLICITUD, UNIDADES_TERMINO, ESTADOS_ACTUACION } from '../services/constantes'
import { normalizarRadicado } from '../utils/radicado'
import { responderError, ErrorNegocio } from '../utils/errores'

const router = Router()
const HORA = 60 * 60 * 1000
const ABIERTA = { [Op.ne]: 'CERRADA' }

// Rango de fechas límite de cada color del semáforo (para filtrar en la base)
const rangoSemaforo = (color: string) => {
  const ahora = Date.now()
  const rojo = new Date(ahora + parametro<number>('SEMAFORO_HORAS_ROJO') * HORA)
  const amarillo = new Date(ahora + parametro<number>('SEMAFORO_HORAS_AMARILLO') * HORA)
  switch (color) {
    case 'VENCIDO': return { [Op.lt]: new Date(ahora) }
    case 'ROJO': return { [Op.gte]: new Date(ahora), [Op.lt]: rojo }
    case 'AMARILLO': return { [Op.gte]: rojo, [Op.lt]: amarillo }
    case 'VERDE': return { [Op.gte]: amarillo }
    case 'SIN_FECHA': return { [Op.is]: null }
    default: return undefined
  }
}

// =====================================
// TABLERO: actuaciones abiertas, la de fecha límite más cercana primero
// El auxiliar y el abogado ven por defecto solo lo suyo
// =====================================
router.get('/', async (req, res) => {
  try {
    const pagina = Math.max(1, Number(req.query.pagina) || 1)
    const where: WhereOptions = { estado: req.query.estado ? String(req.query.estado) : ABIERTA }
    const w = where as Record<string | symbol, unknown>
    if (req.query.etapa) w.etapa = String(req.query.etapa)
    if (req.query.auxiliarId) w.auxiliarId = Number(req.query.auxiliarId)
    if (req.query.abogadoId) w.abogadoId = Number(req.query.abogadoId)
    const soloPropias = !tieneRol(req, ROLES.COORDINADOR, ROLES.ASISTENTE) && req.query.todos !== '1'
    if (soloPropias) w[Op.or] = [{ auxiliarId: req.usuario!.id }, { abogadoId: req.usuario!.id }]
    const rango = req.query.semaforo ? rangoSemaforo(String(req.query.semaforo)) : undefined
    if (rango) w.fechaLimiteEntrega = rango

    // Búsqueda por radicado, nombre o documento del accionante. Primero los casos y luego se
    // filtra por id: un $anidado$ con límite y hasMany falla en Sequelize
    const q = String(req.query.q ?? '').trim()
    if (q) {
      const digitos = normalizarRadicado(q)
      const [porRadicado, porParte] = await Promise.all([
        digitos.length >= 5 ? Caso.findAll({ where: { radicado: { [Op.like]: `%${digitos}%` } }, attributes: ['id'], limit: 500 }) : [],
        Parte.findAll({ where: { [Op.or]: [{ nombre: { [Op.iLike]: `%${q}%` } }, { numeroDocumento: q }] }, attributes: ['casoId'], limit: 500 })
      ])
      w.casoId = [...new Set([...porRadicado.map(c => c.id), ...porParte.map(p => p.casoId)])]
    }

    const { rows, count } = await Actuacion.findAndCountAll({
      where,
      include: [
        {
          // juzgadoId es necesario para unir el juzgado incluido abajo
          model: Caso, required: true, attributes: ['id', 'radicado', 'tipoSolicitud', 'deOtroOperador', 'juzgadoId'],
          include: [{ model: Parte, attributes: ['nombre', 'numeroDocumento'], required: false }, { model: Juzgado, attributes: ['nombre'] }]
        },
        { model: Usuario, as: 'auxiliar', attributes: ['id', 'nombre'] },
        { model: Usuario, as: 'abogado', attributes: ['id', 'nombre'] }
      ],
      order: [['fechaLimiteEntrega', 'ASC NULLS LAST'], ['fechaAsignacion', 'ASC']],
      limit: 50,
      offset: (pagina - 1) * 50,
      distinct: true
    })
    res.json({
      total: count,
      pagina,
      actuaciones: rows.map(a => ({ ...a.toJSON(), semaforo: semaforo(a.fechaLimiteEntrega) }))
    })
  } catch (error) {
    responderError(res, error)
  }
})

// Totales del inicio: por semáforo y por registrar
router.get('/resumen', async (req, res) => {
  try {
    const propias = !tieneRol(req, ROLES.COORDINADOR, ROLES.ASISTENTE)
      ? { [Op.or]: [{ auxiliarId: req.usuario!.id }, { abogadoId: req.usuario!.id }] }
      : {}
    const colores = ['VENCIDO', 'ROJO', 'AMARILLO', 'VERDE', 'SIN_FECHA']
    const conteos = await Promise.all(colores.map(c => Actuacion.count({ where: { ...propias, estado: ABIERTA, fechaLimiteEntrega: rangoSemaforo(c) } })))
    const porEtapa = await Actuacion.count({ where: { ...propias, estado: ABIERTA }, group: ['etapa'] })
    const porRegistrar = await Correo.count({ where: { direccion: 'ENTRANTE', estado: 'POR_REGISTRAR' } })
    res.json({ semaforo: Object.fromEntries(colores.map((c, i) => [c, conteos[i]])), porEtapa, porRegistrar })
  } catch (error) {
    responderError(res, error)
  }
})

// Registro manual (sin correo): la fecha de asignación la indica el asistente
router.post('/',
  requiereRol(ROLES.ASISTENTE, ROLES.COORDINADOR),
  body('radicado').isString().notEmpty(),
  body('tipoSolicitud').isIn(TIPOS_SOLICITUD),
  body('etapa').isIn(ETAPAS),
  body('fechaAsignacion').isISO8601().withMessage('Indique la fecha y hora de asignación'),
  body('terminoUnidad').optional({ values: 'null' }).isIn(UNIDADES_TERMINO),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      res.status(201).json(await registrarAsignacion({ ...req.body, correoId: null }, req.usuario!.id))
    } catch (error) {
      responderError(res, error)
    }
  })

router.get('/:id', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const caso = await Caso.findByPk(Number(req.params.id), {
      include: [
        { model: Parte },
        { model: Juzgado, attributes: ['id', 'nombre'] },
        { model: Usuario, as: 'registradoPor', attributes: ['nombre'] },
        {
          model: Actuacion,
          separate: true,
          order: [['fechaAsignacion', 'ASC']],
          include: [
            { model: Usuario, as: 'auxiliar', attributes: ['id', 'nombre'] },
            { model: Usuario, as: 'abogado', attributes: ['id', 'nombre'] },
            { model: SolicitudInsumo, separate: true, order: [['createdAt', 'ASC']] },
            { model: Escrito, separate: true, order: [['version', 'ASC']], include: [{ model: Devolucion }] },
            { model: Decision, separate: true },
            { model: RadicacionJuzgado, separate: true }
          ]
        }
      ]
    })
    if (!caso) throw new ErrorNegocio('El caso no existe', 404)
    const [correos, archivos] = await Promise.all([
      Correo.findAll({ where: { casoId: caso.id }, attributes: ['id', 'direccion', 'remitente', 'asunto', 'fechaCorreo', 'proposito', 'actuacionId'], order: [['fechaCorreo', 'DESC']] }),
      Archivo.findAll({ where: { casoId: caso.id }, attributes: ['id', 'nombre', 'tipoMime', 'tamano', 'actuacionId', 'correoId', 'createdAt'] })
    ])
    const datos = caso.toJSON() as Record<string, unknown> & { actuaciones?: Record<string, unknown>[] }
    datos.actuaciones = (caso.actuaciones ?? []).map(a => ({ ...a.toJSON(), semaforo: a.estado === 'CERRADA' ? null : semaforo(a.fechaLimiteEntrega) }))
    res.json({ caso: datos, correos, archivos })
  } catch (error) {
    responderError(res, error)
  }
})

router.get('/:id/historial', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  const historial = await HistorialCaso.findAll({ where: { casoId: Number(req.params.id) }, order: [['createdAt', 'DESC']], limit: 300 })
  res.json(historial)
})

// =====================================
// ACTUACIONES
// =====================================
// Auxiliar y abogado solo trabajan sus actuaciones; asistencia y coordinación, todas
const exigirResponsable = (req: Parameters<typeof tieneRol>[0], a: Actuacion) => {
  if (tieneRol(req, ROLES.COORDINADOR, ROLES.ASISTENTE)) return
  if (a.auxiliarId !== req.usuario!.id && a.abogadoId !== req.usuario!.id) throw new ErrorNegocio('Esta actuación no está asignada a usted', 403)
}

const CAMPOS_EDITABLES =['fechaNotificacion', 'terminoValor', 'terminoUnidad', 'auxiliarId', 'abogadoId', 'requiereInsumos', 'requiereRevisionAbogado', 'loQueSePide', 'estado', 'responsableCumplimiento', 'origenImpugnacion'] as const
const CAMBIAN_PLAZOS = new Set(['fechaNotificacion', 'terminoValor', 'terminoUnidad', 'requiereInsumos'])

router.patch('/actuaciones/:id',
  param('id').isInt(),
  body('terminoUnidad').optional({ values: 'null' }).isIn(UNIDADES_TERMINO),
  body('estado').optional().isIn(ESTADOS_ACTUACION),
  body('fechaNotificacion').optional({ values: 'null' }).isISO8601(),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      const actuacion = await Actuacion.findByPk(Number(req.params.id))
      if (!actuacion) throw new ErrorNegocio('La actuación no existe', 404)
      exigirResponsable(req, actuacion)
      // Reasignar responsables: coordinador o asistente
      const cambiaResponsable = 'auxiliarId' in req.body || 'abogadoId' in req.body
      if (cambiaResponsable && !tieneRol(req, ROLES.COORDINADOR, ROLES.ASISTENTE)) throw new ErrorNegocio('Solo coordinación o asistencia reasignan responsables', 403)
      const cambios = Object.fromEntries(CAMPOS_EDITABLES.filter(c => c in req.body).map(c => [c, req.body[c] === '' ? null : req.body[c]]))
      if (cambios.estado === 'CERRADA') cambios.fechaCierre = new Date()
      await actuacion.update(cambios)
      if (Object.keys(cambios).some(c => CAMBIAN_PLAZOS.has(c))) await recalcularPlazos(actuacion.id)
      res.json(await Actuacion.findByPk(actuacion.id))
    } catch (error) {
      responderError(res, error)
    }
  })

// El auxiliar toma la actuación (paso "Asume y revisa")
router.post('/actuaciones/:id/asumir', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const actuacion = await Actuacion.findByPk(Number(req.params.id))
    if (!actuacion) throw new ErrorNegocio('La actuación no existe', 404)
    // Sin auxiliar asignado, cualquier auxiliar puede tomarla
    if (actuacion.auxiliarId) exigirResponsable(req, actuacion)
    if (actuacion.estado !== 'POR_ASUMIR') throw new ErrorNegocio('La actuación ya fue asumida')
    await actuacion.update({
      estado: actuacion.requiereInsumos ? 'EN_INSUMOS' : 'EN_PROYECCION',
      fechaAsumida: new Date(),
      auxiliarId: actuacion.auxiliarId ?? req.usuario!.id
    })
    res.json(actuacion)
  } catch (error) {
    responderError(res, error)
  }
})

export default router
