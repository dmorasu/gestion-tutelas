"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { generarInforme } from "./acciones"

// Semanal: desde un lunes. Mensual: desde el día 1. Por defecto, el periodo que toca reportar
export default function GenerarInforme({ sugerido }: { sugerido: Record<string, string> }) {
  const [pendiente, iniciar] = useTransition()
  const [tipo, setTipo] = useState("SEMANAL")
  const [desde, setDesde] = useState(sugerido.SEMANAL)

  const generar = () => iniciar(async () => {
    const r = await generarInforme(tipo, desde)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Informe generado")
  })

  return (
    <div className="tarjeta p-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="etiqueta">Informe</label>
        <select value={tipo} onChange={e => { setTipo(e.target.value); setDesde(sugerido[e.target.value]) }} className="campo w-auto">
          <option value="SEMANAL">Semanal (lunes a domingo)</option>
          <option value="MENSUAL">Mensual</option>
        </select>
      </div>
      <div>
        <label className="etiqueta">{tipo === "SEMANAL" ? "Semana que empieza el lunes" : "Mes que empieza el"}</label>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="campo w-auto" />
      </div>
      <button disabled={pendiente} onClick={generar} className="boton-primario">{pendiente ? "Generando…" : "Generar Excel"}</button>
    </div>
  )
}
