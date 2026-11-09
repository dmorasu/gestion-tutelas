"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { agregarDiaNoHabil, quitarDiaNoHabil } from "./acciones"
import { ETAPAS } from "@/src/lib/formato"

type Dia = { id: number, fecha: string, texto: string, descripcion: string | null, etapas: string[] }

export default function DiasNoHabiles({ dias }: { dias: Dia[] }) {
  const [pendiente, iniciar] = useTransition()
  const [etapas, setEtapas] = useState<string[]>([])

  const agregar = (datos: FormData) => iniciar(async () => {
    const r = await agregarDiaNoHabil(String(datos.get("fecha")), String(datos.get("descripcion") ?? ""), etapas)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    setEtapas([])
    toast.success("Día agregado")
  })

  return (
    <div className="tarjeta p-4 space-y-4">
      <form action={agregar} className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="etiqueta">Fecha</label>
          <input type="date" name="fecha" required className="campo" />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label className="etiqueta">Descripción</label>
          <input name="descripcion" placeholder="Ej. vacancia judicial" className="campo" />
        </div>
        <fieldset>
          <legend className="etiqueta">Solo para</legend>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(ETAPAS).map(([k, v]) => (
              <label key={k} className="flex items-center gap-1">
                <input type="checkbox" checked={etapas.includes(k)} onChange={e => setEtapas(x => (e.target.checked ? [...x, k] : x.filter(y => y !== k)))} /> {v}
              </label>
            ))}
          </div>
        </fieldset>
        <button disabled={pendiente} className="boton-primario">Agregar</button>
      </form>

      {dias.length === 0 ? <p className="text-sm text-slate-500">No hay días adicionales.</p> : (
        <ul className="divide-y divide-slate-100 text-sm">
          {dias.map(d => (
            <li key={d.id} className="py-2 flex justify-between gap-3">
              <span>
                <span className="font-medium">{d.texto}</span> {d.descripcion}
                <span className="text-xs text-slate-500"> · {d.etapas.length ? d.etapas.map(e => ETAPAS[e]).join(", ") : "Todas las etapas"}</span>
              </span>
              <button disabled={pendiente} onClick={() => iniciar(async () => { await quitarDiaNoHabil(d.id) })} className="text-xs text-red-700 hover:underline">Quitar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
