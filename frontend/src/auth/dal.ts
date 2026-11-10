import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"
import { NOMBRE_COOKIE } from "./constantes"
import { tieneRol, type CodigoRol } from "./permisos"

const SesionSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  correo: z.string(),
  roles: z.array(z.string()),
  equipoId: z.number().nullable().optional(),
  debeCambiarContrasena: z.boolean()
})
export type Sesion = z.infer<typeof SesionSchema>

// Usuario en sesión con sus perfiles. `cache` evita repetir la consulta en la misma petición
const leerSesion = cache(async (): Promise<Sesion> => {
  const token = (await cookies()).get(NOMBRE_COOKIE)?.value
  if (!token) redirect("/auth/login")

  const r = await fetch(`${process.env.API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
  if (!r.ok) redirect("/auth/login")

  const resultado = SesionSchema.safeParse(await r.json())
  if (!resultado.success) redirect("/auth/login")
  return resultado.data
})

// Con la contraseña temporal solo se puede estar en la pantalla de cambio
export const obtenerSesion = async ({ permitirTemporal = false } = {}) => {
  const sesion = await leerSesion()
  if (sesion.debeCambiarContrasena && !permitirTemporal) redirect("/auth/cambiar-contrasena")
  return sesion
}

// Al inicio de cada página protegida por perfil
export const requiereRol = async (...roles: CodigoRol[]) => {
  const sesion = await obtenerSesion()
  if (!sesion.roles.length) redirect("/sin-acceso")
  if (roles.length && !tieneRol(sesion.roles, roles)) redirect("/sin-acceso")
  return sesion
}
