"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

export async function actualizarActuacion(casoId: number, actuacionId: number, cambios: Record<string, unknown>): Promise<Resultado> {
  const r = await fetchApi(`/casos/actuaciones/${actuacionId}`, { method: "PATCH", body: JSON.stringify(cambios) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  return { ok: true }
}

export async function asumirActuacion(casoId: number, actuacionId: number): Promise<Resultado> {
  const r = await fetchApi(`/casos/actuaciones/${actuacionId}/asumir`, { method: "POST" })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  return { ok: true }
}
