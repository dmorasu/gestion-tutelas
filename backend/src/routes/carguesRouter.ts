import { Router } from 'express'
import multer from 'multer'
import { body } from 'express-validator'
import { Archivo, Correo } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol } from '../middleware/auth'
import { analizarExcel, registrarFilas, acusarPaquete } from '../services/cargueExcel'
import { guardarArchivo, leerArchivo } from '../services/almacenamiento'
import { ETAPAS, ROLES, TIPOS_SOLICITUD } from '../services/constantes'
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

router.post('/registrar',
  body('filas').isArray({ min: 1, max: 50 }).withMessage('Envíe entre 1 y 50 filas por tanda'),
  body('fechaAsignacion').isISO8601().withMessage('Indique la fecha y hora de asignación'),
  body('etapaPorDefecto').optional({ values: 'falsy' }).isIn(ETAPAS),
  body('tipoSolicitud').isIn(TIPOS_SOLICITUD),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      const archivo = req.body.archivoId ? await Archivo.findByPk(Number(req.body.archivoId), { attributes: ['nombre', 'correoId'] }) : null
      const origen = archivo ? `Cargue de Excel: ${archivo.nombre}${archivo.correoId ? ` (correo #${archivo.correoId})` : ''}` : 'Cargue de Excel'
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
