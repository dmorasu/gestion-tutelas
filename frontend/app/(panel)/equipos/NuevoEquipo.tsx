"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "react-toastify"
import { crearEquipo } from "./acciones"
import { ETAPAS_EQUIPO } from "./TarjetaEquipo"

export default function NuevoEquipo() {
  const [pendiente, iniciar] = useTransition()
  const [etapas, setEtapas] = useState<string[]>([])
  const formulario = useRef<HTMLFormElement>(null)

  const crear = (datos: FormData) => iniciar(async () => {
    const r = await crearEquipo(String(datos.get("nombre")), etapas)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Equipo creado")
    setEtapas([])
    formulario.current?.reset()
  })

  return (
    <form ref={formulario} action={crear} className="tarjeta p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[14rem]"><label className="etiqueta">Nuevo equipo</label><input name="nombre" required placeholder="Nombre" className="campo" /></div>
        <button disabled={pendiente} className="boton-primario">Crear equipo</button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {ETAPAS_EQUIPO.map(([k, v]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="checkbox" checked={etapas.includes(k)} onChange={e => setEtapas(x => (e.target.checked ? [...x, k] : x.filter(y => y !== k)))} /> {v}
          </label>
        ))}
      </div>
    </form>
  )
}
