import { Router } from 'express'
import multer from 'multer'
import { body, param, query } from 'express-validator'
import { Op } from 'sequelize'
import { Alerta, Caso, Informe, RadicadoOtroOperador, Usuario, Archivo } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol } from '../middleware/auth'
import { alcanceActuaciones } from '../services/permisosActuacion'
import { tableroDiario, calcularAns } from '../services/indicadores'
import { detectarAlertas, emitirAlerta, descartarAlerta, NOMBRES_ALERTA } from '../services/alertas'
import { generarInforme, periodoAnterior } from '../services/informes'
import { cargarArchivoMaestro } from '../services/archivoMaestro'
import { asistenciaDelDia, guardarAsistencia } from '../services/asistencia'
import { ROLES } from '../services/constantes'
import { enBogota } from '../utils/fechaColombia'
import { responderError, ErrorNegocio } from '../utils/errores'

const router = Router()
const coordinan = requiereRol(ROLES.COORDINADOR)
const supervisan = requiereRol(ROLES.COORDINADOR, ROLES.REVISOR, ROLES.ASISTENTE)
const carga = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } })

// Tablero diario: cada perfil ve lo suyo (el auxiliar sus casos; el revisor su equipo; el resto todo)
router.get('/tablero', async (req, res) => {
  try {
    res.json(await tableroDiario(alcanceActuaciones(req)))
  } catch (error) {
    responderError(res, error)
  }
})

// ANS de un periodo (por defecto, el mes en curso hasta hoy)
router.get('/ans', supervisan, query('desde').optional().isISO8601(), query('hasta').optional().isISO8601(), manejarErroresEntrada, async (req, res) => {
  try {
    const hoy = enBogota(new Date()).dia
    const desde = String(req.query.desde ?? `${hoy.slice(0, 8)}01`).slice(0, 10)
    const hasta = String(req.query.hasta ?? hoy).slice(0, 10)
    res.json({ desde, hasta, indicadores: await calcularAns(desde, hasta) })
  } catch (error) {
    responderError(res, error)
  }
})

// ── Alertas ──
router.get('/alertas', supervisan, async (req, res) => {
  try {
    const estado = String(req.query.estado || 'PENDIENTE')
    const alertas = await Alerta.findAll({
      where: estado === 'TODAS' ? {} : { estado },
      include: [{ model: Caso, attributes: ['id', 'numeroInterno', 'radicado'] }, { model: Usuario, attributes: ['nombre'] }],
      order: [['fechaDeteccion', estado === 'PENDIENTE' ? 'ASC' : 'DESC']],
      limit: 300
    })
    res.json({ alertas, nombres: NOMBRES_ALERTA })
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/alertas/detectar', supervisan, async (_req, res) => {
  try {
    res.json({ nuevas: await detectarAlertas() })
  } catch (error) {
    responderError(res, error)
  }
})

// Comunicar las alertas al cliente es del coordinador (roles del cliente)
router.post('/alertas/:id/emitir', coordinan, param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    res.json(await emitirAlerta({ alertaId: Number(req.params.id), usuarioId: req.usuario!.id, nota: req.body.nota }))
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/alertas/:id/descartar', coordinan, param('id').isInt(), body('motivo').isString(), manejarErroresEntrada, async (req, res) => {
  try {
    await descartarAlerta({ alertaId: Number(req.params.id), motivo: req.body.motivo, usuarioId: req.usuario!.id })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

// ── Informes ──
router.get('/informes', supervisan, async (_req, res) => {
  try {
    const informes = await Informe.findAll({
      include: [{ model: Usuario, attributes: ['nombre'] }, { model: Archivo, attributes: ['id', 'nombre', 'proveedor', 'webUrl'] }],
      order: [['desde', 'DESC'], ['createdAt', 'DESC']],
      limit: 100
    })
    res.json({ informes, sugerido: { SEMANAL: periodoAnterior('SEMANAL'), MENSUAL: periodoAnterior('MENSUAL') } })
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/informes', coordinan, body('tipo').isIn(['SEMANAL', 'MENSUAL']), body('desde').isISO8601(), manejarErroresEntrada, async (req, res) => {
  try {
    res.status(201).json(await generarInforme({ tipo: req.body.tipo, desde: String(req.body.desde).slice(0, 10), usuarioId: req.usuario!.id }))
  } catch (error) {
    responderError(res, error)
  }
})

// ── Archivo maestro de otros operadores ──
router.get('/archivo-maestro', supervisan, async (req, res) => {
  try {
    const q = String(req.query.q ?? '').replace(/\D/g, '')
    const [total, muestra, ultima, marcados] = await Promise.all([
      RadicadoOtroOperador.count(),
      RadicadoOtroOperador.findAll({ where: q.length >= 5 ? { radicado: { [Op.like]: `%${q}%` } } : {}, order: [['radicado', 'ASC']], limit: 100 }),
      RadicadoOtroOperador.findOne({ order: [['createdAt', 'DESC']], attributes: ['archivoMaestro', 'createdAt'] }),
      Caso.findAll({ where: { deOtroOperador: true }, attributes: ['id', 'numeroInterno', 'radicado', 'estado'], limit: 200 })
    ])
    res.json({ total, muestra, ultima, marcados })
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/archivo-maestro', coordinan, carga.single('archivo'), async (req, res) => {
  try {
    if (!req.file) throw new ErrorNegocio('Adjunte el archivo maestro')
    const nombre = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
    res.json(await cargarArchivoMaestro(req.file.buffer, nombre, String(req.body.operador ?? '').trim() || null))
  } catch (error) {
    responderError(res, error)
  }
})

// ── Asistencia diaria (D27, ANS-11) ──
const registranAsistencia = requiereRol(ROLES.COORDINADOR, ROLES.ASISTENTE)
router.get('/asistencia', registranAsistencia, query('fecha').optional().isISO8601(), manejarErroresEntrada, async (req, res) => {
  try {
    res.json(await asistenciaDelDia(String(req.query.fecha ?? enBogota(new Date()).dia).slice(0, 10)))
  } catch (error) {
    responderError(res, error)
  }
})

router.put('/asistencia', registranAsistencia, body('fecha').isISO8601(), body('registros').isArray({ min: 1 }), manejarErroresEntrada, async (req, res) => {
  try {
    res.json(await guardarAsistencia({ fecha: String(req.body.fecha).slice(0, 10), registros: req.body.registros, usuarioId: req.usuario!.id }))
  } catch (error) {
    responderError(res, error)
  }
})

export default router
