"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import clsx from "clsx"
import { Plus, UserMinus } from "lucide-react"
import { guardarEquipo, moverMiembro } from "./acciones"
import { ETAPAS } from "@/src/lib/formato"
import Avatar from "@/components/ui/Avatar"

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
    <section className={clsx("tarjeta flex flex-col", !equipo.activo && "opacity-60")}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-800">{equipo.nombre}</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="chip border-slate-200 bg-slate-50 text-slate-600">{revisores.length} revisor{revisores.length === 1 ? "" : "es"}</span>
            <span className="chip border-slate-200 bg-slate-50 text-slate-600">{auxiliares.length} auxiliar{auxiliares.length === 1 ? "" : "es"}</span>
            {revisores.length === 0 && <span className="chip border-amber-200 bg-amber-50 text-amber-700" title="Las actuaciones del equipo toman el revisor con menos carga">Sin revisor</span>}
          </div>
        </div>
        <button type="button" role="switch" aria-checked={equipo.activo} disabled={pendiente} title={equipo.activo ? "Activo" : "Inactivo"}
          onClick={() => ejecutar(() => guardarEquipo(equipo.id, { activo: !equipo.activo }), equipo.activo ? "Equipo desactivado" : "Equipo activado")}
          className={clsx("relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition", equipo.activo ? "bg-slate-800" : "bg-slate-200")}>
          <span className={clsx("inline-block h-4 w-4 rounded-full bg-white shadow transition", equipo.activo ? "translate-x-[18px]" : "translate-x-0.5")} />
        </button>
      </div>

      <div className="space-y-5 px-5 py-4">
        <div>
          <p className="etiqueta">Etapas que atiende</p>
          <div className="flex flex-wrap gap-1.5">
            {ETAPAS_EQUIPO.map(([k, v]) => (
              <button key={k} type="button" className="opcion" aria-pressed={etapas.includes(k)}
                onClick={() => setEtapas(x => (x.includes(k) ? x.filter(y => y !== k) : [...x, k]))}>{v}</button>
            ))}
          </div>
          {cambiado && (
            <div className="mt-3 flex gap-2">
              <button disabled={pendiente} onClick={() => ejecutar(() => guardarEquipo(equipo.id, { etapas }), "Etapas guardadas")} className="boton-primario h-8 px-3">Guardar etapas</button>
              <button type="button" onClick={() => setEtapas(equipo.etapas)} className="boton-secundario h-8 px-3">Deshacer</button>
            </div>
          )}
        </div>

        <div>
          <p className="etiqueta">Integrantes</p>
          {miembros.length === 0 && <p className="py-2 text-xs text-slate-400">Aún no tiene integrantes.</p>}
          <ul className="divide-y divide-slate-100">
            {[...revisores, ...auxiliares].map(m => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <Avatar nombre={m.nombre} tamano="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-700">{m.nombre}</p>
                  <p className="text-[11px] text-slate-400">{m.rol === "REVISOR" ? "Revisor" : "Auxiliar jurídico"}</p>
                </div>
                <button disabled={pendiente} onClick={() => ejecutar(() => moverMiembro(m.id, null), `${m.nombre} salió del equipo`)}
                  className="boton-icono-peligro" title="Quitar del equipo" aria-label={`Quitar a ${m.nombre}`}>
                  <UserMinus size={15} />
                </button>
              </li>
            ))}
          </ul>
          {otros.length > 0 && (
            <div className="mt-2 flex gap-2">
              <select value={agregar} onChange={e => setAgregar(e.target.value)} className="campo h-9">
                <option value="">Agregar persona…</option>
                {otros.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre} · {p.rol === "REVISOR" ? "Revisor" : "Auxiliar"}{p.equipo ? ` (hoy en ${p.equipo})` : ""}</option>
                ))}
              </select>
              <button disabled={!agregar || pendiente} className="boton-secundario h-9 px-3" aria-label="Agregar"
                onClick={() => ejecutar(async () => { const r = await moverMiembro(Number(agregar), equipo.id); setAgregar(""); return r }, "Persona agregada")}>
                <Plus size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
