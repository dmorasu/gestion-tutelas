"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

type Texto = { asunto: string, cuerpo: string, titulo: string }

export async function guardarPlantilla(codigo: string, datos: Texto & { confirmada: boolean }): Promise<Resultado> {
  const r = await fetchApi(`/catalogos/plantillas/${codigo}`, { method: "PUT", body: JSON.stringify(datos) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/plantillas")
  return { ok: true }
}

// Lo que se está editando, sin guardar, con datos de ejemplo y el diseño corporativo
export async function vistaPreviaPlantilla(codigo: string, datos: Texto): Promise<Resultado> {
  const r = await fetchApi(`/catalogos/plantillas/${codigo}/vista-previa`, { method: "POST", body: JSON.stringify(datos) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  return { ok: true, datos: await r.json() }
}

export async function enviarPruebaPlantilla(codigo: string, datos: Texto): Promise<Resultado> {
  const r = await fetchApi(`/catalogos/plantillas/${codigo}/prueba`, { method: "POST", body: JSON.stringify(datos) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  return { ok: true, datos: await r.json() }
}
