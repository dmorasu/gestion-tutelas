import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { NOMBRE_COOKIE } from "@/src/auth/constantes"

// Cierra la sesión en el backend (invalida el token) y borra la cookie
export async function POST() {
  const almacen = await cookies()
  const token = almacen.get(NOMBRE_COOKIE)?.value
  if (token) {
    await fetch(`${process.env.API_URL}/auth/salir`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null)
  }
  almacen.delete(NOMBRE_COOKIE)
  redirect("/auth/login")
}
