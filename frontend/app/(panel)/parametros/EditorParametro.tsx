"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { guardarParametro } from "./acciones"

export type ParametroFila = { clave: string, valor: unknown, descripcion: string | null, duda: string | null, confirmado: boolean }

// Texto, número o sí/no se editan directo; listas y objetos como JSON
const aTexto = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v))
const desdeTexto = (texto: string, original: unknown) => {
  if (typeof original === "number") return Number(texto)
  if (typeof original === "string") return texto
  return JSON.parse(texto)
}

export default function EditorParametro({ parametro: p }: { parametro: ParametroFila }) {
  const [pendiente, iniciar] = useTransition()
  const [texto, setTexto] = useState(aTexto(p.valor))
  const [confirmado, setConfirmado] = useState(p.confirmado)
  const cambiado = texto !== aTexto(p.valor) || confirmado !== p.confirmado

  const guardar = () => iniciar(async () => {
    let valor: unknown
    try {
      valor = typeof p.valor === "boolean" ? texto === "true" : desdeTexto(texto, p.valor)
    } catch {
      return void toast.error("El valor no tiene el formato esperado")
    }
    const r = await guardarParametro(p.clave, valor, confirmado)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Parámetro guardado. Aplica a lo que se registre o recalcule desde ahora.")
  })

  return (
    <div className="p-4 grid md:grid-cols-[1fr,18rem,auto] gap-3 items-start">
      <div>
        <p className="text-sm font-medium">
          {p.duda && <span className="mr-2 text-xs font-semibold text-slate-500">{p.duda}</span>}
          <code className="text-xs">{p.clave}</code>
          {!p.confirmado && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Supuesto</span>}
        </p>
        <p className="text-sm text-slate-600">{p.descripcion}</p>
      </div>
      {typeof p.valor === "boolean" ? (
        <select value={texto} onChange={e => setTexto(e.target.value)} className="campo">
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input value={texto} onChange={e => setTexto(e.target.value)} className="campo font-mono text-xs" />
      )}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 text-xs whitespace-nowrap"><input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} /> Confirmado</label>
        <button disabled={!cambiado || pendiente} onClick={guardar} className="boton-primario py-1.5">Guardar</button>
      </div>
    </div>
  )
}
