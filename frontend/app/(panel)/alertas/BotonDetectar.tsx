"use client"

import { useTransition } from "react"
import { toast } from "react-toastify"
import { detectarAlertas } from "./acciones"

export default function BotonDetectar() {
  const [pendiente, iniciar] = useTransition()
  return (
    <button disabled={pendiente} className="boton-secundario" onClick={() => iniciar(async () => {
      const r = await detectarAlertas()
      if (!r.ok) return void toast.error(r.errores.join(". "))
      const { nuevas } = r.datos as { nuevas: number }
      toast.success(nuevas ? `${nuevas} alertas nuevas` : "No hay alertas nuevas")
    })}>
      {pendiente ? "Revisando…" : "Revisar ahora"}
    </button>
  )
}
