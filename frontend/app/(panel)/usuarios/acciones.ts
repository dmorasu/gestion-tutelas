"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

const enviar = async (ruta: string, metodo: string, cuerpo?: unknown): Promise<Resultado> => {
  const r = await fetchApi(ruta, { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/usuarios")
  return { ok: true, datos: await r.json().catch(() => null) }
}

export async function guardarUsuario(id: number, datos: { roles: string[], activo: boolean, capacidadDiaria: number | null }) {
  return enviar(`/catalogos/usuarios/${id}`, "PUT", datos)
}

// Devuelve la contraseña temporal para entregarla al usuario (se muestra una sola vez)
export async function crearUsuario(nombre: string, correo: string, roles: string[]) {
  return enviar("/catalogos/usuarios", "POST", { nombre, correo, roles })
}

export async function restablecerContrasena(id: number) {
  return enviar(`/catalogos/usuarios/${id}/restablecer-contrasena`, "POST")
}

export async function desbloquearUsuario(id: number) {
  return enviar(`/catalogos/usuarios/${id}/desbloquear`, "POST")
}
