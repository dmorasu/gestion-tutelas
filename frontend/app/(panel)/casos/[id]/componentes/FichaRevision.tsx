"use client"

import { useState } from "react"
import { X } from "lucide-react"

export type ItemFicha = { id: number, nombre: string, activo?: boolean, grupo?: string | null }
export type DatosFicha = { resumenHechos: string | null, derechosIds: number[], peticionIds: number[], loQueSePide: string | null }

// =====================================
// FICHA TÉCNICA AL ENVIAR A REVISIÓN (reunión del 23-nov)
// El auxiliar completa aquí lo que va en la ficha: resumen de los hechos, derechos involucrados y la
// petición al despacho (lista de la etapa, configurable en Catálogos). Al enviar, la ficha se genera
// con estos datos y queda en el paquete que ve el revisor
// =====================================
export default function FichaRevision({ inicial, derechos, peticiones, pendiente, enviar, cancelar }: {
  inicial: DatosFicha, derechos: ItemFicha[], peticiones: ItemFicha[], pendiente: boolean,
  enviar: (ficha: DatosFicha) => void, cancelar: () => void
}) {
  const [derechosIds, setDerechos] = useState(inicial.derechosIds)
  const [peticionIds, setPeticiones] = useState(inicial.peticionIds)
  const alternar = (id: number) => setDerechos(m => (m.includes(id) ? m.filter(x => x !== id) : [...m, id]))
  const disponibles = peticiones.filter(p => (p.activo !== false || peticionIds.includes(p.id)) && !peticionIds.includes(p.id))
  const nombre = (id: number) => peticiones.find(p => p.id === id)?.nombre ?? "Petición"

  return (
    <form
      action={d => enviar({
        resumenHechos: String(d.get("resumenHechos") ?? "").trim() || null,
        derechosIds, peticionIds,
        loQueSePide: String(d.get("loQueSePide") ?? "").trim() || null
      })}
      className="space-y-3 rounded-lg border border-slate-200 p-3"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ficha técnica</p>
      <div>
        <label className="etiqueta" htmlFor="ficha-hechos">Resumen de los hechos</label>
        <textarea id="ficha-hechos" name="resumenHechos" required rows={4} maxLength={4000} defaultValue={inicial.resumenHechos ?? ""} className="campo" />
      </div>
      <div>
        <p className="etiqueta">Derechos involucrados</p>
        <div className="flex flex-wrap gap-1.5">
          {derechos.filter(d => d.activo !== false || derechosIds.includes(d.id)).map(d => (
            <button key={d.id} type="button" className="opcion" aria-pressed={derechosIds.includes(d.id)} onClick={() => alternar(d.id)}>{d.nombre}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="etiqueta" htmlFor="ficha-peticion">Petición al despacho</label>
        {peticionIds.length > 0 && (
          <ul className="mb-2 space-y-1">
            {peticionIds.map(id => (
              <li key={id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
                {nombre(id)}
                <button type="button" className="boton-icono" aria-label={`Quitar ${nombre(id)}`} onClick={() => setPeticiones(m => m.filter(x => x !== id))}><X size={14} /></button>
              </li>
            ))}
          </ul>
        )}
        {disponibles.length > 0 && (
          <select id="ficha-peticion" value="" className="campo" onChange={e => { const id = Number(e.target.value); if (id) setPeticiones(m => [...m, id]) }}>
            <option value="">{peticionIds.length ? "Agregar otra petición…" : "Escoja la petición…"}</option>
            {disponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        )}
        <textarea name="loQueSePide" rows={2} maxLength={4000} defaultValue={inicial.loQueSePide ?? ""} className="campo mt-2" placeholder="Precisión u otra petición (opcional)" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={cancelar} className="boton-secundario">Cancelar</button>
        <button disabled={pendiente} className="boton-primario">Generar ficha y enviar a revisión</button>
      </div>
    </form>
  )
}
