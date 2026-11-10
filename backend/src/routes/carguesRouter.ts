import { Router } from 'express'
import multer from 'multer'
import { body } from 'express-validator'
import { Archivo, Correo } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol } from '../middleware/auth'
import { analizarExcel, registrarFilas, acusarPaquete } from '../services/cargueExcel'
import { guardarArchivo, leerArchivo } from '../services/almacenamiento'
import { ETAPAS, ETAPA_EN_ASUNTO, NOMBRES_CRITICIDAD, ROLES, TIPOS_SOLICITUD } from '../services/constantes'
import { textoFechaHora } from '../utils/fechaColombia'
import { responderError, ErrorNegocio } from '../utils/errores'

const router = Router()
const carga = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } })
router.use(requiereRol(ROLES.ASISTENTE, ROLES.COORDINADOR))

// Lee el Excel: subido aquí o adjunto de un correo de la bandeja (archivoId). Si vino en un correo,
// la fecha de asignación es la de llegada del correo (protege el ANS, igual que una asignación sola)
router.post('/analizar', carga.single('archivo'), async (req, res) => {
  try {
    let archivo: Archivo | null = null
    let contenido: Buffer | null = null
    if (req.file) {
      const nombre = Buffer.from(req.file.originalname, 'latin1').toString('utf8')
      contenido = req.file.buffer
      // El Excel queda en el repositorio: es el soporte de la asignación
      const hoy = new Date()
      const ubicacion = await guardarArchivo(`Cargues/${hoy.getFullYear()}/${String(hoy.getMonth() + 1).padStart(2, '0')}`, nombre, contenido, req.file.mimetype)
      archivo = await Archivo.create({ nombre, tipoMime: req.file.mimetype, tamano: contenido.length, tipo: 'SOPORTE', ...ubicacion, usuarioId: req.usuario!.id })
    } else if (req.body.archivoId) {
      archivo = await Archivo.findByPk(Number(req.body.archivoId))
      if (!archivo) throw new ErrorNegocio('El archivo no existe', 404)
      contenido = await leerArchivo(archivo)
    }
    if (!archivo || !contenido) throw new ErrorNegocio('Adjunte el Excel')
    const correo = archivo.correoId ? await Correo.findByPk(archivo.correoId, { attributes: ['id', 'asunto', 'remitente', 'fechaCorreo', 'estado'] }) : null
    res.json({ ...(await analizarExcel(contenido, archivo.nombre)), archivo: { id: archivo.id, nombre: archivo.nombre }, correo })
  } catch (error) {
    responderError(res, error)
  }
})

// Correo con varios radicados en el texto (sin Excel): la misma pantalla del cargue, una fila por
// radicado, con la etapa, la criticidad y el vencimiento que traía el asunto
router.post('/desde-correo', body('correoId').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.body.correoId), { attributes: ['id', 'asunto', 'remitente', 'fechaCorreo', 'estado', 'radicados', 'etapaDetectada', 'criticidadDetectada', 'vencimientoDetectado'] })
    if (!correo) throw new ErrorNegocio('El correo no existe', 404)
    if (correo.estado !== 'POR_REGISTRAR') throw new ErrorNegocio('Este correo ya fue registrado o descartado')
    if (!correo.radicados.length) throw new ErrorNegocio('El correo no trae radicados')
    const etapa = correo.etapaDetectada ? ETAPA_EN_ASUNTO[correo.etapaDetectada] : ''
    const criticidad = correo.criticidadDetectada ? NOMBRES_CRITICIDAD[correo.criticidadDetectada] : ''
    const vence = correo.vencimientoDetectado ? textoFechaHora(correo.vencimientoDetectado) : ''
    res.json({
      hoja: 'Correo',
      encabezados: ['Radicado', 'Etapa', 'Criticidad', 'Vence'],
      filas: correo.radicados.map(r => [r, etapa, criticidad, vence]),
      mapeo: { radicado: 0, etapa: 1, criticidad: 2, vencimiento: 3, notificacion: null, accionante: null, documento: null, juzgado: null, derechos: null, observaciones: null },
      archivo: null,
      correo
    })
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/registrar',
  body('filas').isArray({ min: 1, max: 50 }).withMessage('Envíe entre 1 y 50 filas por tanda'),
  body('fechaAsignacion').isISO8601().withMessage('Indique la fecha y hora de asignación'),
  body('etapaPorDefecto').optional({ values: 'falsy' }).isIn(ETAPAS),
  body('tipoSolicitud').isIn(TIPOS_SOLICITUD),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      const archivo = req.body.archivoId ? await Archivo.findByPk(Number(req.body.archivoId), { attributes: ['nombre', 'correoId'] }) : null
      const origen = archivo ? `Cargue de Excel: ${archivo.nombre}${archivo.correoId ? ` (correo #${archivo.correoId})` : ''}`
        : req.body.correoId ? `Asignación en paquete (correo #${Number(req.body.correoId)})` : 'Cargue de Excel'
      res.json(await registrarFilas({
        filas: req.body.filas, fechaAsignacion: req.body.fechaAsignacion, etapaPorDefecto: req.body.etapaPorDefecto || null,
        tipoSolicitud: req.body.tipoSolicitud, origen, usuarioId: req.usuario!.id
      }))
    } catch (error) {
      responderError(res, error)
    }
  })

router.post('/acuse', body('correoId').isInt(), body('registrados').isArray(), manejarErroresEntrada, async (req, res) => {
  try {
    await acusarPaquete({ correoId: Number(req.body.correoId), registrados: req.body.registrados, usuarioId: req.usuario!.id })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

export default router
