"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import clsx from "clsx"
import { Check, Pencil, Plus, X } from "lucide-react"
import { crearItem, guardarItem } from "./acciones"
import type { Resultado } from "@/src/lib/api"

export type ItemCatalogo = {
  id: number, catalogo: string, grupo: string | null, clase: "DOCUMENTO" | "INFORMACION" | null,
  nombre: string, codigo: string | null, supuesto: boolean, activo: boolean
}

const CLASES = { DOCUMENTO: "Documento", INFORMACION: "Información" } as const

// Reglas que el sistema aplica a algunos ítems: se pueden renombrar o apagar, no cambiar de sentido
const REGLAS: Record<string, string> = {
  EMERGENCIA: "Exige insumos pedidos",
  FALTA_LEGITIMACION: "Plantilla propia"
}

export default function ListaCatalogo({ catalogo, items }: { catalogo: string, items: ItemCatalogo[] }) {
  const [pendiente, iniciar] = useTransition()
  const [editando, setEditando] = useState<number | null>(null)
  const esMatriz = catalogo === "INSUMO"
  const grupos = esMatriz ? [...new Set(items.map(i => i.grupo ?? ""))] : [""]

  const ejecutar = (accion: () => Promise<Resultado>, mensaje: string, despues?: () => void) => iniciar(async () => {
    const r = await accion()
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success(mensaje)
    despues?.()
  })

  const agregar = (d: FormData) => ejecutar(() => crearItem({
    catalogo, nombre: String(d.get("nombre") ?? "").trim(),
    ...(esMatriz && { grupo: String(d.get("grupo") ?? "").trim(), clase: String(d.get("clase") ?? "") })
  }), "Agregado")

  const renombrar = (item: ItemCatalogo, d: FormData) => ejecutar(() => guardarItem(item.id, {
    nombre: String(d.get("nombre") ?? "").trim(),
    ...(esMatriz && { grupo: String(d.get("grupo") ?? "").trim(), clase: String(d.get("clase") ?? "") })
  }), "Guardado", () => setEditando(null))

  return (
    <div className="space-y-4">
      <form action={agregar} className="tarjeta flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-64 flex-1">
          <label className="etiqueta">{esMatriz ? "Documento o información" : "Nombre"}</label>
          <input name="nombre" required maxLength={400} className="campo" />
        </div>
        {esMatriz && (
          <>
            <div className="w-64">
              <label className="etiqueta">Grupo</label>
              <input name="grupo" required list="grupos-matriz" maxLength={120} className="campo" />
              <datalist id="grupos-matriz">{grupos.map(g => <option key={g} value={g} />)}</datalist>
            </div>
            <div className="w-40">
              <label className="etiqueta">Tipo</label>
              <select name="clase" required className="campo">
                {Object.entries(CLASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </>
        )}
        <button disabled={pendiente} className="boton-primario"><Plus size={15} />Agregar</button>
      </form>

      {grupos.map(grupo => {
        const delGrupo = items.filter(i => !esMatriz || (i.grupo ?? "") === grupo)
        return (
          <section key={grupo} className="tarjeta overflow-hidden">
            {esMatriz && <h2 className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{grupo}</h2>}
            <table className="tabla">
              <tbody>
                {delGrupo.map(item => (
                  <tr key={item.id} className={clsx(!item.activo && "opacity-50")}>
                    <td className="w-full">
                      {editando === item.id ? (
                        <form action={d => renombrar(item, d)} className="flex flex-wrap items-center gap-2">
                          <input name="nombre" defaultValue={item.nombre} required maxLength={400} autoFocus className="campo min-w-64 flex-1" />
                          {esMatriz && (
                            <>
                              <input name="grupo" defaultValue={item.grupo ?? ""} required list="grupos-matriz" className="campo w-56" />
                              <select name="clase" defaultValue={item.clase ?? "DOCUMENTO"} className="campo w-36">
                                {Object.entries(CLASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            </>
                          )}
                          <button disabled={pendiente} className="boton-icono" title="Guardar" aria-label="Guardar"><Check size={15} /></button>
                          <button type="button" onClick={() => setEditando(null)} className="boton-icono" title="Cancelar" aria-label="Cancelar"><X size={15} /></button>
                        </form>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-slate-700">{item.nombre}</span>
                          {esMatriz && item.clase && <span className="chip border-slate-200 bg-slate-50 text-slate-600">{CLASES[item.clase]}</span>}
                          {item.codigo && REGLAS[item.codigo] && <span className="chip border-slate-300 bg-slate-100 text-slate-700">{REGLAS[item.codigo]}</span>}
                          {item.supuesto && <span className="chip border-amber-200 bg-amber-50 text-amber-700">Supuesto</span>}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {item.supuesto && editando !== item.id && (
                          <button type="button" disabled={pendiente} onClick={() => ejecutar(() => guardarItem(item.id, { supuesto: false }), "Confirmado")} className="boton-secundario py-1 text-[11px]">Confirmar</button>
                        )}
                        {editando !== item.id && (
                          <button type="button" onClick={() => setEditando(item.id)} className="boton-icono" title="Editar" aria-label={`Editar ${item.nombre}`}><Pencil size={15} /></button>
                        )}
                        <button type="button" role="switch" aria-checked={item.activo} disabled={pendiente} title={item.activo ? "Activo" : "Apagado"} aria-label={`${item.activo ? "Apagar" : "Activar"} ${item.nombre}`}
                          onClick={() => ejecutar(() => guardarItem(item.id, { activo: !item.activo }), item.activo ? "Apagado" : "Activado")}
                          className={clsx("relative ml-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition", item.activo ? "bg-slate-800" : "bg-slate-200")}>
                          <span className={clsx("inline-block h-4 w-4 rounded-full bg-white shadow transition", item.activo ? "translate-x-[18px]" : "translate-x-0.5")} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {delGrupo.length === 0 && <tr><td className="text-slate-400">Sin ítems.</td></tr>}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
