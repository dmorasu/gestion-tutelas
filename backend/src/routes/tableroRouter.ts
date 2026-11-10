import { Router } from 'express'
import { requiereRol, tieneRol } from '../middleware/auth'
import { datosTablero, refrescarAns } from '../services/tablero'
import { ROLES } from '../services/constantes'
import { responderError } from '../utils/errores'

const router = Router()

// D28: el tablero de la operación. Lo ve la firma y el perfil de consulta del cliente; los
// descuentos y los casos sin remuneración (D29) solo los ve la firma
const ven = requiereRol(ROLES.COORDINADOR, ROLES.ASISTENTE, ROLES.REVISOR, ROLES.CONSULTA)

router.get('/', ven, async (req, res) => {
  try {
    const interno = tieneRol(req, ROLES.COORDINADOR, ROLES.ASISTENTE, ROLES.REVISOR)
    res.json(await datosTablero({ interno }))
  } catch (error) {
    responderError(res, error)
  }
})

// Recalcula ya la foto del ANS (normalmente se refresca sola cada 30 minutos)
router.post('/refrescar', requiereRol(ROLES.COORDINADOR), async (_req, res) => {
  try {
    await refrescarAns(true)
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

export default router
