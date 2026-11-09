import { Router } from 'express'
import { body, param } from 'express-validator'
import { Parametro, DiaNoHabil, Juzgado, Usuario, Rol, MotivoDevolucion } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol } from '../middleware/auth'
import { cargarParametros, PARAMETROS_BASE } from '../services/parametros'
import { cargarCalendario } from '../services/calendario'
import { ROLES } from '../services/constantes'
import { responderError, ErrorNegocio } from '../utils/errores'
import { generarContrasenaTemporal } from '../utils/politicaContrasena'
import { cifrarContrasena } from '../utils/contrasenas'
import { desbloquearCuenta, minutosBloqueoCuenta } from '../utils/intentosLogin'

const router = Router()
const administran = requiereRol(ROLES.COORDINADOR)

// ── Parámetros (supuestos de las dudas pendientes) ──
router.get('/parametros', async (_req, res) => {
  res.json(await Parametro.findAll({ order: [['duda', 'ASC NULLS LAST'], ['clave', 'ASC']] }))
})

router.put('/parametros/:clave', administran, param('clave').isIn(Object.keys(PARAMETROS_BASE)), body('valor').exists(), manejarErroresEntrada, async (req, res) => {
  try {
    const p = await Parametro.findOne({ where: { clave: String(req.params.clave) } })
    if (!p) throw new ErrorNegocio('Parámetro no existe', 404)
    // Mismo tipo que el valor original (texto, número, sí/no, lista u objeto)
    const base = PARAMETROS_BASE[p.clave as keyof typeof PARAMETROS_BASE].valor
    const tipo = (v: unknown) => (Array.isArray(v) ? 'lista' : typeof v)
    if (tipo(base) !== tipo(req.body.valor)) throw new ErrorNegocio(`El valor debe ser de tipo ${tipo(base)}`)
    if (typeof base === 'string' && /^\d{2}:\d{2}$/.test(base) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.valor)) throw new ErrorNegocio('Hora no válida (HH:MM)')
    await p.update({ valor: req.body.valor, confirmado: !!req.body.confirmado })
    await cargarParametros(true)
    res.json(p)
  } catch (error) {
    responderError(res, error)
  }
})

// ── Días no hábiles (D3) ──
router.get('/dias-no-habiles', async (_req, res) => {
  res.json(await DiaNoHabil.findAll({ order: [['fecha', 'ASC']] }))
})

router.post('/dias-no-habiles', administran, body('fecha').isISO8601(), body('etapas').optional().isArray(), manejarErroresEntrada, async (req, res) => {
  try {
    const [dia] = await DiaNoHabil.upsert({ fecha: String(req.body.fecha).slice(0, 10), descripcion: req.body.descripcion ?? null, etapas: req.body.etapas ?? [] })
    await cargarCalendario(true)
    res.status(201).json(dia)
  } catch (error) {
    responderError(res, error)
  }
})

router.delete('/dias-no-habiles/:id', administran, param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  await DiaNoHabil.destroy({ where: { id: Number(req.params.id) } })
  await cargarCalendario(true)
  res.json({ ok: true })
})

// ── Juzgados ──
router.get('/juzgados', async (_req, res) => {
  res.json(await Juzgado.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] }))
})

router.post('/juzgados', requiereRol(ROLES.COORDINADOR, ROLES.ASISTENTE), body('nombre').isString().trim().notEmpty(), manejarErroresEntrada, async (req, res) => {
  try {
    const correos = (req.body.correos ?? []).map((c: string) => String(c).trim().toLowerCase()).filter(Boolean)
    res.status(201).json(await Juzgado.create({ nombre: req.body.nombre, ciudad: req.body.ciudad ?? null, codigoDespacho: req.body.codigoDespacho || null, correos }))
  } catch (error) {
    responderError(res, error)
  }
})

router.get('/motivos-devolucion', async (_req, res) => {
  res.json(await MotivoDevolucion.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] }))
})

// ── Usuarios y perfiles ──
router.get('/usuarios', async (req, res) => {
  const usuarios = await Usuario.findAll({
    attributes: ['id', 'nombre', 'correo', 'activo', 'capacidadDiaria', 'ultimoIngreso', 'debeCambiarContrasena'],
    include: [{ model: Rol, attributes: ['codigo', 'nombre'], through: { attributes: [] } }],
    order: [['nombre', 'ASC']]
  })
  // El administrador ve qué cuentas están bloqueadas por intentos fallidos
  const esAdmin = (req.roles ?? []).includes(ROLES.ADMIN)
  res.json(usuarios.map(u => ({ ...u.toJSON(), ...(esAdmin && { minutosBloqueo: minutosBloqueoCuenta(u.correo) }) })))
})

router.get('/roles', async (_req, res) => {
  res.json(await Rol.findAll({ order: [['id', 'ASC']] }))
})

// Sin registro público: el administrador crea el usuario con una contraseña temporal que se le
// muestra una sola vez para entregarla; el usuario la cambia al primer ingreso
router.post('/usuarios', requiereRol(ROLES.ADMIN),
  body('correo').isEmail().withMessage('Correo no válido'),
  body('nombre').isString().trim().notEmpty().withMessage('Falta el nombre'),
  body('roles').optional().isArray(),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      const correo = String(req.body.correo).trim().toLowerCase()
      if (await Usuario.findOne({ where: { correo } })) throw new ErrorNegocio('Ya existe un usuario con ese correo')
      const temporal = generarContrasenaTemporal()
      const usuario = await Usuario.create({ correo, nombre: req.body.nombre, contrasena: await cifrarContrasena(temporal), debeCambiarContrasena: true })
      if (Array.isArray(req.body.roles) && req.body.roles.length) await usuario.$set('roles', await Rol.findAll({ where: { codigo: req.body.roles } }))
      res.status(201).json({ id: usuario.id, contrasenaTemporal: temporal })
    } catch (error) {
      responderError(res, error)
    }
  })

// Olvidó la contraseña: el administrador le da una temporal nueva (y se cierran sus sesiones)
router.post('/usuarios/:id/restablecer-contrasena', requiereRol(ROLES.ADMIN), param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const usuario = await Usuario.findByPk(Number(req.params.id))
    if (!usuario) throw new ErrorNegocio('Usuario no existe', 404)
    const temporal = generarContrasenaTemporal()
    await usuario.update({ contrasena: await cifrarContrasena(temporal), debeCambiarContrasena: true, versionSesion: usuario.versionSesion + 1 })
    desbloquearCuenta(usuario.correo)
    res.json({ contrasenaTemporal: temporal })
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/usuarios/:id/desbloquear', requiereRol(ROLES.ADMIN), param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  const usuario = await Usuario.findByPk(Number(req.params.id), { attributes: ['correo'] })
  if (usuario) desbloquearCuenta(usuario.correo)
  res.json({ ok: true })
})

router.put('/usuarios/:id', requiereRol(ROLES.ADMIN), param('id').isInt(), body('roles').optional().isArray(), manejarErroresEntrada, async (req, res) => {
  try {
    const usuario = await Usuario.findByPk(Number(req.params.id))
    if (!usuario) throw new ErrorNegocio('Usuario no existe', 404)
    if (usuario.id === req.usuario!.id && req.body.activo === false) throw new ErrorNegocio('No puede desactivarse a sí mismo')
    await usuario.update({
      ...('activo' in req.body && { activo: !!req.body.activo }),
      ...('capacidadDiaria' in req.body && { capacidadDiaria: req.body.capacidadDiaria ? Number(req.body.capacidadDiaria) : null })
    })
    if (Array.isArray(req.body.roles)) {
      const roles = await Rol.findAll({ where: { codigo: req.body.roles } })
      await usuario.$set('roles', roles)
    }
    // Al desactivarlo o cambiarle los perfiles se cierra su sesión
    await usuario.increment('versionSesion')
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

export default router
