import { Router } from 'express'
import { body } from 'express-validator'
import { Usuario } from '../models'
import { autenticacion, firmarSesion } from '../middleware/auth'
import { manejarErroresEntrada } from '../middleware/validacion'
import { contrasenaSegura } from '../utils/politicaContrasena'
import { cifrarContrasena, contrasenaCoincide, hashDeRelleno } from '../utils/contrasenas'
import { ipCliente, minutosBloqueo, registrarExito, registrarFallo } from '../utils/intentosLogin'

const router = Router()

// =====================================
// LOGIN PROPIO (correo y contraseña), sin registro público: los usuarios los crea el administrador.
// Mismo mensaje si el correo no existe o la contraseña no coincide, y límite de intentos.
// =====================================
router.post('/login',
  body('correo').isEmail().withMessage('Correo no válido'),
  body('contrasena').isString().notEmpty().withMessage('Escriba la contraseña'),
  manejarErroresEntrada,
  async (req, res) => {
    const correo = String(req.body.correo).trim().toLowerCase()
    const ip = ipCliente(req)

    const minutos = minutosBloqueo(correo, ip)
    if (minutos > 0) return res.status(429).json({ error: `Demasiados intentos fallidos. Intente de nuevo en ${minutos} minuto(s)` })

    const usuario = await Usuario.scope('conContrasena').findOne({ where: { correo } })
    const correcta = await contrasenaCoincide(req.body.contrasena, usuario?.contrasena ?? await hashDeRelleno())
    if (!usuario || !correcta || !usuario.activo) {
      registrarFallo(correo, ip)
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' })
    }

    registrarExito(correo)
    await usuario.update({ ultimoIngreso: new Date() })
    res.json({ token: firmarSesion(usuario), debeCambiarContrasena: usuario.debeCambiarContrasena })
  })

router.get('/me', autenticacion, (req, res) => {
  const u = req.usuario!
  res.json({ id: u.id, nombre: u.nombre, correo: u.correo, roles: req.roles ?? [], equipoId: u.equipoId ?? null, debeCambiarContrasena: u.debeCambiarContrasena })
})

// Cambio de contraseña (obligatorio con la temporal). Cierra las demás sesiones: devuelve un token nuevo
router.post('/cambiar-contrasena',
  autenticacion,
  body('contrasenaActual').isString().notEmpty().withMessage('Escriba la contraseña actual'),
  contrasenaSegura('contrasena', 'La contraseña nueva'),
  manejarErroresEntrada,
  async (req, res) => {
    const usuario = await Usuario.scope('conContrasena').findByPk(req.usuario!.id)
    if (!usuario || !(await contrasenaCoincide(req.body.contrasenaActual, usuario.contrasena))) {
      return res.status(400).json({ error: 'La contraseña actual es incorrecta' })
    }
    if (req.body.contrasenaActual === req.body.contrasena) return res.status(400).json({ error: 'La contraseña nueva debe ser distinta de la actual' })
    await usuario.update({
      contrasena: await cifrarContrasena(req.body.contrasena),
      debeCambiarContrasena: false,
      versionSesion: usuario.versionSesion + 1
    })
    res.json({ token: firmarSesion(usuario) })
  })

// Cerrar sesión invalida todos los tokens emitidos hasta ahora
router.post('/salir', autenticacion, async (req, res) => {
  await req.usuario!.increment('versionSesion')
  res.json({ ok: true })
})

export default router
