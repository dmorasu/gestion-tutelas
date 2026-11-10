"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

export async function generarInforme(tipo: string, desde: string): Promise<Resultado> {
  const r = await fetchApi("/seguimiento/informes", { method: "POST", body: JSON.stringify({ tipo, desde }) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/informes")
  return { ok: true, datos: await r.json() }
}
