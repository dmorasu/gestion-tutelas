"use client"

import { useTransition } from "react"
import { toast } from "react-toastify"
import { marcarAtendido } from "../acciones"

// Respuesta asociada sola (insumos, acuse, datos faltantes) que alguien ya leyó y atendió
export default function BotonAtendido({ correoId }: { correoId: number }) {
  const [pendiente, iniciar] = useTransition()
  const atender = () => iniciar(async () => {
    const r = await marcarAtendido(correoId)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Marcado como atendido")
  })
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
      <span>Respuesta por revisar.</span>
      <button disabled={pendiente} onClick={atender} className="boton-primario py-1.5">Marcar como atendido</button>
    </div>
  )
}
