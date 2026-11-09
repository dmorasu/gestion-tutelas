"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { fetchApi, leerErrores } from "@/src/lib/api"
import { NOMBRE_COOKIE, opcionesCookieSesion } from "@/src/auth/constantes"

export async function cambiarContrasena(_previo: string[] | null, datos: FormData): Promise<string[] | null> {
  const contrasena = String(datos.get("contrasena") ?? "")
  if (contrasena !== datos.get("confirmacion")) return ["Las dos contraseñas nuevas no coinciden"]
  const r = await fetchApi("/auth/cambiar-contrasena", {
    method: "POST",
    body: JSON.stringify({ contrasenaActual: datos.get("contrasenaActual"), contrasena })
  })
  if (!r.ok) return leerErrores(r)
  // El cambio cierra las demás sesiones: el backend devuelve un token nuevo para esta
  const { token } = await r.json() as { token: string }
  ;(await cookies()).set(NOMBRE_COOKIE, token, opcionesCookieSesion)
  redirect("/inicio")
}
