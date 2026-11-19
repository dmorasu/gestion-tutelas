"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { Pencil } from "lucide-react"
import { guardarFicha } from "../../acciones"

type Derecho = { id: number, nombre: string, activo?: boolean }

// Lo registra el auxiliar al leer la tutela (reunión 18-nov). Sin esto no sale el correo de insumos,
// que cuenta los derechos y los hechos, y la ficha técnica queda incompleta
export default function HechosDerechos({ casoId, resumen, derechosIds, derechos, puedeEditar }: {
  casoId: number, resumen: string | null, derechosIds: number[], derechos: Derecho[], puedeEditar: boolean
}) {
  const [editando, setEditando] = useState(puedeEditar && !resumen && !derechosIds.length)
  const [marcados, setMarcados] = useState<number[]>(derechosIds)
  const [pendiente, iniciar] = useTransition()
  const nombres = derechos.filter(d => derechosIds.includes(d.id)).map(d => d.nombre)

  const guardar = (d: FormData) => iniciar(async () => {
    const r = await guardarFicha(casoId, { resumenHechos: String(d.get("resumen") ?? "").trim() || null, derechosIds: marcados })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Hechos y derechos guardados")
    setEditando(false)
  })

  if (!editando) {
    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {nombres.length ? nombres.map(n => <span key={n} className="chip border-slate-200 bg-slate-50 text-slate-700">{n}</span>) : <span className="text-xs text-amber-700">Sin derechos registrados</span>}
          </div>
          {puedeEditar && <button type="button" onClick={() => setEditando(true)} className="boton-icono" title="Editar" aria-label="Editar hechos y derechos"><Pencil size={15} /></button>}
        </div>
        {resumen ? <p className="whitespace-pre-line text-slate-700">{resumen}</p> : <p className="text-xs text-amber-700">Sin resumen de los hechos.</p>}
      </div>
    )
  }
  return (
    <form action={guardar} className="space-y-3">
      <div>
        <p className="etiqueta">Derechos involucrados</p>
        <div className="flex flex-wrap gap-1.5">
          {derechos.filter(d => d.activo !== false || marcados.includes(d.id)).map(d => (
            <button key={d.id} type="button" className="opcion" aria-pressed={marcados.includes(d.id)}
              onClick={() => setMarcados(m => (m.includes(d.id) ? m.filter(x => x !== d.id) : [...m, d.id]))}>{d.nombre}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="etiqueta" htmlFor="resumen-hechos">Resumen de los hechos</label>
        <textarea id="resumen-hechos" name="resumen" defaultValue={resumen ?? ""} rows={4} maxLength={4000} className="campo"
          placeholder="Qué actuación u omisión le atribuye el accionante a la entidad" />
      </div>
      <div className="flex justify-end gap-2">
        {(resumen || derechosIds.length > 0) && <button type="button" onClick={() => setEditando(false)} className="boton-secundario">Cancelar</button>}
        <button disabled={pendiente} className="boton-primario">Guardar</button>
      </div>
    </form>
  )
}
