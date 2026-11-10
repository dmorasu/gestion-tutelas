"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

const enviar = async (ruta: string, metodo: string, cuerpo?: unknown): Promise<Resultado> => {
  const r = await fetchApi(ruta, { method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  return { ok: true, datos: await r.json().catch(() => null) }
}

export async function registrarCorreo(correoId: number, datos: Record<string, unknown>) {
  const r = await enviar(`/correos/${correoId}/registrar`, "POST", datos)
  revalidatePath("/correos")
  return r
}

export async function descartarCorreo(correoId: number, motivo: string) {
  const r = await enviar(`/correos/${correoId}/descartar`, "POST", { motivo })
  revalidatePath("/correos")
  return r
}

export async function asociarCorreo(correoId: number, actuacionId: number) {
  const r = await enviar(`/correos/${correoId}/asociar`, "POST", { actuacionId })
  revalidatePath("/correos")
  return r
}

export async function marcarAtendido(correoId: number) {
  const r = await enviar(`/correos/${correoId}/atendido`, "POST")
  revalidatePath("/correos")
  revalidatePath(`/correos/${correoId}`)
  return r
}

// Atiende una respuesta por revisar (insumos, entrega, datos faltantes) con su ruta del backend
export async function atenderRespuesta(correoId: number, casoId: number, ruta: string, cuerpo: Record<string, unknown>) {
  const r = await enviar(ruta, "POST", cuerpo)
  revalidatePath("/correos")
  revalidatePath(`/correos/${correoId}`)
  revalidatePath(`/casos/${casoId}`)
  return r
}

export async function leerBuzon() {
  return enviar("/correos/sincronizar", "POST")
}
