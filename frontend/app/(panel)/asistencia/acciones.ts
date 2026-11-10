"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

export async function guardarAsistencia(fecha: string, registros: { usuarioId: number, estado: string, observacion: string | null }[]): Promise<Resultado> {
  const r = await fetchApi("/seguimiento/asistencia", { method: "PUT", body: JSON.stringify({ fecha, registros }) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/asistencia")
  return { ok: true }
}
