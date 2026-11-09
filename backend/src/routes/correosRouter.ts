import { Router } from 'express'
import { body, param } from 'express-validator'
import { Op } from 'sequelize'
import { Correo, Archivo, Caso, Juzgado, RadicadoOtroOperador, Actuacion, SincronizacionBuzon } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol } from '../middleware/auth'
import { registrarAsignacion } from '../services/registroCasos'
import { ROLES, ETAPAS, TIPOS_SOLICITUD, UNIDADES_TERMINO } from '../services/constantes'
import { responderError, ErrorNegocio } from '../utils/errores'
import { encolarLecturaBuzon } from '../queues/buzonQueue'

const router = Router()
const registran = requiereRol(ROLES.ASISTENTE, ROLES.COORDINADOR)

// Bandeja de correos (por defecto, los que faltan por registrar), del más antiguo al más nuevo:
// el que lleva más tiempo esperando es el que más consume del ANS
router.get('/', async (req, res) => {
  try {
    const estado = String(req.query.estado || 'POR_REGISTRAR')
    const pagina = Math.max(1, Number(req.query.pagina) || 1)
    const where: Record<string, unknown> = { direccion: 'ENTRANTE', estado }
    if (req.query.etapa) where.etapaDetectada = String(req.query.etapa)
    const { rows, count } = await Correo.findAndCountAll({
      where,
      attributes: ['id', 'remitente', 'nombreRemitente', 'asunto', 'fechaCorreo', 'etapaDetectada', 'fuenteEtapa', 'radicados', 'estado', 'casoId', 'proposito'],
      include: [
        { model: Archivo, attributes: ['id', 'nombre'] },
        { model: Caso, attributes: ['id', 'radicado', 'etapaActual'] }
      ],
      order: [['fechaCorreo', estado === 'POR_REGISTRAR' ? 'ASC' : 'DESC']],
      limit: 50,
      offset: (pagina - 1) * 50,
      distinct: true
    })
    // Radicados que el archivo maestro asigna a otro operador (ANS-13): se marcan antes de registrar
    const radicados = [...new Set(rows.flatMap(c => c.radicados))]
    const ajenos = new Set((await RadicadoOtroOperador.findAll({ where: { radicado: radicados }, attributes: ['radicado'] })).map(r => r.radicado))
    res.json({
      total: count,
      pagina,
      correos: rows.map(c => ({ ...c.toJSON(), deOtroOperador: c.radicados.some(r => ajenos.has(r)) }))
    })
  } catch (error) {
    responderError(res, error)
  }
})

router.get('/estado-buzon', async (_req, res) => {
  const estado = await SincronizacionBuzon.findOne({ where: { buzon: process.env.BUZON_CORREO ?? '' } })
  const porRegistrar = await Correo.count({ where: { direccion: 'ENTRANTE', estado: 'POR_REGISTRAR' } })
  res.json({ activo: process.env.BUZON_ACTIVO === 'true', buzon: process.env.BUZON_CORREO ?? null, estado, porRegistrar })
})

// Leer el buzón ya, sin esperar los 2 minutos
router.post('/sincronizar', requiereRol(ROLES.COORDINADOR, ROLES.ASISTENTE), async (_req, res) => {
  try {
    if (process.env.BUZON_ACTIVO !== 'true') throw new ErrorNegocio('La lectura del buzón no está activa (BUZON_ACTIVO)')
    await encolarLecturaBuzon()
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

// Detalle con el formulario precargado: radicado, juzgado (por el remitente o el código del
// despacho del radicado) y etapa (por el alias)
router.get('/:id', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.params.id), {
      include: [{ model: Archivo, attributes: ['id', 'nombre', 'tipoMime', 'tamano'] }, { model: Caso, include: [{ model: Actuacion, attributes: ['id', 'etapa', 'estado'] }] }]
    })
    if (!correo) throw new ErrorNegocio('El correo no existe', 404)
    const radicado = correo.radicados[0] ?? null
    const juzgado = await Juzgado.findOne({
      where: {
        [Op.or]: [
          ...(correo.remitente ? [{ correos: { [Op.contains]: [correo.remitente] } }] : []),
          ...(radicado ? [{ codigoDespacho: radicado.slice(0, 12) }] : [])
        ]
      },
      attributes: ['id', 'nombre']
    }).catch(() => null)
    const deOtroOperador = radicado ? !!(await RadicadoOtroOperador.findOne({ where: { radicado: correo.radicados } })) : false
    res.json({
      correo,
      sugerencia: {
        radicado,
        juzgadoId: juzgado?.id ?? correo.caso?.juzgadoId ?? null,
        etapa: correo.etapaDetectada,
        tipoSolicitud: correo.caso?.tipoSolicitud ?? 'TUTELA'
      },
      deOtroOperador
    })
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/:id/registrar',
  registran,
  param('id').isInt(),
  body('radicado').isString().notEmpty().withMessage('Falta el radicado'),
  body('tipoSolicitud').isIn(TIPOS_SOLICITUD),
  body('etapa').isIn(ETAPAS).withMessage('Etapa no válida'),
  body('terminoUnidad').optional({ values: 'null' }).isIn(UNIDADES_TERMINO),
  body('terminoValor').optional({ values: 'null' }).isInt({ min: 1 }),
  body('partes').optional().isArray(),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      const resultado = await registrarAsignacion({ ...req.body, correoId: Number(req.params.id) }, req.usuario!.id)
      res.status(201).json(resultado)
    } catch (error) {
      responderError(res, error)
    }
  })

// Correo de seguimiento de una actuación que no se emparejó solo
router.post('/:id/asociar', registran, param('id').isInt(), body('actuacionId').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.params.id))
    const actuacion = await Actuacion.findByPk(Number(req.body.actuacionId), { attributes: ['id', 'casoId'] })
    if (!correo || !actuacion) throw new ErrorNegocio('Correo o actuación no existen', 404)
    await correo.update({ estado: 'ASOCIADO', casoId: actuacion.casoId, actuacionId: actuacion.id, proposito: req.body.proposito ?? 'SEGUIMIENTO', usuarioId: req.usuario!.id })
    await Archivo.update({ casoId: actuacion.casoId, actuacionId: actuacion.id }, { where: { correoId: correo.id } })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

// Publicidad, respuestas automáticas, correos que no son de tutelas
router.post('/:id/descartar', registran, param('id').isInt(), body('motivo').isString().notEmpty().withMessage('Indique por qué se descarta'), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.params.id))
    if (!correo || correo.estado !== 'POR_REGISTRAR') throw new ErrorNegocio('El correo no está por registrar')
    await correo.update({ estado: 'DESCARTADO', error: String(req.body.motivo).slice(0, 500), usuarioId: req.usuario!.id })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

export default router
