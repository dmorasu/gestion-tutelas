"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

export async function actualizarActuacion(casoId: number, actuacionId: number, cambios: Record<string, unknown>): Promise<Resultado> {
  const r = await fetchApi(`/casos/actuaciones/${actuacionId}`, { method: "PATCH", body: JSON.stringify(cambios) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  revalidatePath("/casos")
  return { ok: true }
}

// Actuación registrada por error (solo el coordinador, y solo si no se ha entregado nada a la entidad)
export async function eliminarActuacion(actuacionId: number, motivo: string): Promise<Resultado> {
  const r = await fetchApi(`/casos/actuaciones/${actuacionId}`, { method: "DELETE", body: JSON.stringify({ motivo }) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/casos")
  return { ok: true, datos: await r.json() }
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

// D12: la entidad pidió el memorial por otro canal y el coordinador abre el cumplimiento
export async function abrirCumplimiento(casoId: number, decisionId: number): Promise<Resultado> {
  const r = await fetchApi(`/casos/decisiones/${decisionId}/cumplimiento`, { method: "POST" })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  return { ok: true, datos: await r.json() }
}

// D29: sanción o vulneración causada solo por la entrega tardía (acta de seguimiento)
export async function marcarSancion(casoId: number, decisionId: number, sancionAtribuible: boolean): Promise<Resultado> {
  const r = await fetchApi(`/casos/decisiones/${decisionId}`, { method: "PATCH", body: JSON.stringify({ sancionAtribuible }) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  return { ok: true }
}

// D24: PQRS ligada a una tutela por derecho de petición
export async function crearPqrsLigada(casoId: number, datos: Record<string, unknown>): Promise<Resultado> {
  const r = await fetchApi(`/casos/${casoId}/pqrs-ligada`, { method: "POST", body: JSON.stringify(datos) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  return { ok: true, datos: await r.json() }
}

// Nota de la persona en la bitácora del caso (no se edita ni se borra)
export async function agregarNota(casoId: number, texto: string, actuacionId: number | null): Promise<Resultado> {
  const r = await fetchApi(`/casos/${casoId}/notas`, { method: "POST", body: JSON.stringify({ texto, actuacionId }) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  return { ok: true }
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

// Asunto normalizado y destinatarios sugeridos para un correo libre desde el caso
export async function borradorCorreo(actuacionId: number): Promise<Resultado> {
  const r = await fetchApi(`/casos/actuaciones/${actuacionId}/borrador-correo`)
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  return { ok: true, datos: await r.json() }
}

// ¿El radicado ya es un caso? (el formulario de registro lo consulta al completar los 23 dígitos).
// mismoProceso: casos con el radicado igual salvo los dos últimos dígitos (otra instancia o recurso)
type CasoBuscado = { id: number, numeroInterno: string | null, radicado: string, estado: string, actuaciones: { id: number, etapa: string, estado: string }[] }
export async function buscarPorRadicado(radicado: string) {
  const r = await fetchApi(`/casos/radicado/${encodeURIComponent(radicado)}`)
  if (!r.ok) return null
  const { caso, mismoProceso } = await r.json() as { caso: CasoBuscado | null, mismoProceso: CasoBuscado[] }
  return { caso, mismoProceso: mismoProceso ?? [], radicadoBuscado: radicado }
}

// Casos relacionados (reunión 18-nov): confirmar o descartar lo que sugiere la app, relacionar a mano y unir
export async function decidirRelacion(casoId: number, relacionId: number, datos: { estado: "CONFIRMADA" | "DESCARTADA", tipo?: string, nota?: string | null }): Promise<Resultado> {
  const r = await fetchApi(`/casos/relaciones/${relacionId}`, { method: "PATCH", body: JSON.stringify(datos) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  return { ok: true }
}

export async function relacionarCaso(casoId: number, datos: { otro: string, tipo: string, nota?: string | null }): Promise<Resultado> {
  const r = await fetchApi(`/casos/${casoId}/relaciones`, { method: "POST", body: JSON.stringify(datos) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  return { ok: true }
}

// Solo el coordinador: el otro caso pasa entero a este
export async function unirCaso(casoId: number, otroCasoId: number, motivo: string): Promise<Resultado> {
  const r = await fetchApi(`/casos/${casoId}/unir`, { method: "POST", body: JSON.stringify({ otroCasoId, motivo }) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath(`/casos/${casoId}`)
  revalidatePath("/casos")
  return { ok: true, datos: await r.json() }
}
