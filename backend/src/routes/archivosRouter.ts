import { Router } from 'express'
import { param } from 'express-validator'
import { Archivo } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { descargarArchivo } from '../services/almacenamiento'
import { responderError, ErrorNegocio } from '../utils/errores'

const router = Router()

router.get('/:id', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const archivo = await Archivo.findByPk(Number(req.params.id))
    if (!archivo?.rutaBlob) throw new ErrorNegocio('El archivo no está disponible', 404)
    const contenido = await descargarArchivo(archivo.rutaBlob)
    if (!contenido) throw new ErrorNegocio('El almacenamiento no está configurado', 503)
    res.setHeader('Content-Type', archivo.tipoMime || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(archivo.nombre)}`)
    contenido.pipe(res)
  } catch (error) {
    responderError(res, error)
  }
})

export default router
