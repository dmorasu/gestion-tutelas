"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

const enviar = async (ruta: string, metodo: string, cuerpo: unknown): Promise<Resultado> => {
  const r = await fetchApi(ruta, { method: metodo, body: JSON.stringify(cuerpo) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/catalogos")
  return { ok: true, datos: await r.json().catch(() => null) }
}

export async function crearItem(datos: { catalogo: string, nombre: string, grupo?: string | null, clase?: string | null }) {
  return enviar("/catalogos/items", "POST", datos)
}

export async function guardarItem(id: number, datos: { nombre?: string, grupo?: string, clase?: string, activo?: boolean, supuesto?: boolean }) {
  return enviar(`/catalogos/items/${id}`, "PUT", datos)
}
