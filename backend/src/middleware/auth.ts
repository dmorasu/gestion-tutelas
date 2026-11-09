import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { Usuario, Rol } from '../models'
import { ROLES } from '../services/constantes'
import { ejecutarConContexto, origenDeRuta } from '../utils/contextoPeticion'

declare global {
  namespace Express {
    interface Request {
      usuario?: Usuario
      roles?: string[]
    }
  }
}

export const firmarSesion = (usuario: Usuario) =>
  jwt.sign({ id: usuario.id, v: usuario.versionSesion }, process.env.JWT_SECRET as string, { expiresIn: '10h' })

const noAutorizado = (res: Response, message: string) => res.status(401).json({ error: message })

// La sesión es un JWT propio emitido en el login. El frontend lo guarda en la cookie TOKEN y lo
// envía como Bearer (patrón de Nodex)
export const autenticacion = async (req: Request, res: Response, next: NextFunction) => {
  let token = req.cookies?.TOKEN as string | undefined
  if (!token && req.headers.authorization) token = req.headers.authorization.split(' ')[1]
  if (!token) return noAutorizado(res, 'Usuario no autorizado')

  try {
    const decodificado = jwt.verify(token, process.env.JWT_SECRET as string)
    if (typeof decodificado !== 'object' || !decodificado.id) return noAutorizado(res, 'Token no válido')

    const usuario = await Usuario.findByPk(decodificado.id, {
      attributes: ['id', 'nombre', 'correo', 'versionSesion', 'activo', 'debeCambiarContrasena'],
      include: [{ model: Rol, attributes: ['codigo'], through: { attributes: [] } }]
    })
    if (!usuario || !usuario.activo) return noAutorizado(res, 'Usuario no existe o está inactivo')
    // Sesión cerrada después de emitir el token
    if (decodificado.v !== usuario.versionSesion) return noAutorizado(res, 'La sesión ya no es válida: inicie sesión de nuevo')
    // Con la contraseña temporal solo puede ver su sesión y cambiarla
    if (usuario.debeCambiarContrasena && !req.originalUrl.startsWith('/api/auth/')) {
      return res.status(403).json({ error: 'Debe cambiar la contraseña temporal antes de continuar' })
    }

    req.usuario = usuario
    req.roles = (usuario.roles ?? []).map(r => r.codigo)
    // El historial del caso registra quién hizo cada cambio
    ejecutarConContexto({ usuarioId: usuario.id, nombre: usuario.nombre, origen: origenDeRuta(req.originalUrl) }, next)
  } catch {
    return noAutorizado(res, 'Token no válido')
  }
}

// El Administrador pasa siempre
export const requiereRol = (...roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
  const propios = req.roles ?? []
  if (propios.includes(ROLES.ADMIN) || roles.some(r => propios.includes(r))) return next()
  return res.status(403).json({ error: 'No tiene permiso para esta acción' })
}

export const tieneRol = (req: Request, ...roles: string[]) =>
  (req.roles ?? []).includes(ROLES.ADMIN) || roles.some(r => (req.roles ?? []).includes(r))
