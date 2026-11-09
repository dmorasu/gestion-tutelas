"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { NOMBRE_COOKIE, opcionesCookieSesion } from "@/src/auth/constantes"

type Estado = { error: string, correo: string, intento: number } | null

// IP real del navegador (la pone Nginx): el backend la usa para el límite de intentos
const ipNavegador = async () => {
  const h = await headers()
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
}

export async function iniciarSesion(previo: Estado, datos: FormData): Promise<Estado> {
  const correo = String(datos.get("correo") ?? "")
  const fallo = (error: string): Estado => ({ error, correo, intento: (previo?.intento ?? 0) + 1 })

  const r = await fetch(`${process.env.API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-IP-Cliente": await ipNavegador() },
    body: JSON.stringify({ correo, contrasena: datos.get("contrasena") }),
    cache: "no-store"
  }).catch(() => null)
  if (!r) return fallo("No hay conexión con el servidor")
  const json = await r.json().catch(() => null)
  if (!r.ok) return fallo(json?.error ?? json?.errors?.[0]?.msg ?? "No se pudo entrar")

  ;(await cookies()).set(NOMBRE_COOKIE, json.token, opcionesCookieSesion)
  redirect(json.debeCambiarContrasena ? "/auth/cambiar-contrasena" : "/inicio")
}
