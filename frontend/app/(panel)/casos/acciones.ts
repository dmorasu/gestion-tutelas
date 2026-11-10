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

// Un paso del flujo del escrito (insumos, revisión, entrega, respuesta, radicación, cierre)
export async function pasoActuacion(casoId: number, actuacionId: number, paso: string, cuerpo: Record<string, unknown> = {}): Promise<Resultado> {
  const r = await fetchApi(`/casos/actuaciones/${actuacionId}/${paso}`, { method: "POST", body: JSON.stringify(cuerpo) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  return { ok: true, datos: await r.json().catch(() => null) }
}

export async function registrarManual(datos: Record<string, unknown>): Promise<Resultado> {
  const r = await fetchApi("/casos", { method: "POST", body: JSON.stringify(datos) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/casos")
  return { ok: true, datos: await r.json() }
}

export async function registrarTanda(datos: Record<string, unknown>): Promise<Resultado> {
  const r = await fetchApi("/cargues/registrar", { method: "POST", body: JSON.stringify(datos) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  return { ok: true, datos: await r.json() }
}

export async function acusarPaquete(correoId: number, registrados: { radicado: string, numeroInterno: string }[]): Promise<Resultado> {
  const r = await fetchApi("/cargues/acuse", { method: "POST", body: JSON.stringify({ correoId, registrados }) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/casos")
  revalidatePath("/correos")
  return { ok: true }
}
