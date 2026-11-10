"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

const enviar = async (ruta: string, metodo: string, cuerpo?: unknown): Promise<Resultado> => {
  const r = await fetchApi(ruta, { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/equipos")
  return { ok: true, datos: await r.json().catch(() => null) }
}

export async function crearEquipo(nombre: string, etapas: string[]) {
  return enviar("/catalogos/equipos", "POST", { nombre, etapas })
}

export async function guardarEquipo(id: number, datos: { nombre?: string, etapas?: string[], activo?: boolean }) {
  return enviar(`/catalogos/equipos/${id}`, "PUT", datos)
}

// equipoId null = sacarlo del equipo
export async function moverMiembro(usuarioId: number, equipoId: number | null) {
  return enviar(`/catalogos/equipos/miembro/${usuarioId}`, "PUT", { equipoId })
}
