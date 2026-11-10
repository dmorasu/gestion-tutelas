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

// ── Quién atiende el correo ──
const recargar = (correoId: number) => { revalidatePath("/correos"); revalidatePath(`/correos/${correoId}`) }

export async function tomarCorreo(correoId: number, forzar = false) {
  const r = await enviar(`/correos/${correoId}/tomar`, "POST", { forzar })
  recargar(correoId)
  return r
}

export async function soltarCorreo(correoId: number) {
  const r = await enviar(`/correos/${correoId}/soltar`, "POST")
  recargar(correoId)
  return r
}

export async function trasladarCorreo(correoId: number, usuarioId: number, nota: string) {
  const r = await enviar(`/correos/${correoId}/trasladar`, "POST", { usuarioId, nota })
  recargar(correoId)
  return r
}

// ── Enlaces de SharePoint ──
export async function traerEnlace(correoId: number, enlaceId: number) {
  const r = await enviar(`/correos/enlaces/${enlaceId}/descargar`, "POST")
  recargar(correoId)
  return r
}

export async function descartarEnlace(correoId: number, enlaceId: number, motivo: string) {
  const r = await enviar(`/correos/enlaces/${enlaceId}/descartar`, "POST", { motivo })
  recargar(correoId)
  return r
}

// Actuaciones abiertas que coinciden con lo buscado (número interno, radicado o accionante)
export async function buscarActuaciones(q: string) {
  const r = await enviar(`/casos?${new URLSearchParams({ q, todos: "1" })}`, "GET")
  if (!r.ok) return []
  const { actuaciones } = r.datos as { actuaciones: { id: number, etapa: string, estado: string, caso: { id: number, numeroInterno: string | null, radicado: string, partes: { nombre: string }[] } }[] }
  return actuaciones
}

export async function asociarComo(correoId: number, actuacionId: number, proposito: string) {
  const r = await enviar(`/correos/${correoId}/asociar`, "POST", { actuacionId, proposito })
  recargar(correoId)
  return r
}
