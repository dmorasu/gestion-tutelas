"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { guardarEquipo, moverMiembro } from "./acciones"
import { ETAPAS } from "@/src/lib/formato"

export type Persona = { id: number, nombre: string, rol: "REVISOR" | "AUXILIAR", equipoId: number | null, equipo: string | null }
type Props = { equipo: { id: number, nombre: string, etapas: string[], activo: boolean }, miembros: Persona[], otros: Persona[] }

export const ETAPAS_EQUIPO = Object.entries(ETAPAS).filter(([k]) => k !== "PQRS")

export default function TarjetaEquipo({ equipo, miembros, otros }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [etapas, setEtapas] = useState(equipo.etapas)
  const [agregar, setAgregar] = useState("")
  const cambiado = [...etapas].sort().join() !== [...equipo.etapas].sort().join()
  const revisores = miembros.filter(m => m.rol === "REVISOR")
  const auxiliares = miembros.filter(m => m.rol === "AUXILIAR")

  const ejecutar = (fn: () => Promise<{ ok: boolean, errores?: string[] }>, mensaje: string) => iniciar(async () => {
    const r = await fn()
    if (!r.ok) return void toast.error(r.errores?.join(". "))
    toast.success(mensaje)
  })

  return (
    <section className={`tarjeta p-5 space-y-4 ${equipo.activo ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">{equipo.nombre}</h2>
          <p className="text-xs text-slate-500">{revisores.length} revisor{revisores.length === 1 ? "" : "es"} · {auxiliares.length} auxiliares</p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={equipo.activo} disabled={pendiente}
            onChange={e => ejecutar(() => guardarEquipo(equipo.id, { activo: e.target.checked }), e.target.checked ? "Equipo activado" : "Equipo desactivado")} />
          Activo
        </label>
      </div>

      <div>
        <p className="etiqueta">Etapas que atiende</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {ETAPAS_EQUIPO.map(([k, v]) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="checkbox" checked={etapas.includes(k)} onChange={e => setEtapas(x => (e.target.checked ? [...x, k] : x.filter(y => y !== k)))} /> {v}
            </label>
          ))}
        </div>
        {cambiado && (
          <button disabled={pendiente} onClick={() => ejecutar(() => guardarEquipo(equipo.id, { etapas }), "Etapas guardadas")} className="boton-primario py-1.5 mt-2">
            Guardar etapas
          </button>
        )}
      </div>

      <div>
        <p className="etiqueta">Integrantes</p>
        {revisores.length === 0 && <p className="text-sm text-amber-700">Sin revisor: las actuaciones de este equipo toman el revisor con menos carga.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {[...revisores, ...auxiliares].map(m => (
            <li key={m.id} className="flex items-center justify-between py-1.5">
              <span>{m.nombre} <span className="text-xs text-slate-500">{m.rol === "REVISOR" ? "Revisor" : "Auxiliar"}</span></span>
              <button disabled={pendiente} onClick={() => ejecutar(() => moverMiembro(m.id, null), `${m.nombre} salió del equipo`)} className="text-xs enlace">Quitar</button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <select value={agregar} onChange={e => setAgregar(e.target.value)} className="campo">
            <option value="">Agregar persona…</option>
            {otros.map(p => (
              <option key={p.id} value={p.id}>{p.nombre} · {p.rol === "REVISOR" ? "Revisor" : "Auxiliar"}{p.equipo ? ` (hoy en ${p.equipo})` : ""}</option>
            ))}
          </select>
          <button disabled={!agregar || pendiente} className="boton-secundario"
            onClick={() => ejecutar(async () => { const r = await moverMiembro(Number(agregar), equipo.id); setAgregar(""); return r }, "Persona agregada")}>
            Agregar
          </button>
        </div>
      </div>
    </section>
  )
}
