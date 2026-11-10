"use server"

import { revalidatePath } from "next/cache"
import { fetchApi, leerErrores, type Resultado } from "@/src/lib/api"

const enviar = async (ruta: string, cuerpo: Record<string, unknown> = {}): Promise<Resultado> => {
  const r = await fetchApi(ruta, { method: "POST", body: JSON.stringify(cuerpo) })
  if (!r.ok) return { ok: false, errores: await leerErrores(r) }
  revalidatePath("/alertas")
  return { ok: true, datos: await r.json().catch(() => null) }
}

export const detectarAlertas = async () => enviar("/seguimiento/alertas/detectar")
export const emitirAlerta = async (id: number, nota: string) => enviar(`/seguimiento/alertas/${id}/emitir`, { nota })
export const descartarAlerta = async (id: number, motivo: string) => enviar(`/seguimiento/alertas/${id}/descartar`, { motivo })
