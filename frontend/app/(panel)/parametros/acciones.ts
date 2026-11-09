"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

const resultado = async (r: Response): Promise<Resultado> => {
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/parametros")
  return { ok: true }
}

export async function guardarParametro(clave: string, valor: unknown, confirmado: boolean) {
  return resultado(await fetchApi(`/catalogos/parametros/${clave}`, { method: "PUT", body: JSON.stringify({ valor, confirmado }) }))
}

export async function agregarDiaNoHabil(fecha: string, descripcion: string, etapas: string[]) {
  return resultado(await fetchApi("/catalogos/dias-no-habiles", { method: "POST", body: JSON.stringify({ fecha, descripcion, etapas }) }))
}

export async function quitarDiaNoHabil(id: number) {
  return resultado(await fetchApi(`/catalogos/dias-no-habiles/${id}`, { method: "DELETE" }))
}
