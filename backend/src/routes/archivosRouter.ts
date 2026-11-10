import { Router } from 'express'
import multer from 'multer'
import { body, param } from 'express-validator'
import { Actuacion, Archivo } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { leerArchivo } from '../services/almacenamiento'
import { guardarEnExpediente, type Subcarpeta } from '../services/expediente'
import { escritoEnElaboracion } from '../services/flujoEscritos'
import { exigirResponsable, exigirRevisor } from '../services/permisosActuacion'
import { responderError, ErrorNegocio } from '../utils/errores'

const router = Router()

// En memoria: el archivo pasa directo a SharePoint, no se queda en el servidor
const carga = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024, files: 15 } })

// Ver o descargar desde la app (PDF e imágenes se abren en el navegador)
router.get('/:id', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const archivo = await Archivo.findByPk(Number(req.params.id))
    if (!archivo?.proveedor) throw new ErrorNegocio('El archivo no está disponible', 404)
    const contenido = await leerArchivo(archivo)
    if (!contenido) throw new ErrorNegocio('No se encontró el archivo en el repositorio', 404)
    const descargar = req.query.descargar === '1'
    res.setHeader('Content-Type', archivo.tipoMime || 'application/octet-stream')
    res.setHeader('Content-Disposition', `${descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`)
    res.send(contenido)
  } catch (error) {
    responderError(res, error)
  }
})

const TIPOS_CARGA = ['ESCRITO', 'ANEXO', 'INSUMO', 'SOPORTE'] as const

// Subir documentos al expediente de una actuación. Escrito y anexos van al paquete en elaboración
// (Escritos/V1, V2...); insumos y soportes, a su carpeta
router.post('/',
  carga.array('archivos'),
  body('actuacionId').isInt(),
  body('tipo').isIn(TIPOS_CARGA).withMessage('Tipo de documento no válido'),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      const archivos = (req.files ?? []) as Express.Multer.File[]
      if (!archivos.length) throw new ErrorNegocio('No llegó ningún archivo')
      const actuacion = await Actuacion.findByPk(Number(req.body.actuacionId))
      if (!actuacion) throw new ErrorNegocio('La actuación no existe', 404)
      exigirResponsable(req, actuacion)

      const tipo = req.body.tipo as typeof TIPOS_CARGA[number]
      let sub: Subcarpeta = tipo === 'INSUMO' ? 'Insumos' : 'Soportes'
      let escritoId: number | null = null
      if (tipo === 'ESCRITO' || tipo === 'ANEXO') {
        const escrito = await escritoEnElaboracion(actuacion.id)
        // Con el revisor, solo él (o el coordinador) cambia el paquete: puede corregir algo menor y entregar
        if (escrito.estado === 'EN_REVISION') exigirRevisor(req, actuacion)
        sub = `Escritos/V${escrito.version}`
        escritoId = escrito.id
      }
      const guardados = []
      for (const a of archivos) {
        // multer entrega el nombre en latin1
        const nombre = Buffer.from(a.originalname, 'latin1').toString('utf8')
        guardados.push(await guardarEnExpediente({ actuacionId: actuacion.id, sub, nombre, contenido: a.buffer, tipoMime: a.mimetype, tipo, escritoId, usuarioId: req.usuario!.id }))
      }
      res.status(201).json(guardados)
    } catch (error) {
      responderError(res, error)
    }
  })

export default router
