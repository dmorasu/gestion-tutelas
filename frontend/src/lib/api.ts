import "server-only"
import { cookies } from "next/headers"
import { NOMBRE_COOKIE } from "../auth/constantes"

// Llamada al backend desde el servidor (server components y server actions) con el token
// de la sesión. Ej: fetchApi("/casos")
export const fetchApi = async (ruta: string, opciones: RequestInit = {}) => {
  const token = (await cookies()).get(NOMBRE_COOKIE)?.value
  const esFormulario = opciones.body instanceof FormData
  return fetch(`${process.env.API_URL}${ruta}`, {
    ...opciones,
    headers: {
      ...(!esFormulario && { "Content-Type": "application/json" }),
      ...opciones.headers,
      ...(token && { Authorization: `Bearer ${token}` })
    },
    cache: "no-store"
  })
}

// GET que devuelve el JSON o lanza el error (para server components)
export const obtener = async <T,>(ruta: string): Promise<T> => {
  const r = await fetchApi(ruta)
  if (!r.ok) throw new Error((await leerErrores(r)).join(". "))
  return r.json() as Promise<T>
}

// Cualquier respuesta de error del backend como lista de mensajes:
// { error: "..." } (reglas de negocio) o { errors: [{ msg }] } (validaciones)
export const leerErrores = async (respuesta: Response): Promise<string[]> => {
  const json = await respuesta.json().catch(() => null)
  if (json?.error) return [json.error]
  if (Array.isArray(json?.errors)) return json.errors.map((e: { msg: string, path?: string }) => (e.path ? `${e.path}: ${e.msg}` : e.msg))
  return ["Hubo un error, intenta de nuevo"]
}

export type Resultado = { ok: true, datos?: unknown } | { ok: false, errores: string[] }
