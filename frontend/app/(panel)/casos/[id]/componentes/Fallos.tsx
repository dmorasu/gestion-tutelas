"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { abrirCumplimiento, marcarSancion, pasoActuacion } from "../../acciones"
import { INSTANCIAS, SENTIDOS, fechaHora, isoDesdeLocal } from "@/src/lib/formato"

export type DecisionFila = {
  id: number, instancia: string, sentido: string, fechaDecision: string | null, fechaNotificacion: string | null, notificadaPorCorreo: boolean,
  favorable: boolean | null, fechaVenceImpugnacion: string | null, requiereCumplimiento: boolean, actuacionCumplimientoId: number | null,
  sancionAtribuible: boolean
}

type Props = {
  casoId: number, actuacionId: number, decisiones: DecisionFila[], sentidos: Record<string, string[]>
  puedeRegistrar: boolean, coordina: boolean
}

// Fallos de la actuación (D12, D13). Uno desfavorable deja el cumplimiento pendiente hasta que la
// entidad lo asigna por correo; el coordinador puede abrirlo antes si lo pidieron por otro canal
export default function Fallos({ casoId, actuacionId, decisiones, sentidos, puedeRegistrar, coordina }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [abierto, setAbierto] = useState(false)
  const [instancia, setInstancia] = useState("PRIMERA")

  const registrar = (d: FormData) => iniciar(async () => {
    const r = await pasoActuacion(casoId, actuacionId, "decision", {
      instancia, sentido: d.get("sentido"), fechaDecision: d.get("fechaDecision") || null,
      fechaNotificacion: isoDesdeLocal(String(d.get("fechaNotificacion") ?? "")), notificadaPorCorreo: d.get("porCorreo") === "on"
    })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Fallo registrado")
    setAbierto(false)
  })

  const abrir = (decisionId: number) => {
    if (!confirm("¿Abrir el cumplimiento sin esperar la asignación por correo? La asignación queda con la hora de ahora.")) return
    iniciar(async () => {
      const r = await abrirCumplimiento(casoId, decisionId)
      if (!r.ok) return void toast.error(r.errores.join(". "))
      toast.success("Cumplimiento abierto")
    })
  }

  const sancion = (d: DecisionFila) => {
    const nuevo = !d.sancionAtribuible
    if (!confirm(nuevo ? "¿Marcar la sanción como atribuible a la entrega tardía? El caso no causa remuneración." : "¿Quitar la marca de sanción atribuible?")) return
    iniciar(async () => {
      const r = await marcarSancion(casoId, d.id, nuevo)
      if (!r.ok) return void toast.error(r.errores.join(". "))
      toast.success(nuevo ? "Marcado sin remuneración" : "Marca quitada")
    })
  }

  if (!decisiones.length && !puedeRegistrar) return null

  return (
    <div className="space-y-2 border-t border-slate-100 pt-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fallos</h4>
        {puedeRegistrar && <button className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(!abierto)}>Registrar fallo</button>}
      </div>

      {abierto && (
        <form action={registrar} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
          <div>
            <label className="etiqueta">Instancia</label>
            <select value={instancia} onChange={e => setInstancia(e.target.value)} className="campo">
              {Object.keys(sentidos).map(k => <option key={k} value={k}>{INSTANCIAS[k] ?? k}</option>)}
            </select>
          </div>
          <div>
            <label className="etiqueta">Sentido</label>
            <select key={instancia} name="sentido" required className="campo">
              {(sentidos[instancia] ?? []).map(s => <option key={s} value={s}>{SENTIDOS[s] ?? s}</option>)}
            </select>
          </div>
          <div><label className="etiqueta">Fecha del fallo</label><input type="date" name="fechaDecision" className="campo" /></div>
          <div><label className="etiqueta">Notificación</label><input type="datetime-local" name="fechaNotificacion" className="campo" /></div>
          <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" name="porCorreo" /> Notificado por correo electrónico</label>
          <div className="sm:col-span-2 flex justify-end"><button disabled={pendiente} className="boton-primario">Registrar</button></div>
        </form>
      )}

      {decisiones.length === 0 && <p className="text-slate-500">Sin fallos registrados.</p>}
      {decisiones.map(d => (
        <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2">
          <span className="font-semibold">{INSTANCIAS[d.instancia] ?? d.instancia}</span>
          <span>{SENTIDOS[d.sentido] ?? d.sentido}</span>
          {d.favorable !== null && (
            <span className={d.favorable ? "rounded-full bg-emerald-50 px-2 py-px text-xs text-emerald-700" : "rounded-full bg-red-50 px-2 py-px text-xs text-red-700"}>
              {d.favorable ? "Favorable" : "Desfavorable"}
            </span>
          )}
          {d.fechaDecision && <span className="text-xs text-slate-500">Fallo {d.fechaDecision.split("-").reverse().join("/")}</span>}
          {d.fechaNotificacion && <span className="text-xs text-slate-500">Notificado {fechaHora(d.fechaNotificacion)}{d.notificadaPorCorreo ? " por correo" : ""}</span>}
          {d.fechaVenceImpugnacion && <span className="text-xs text-slate-500">Impugnar hasta {fechaHora(d.fechaVenceImpugnacion)}</span>}
          {d.requiereCumplimiento && (
            d.actuacionCumplimientoId
              ? <Link href={`/casos/${casoId}?tab=actuacion&actuacion=${d.actuacionCumplimientoId}`} className="text-xs enlace">Ver el cumplimiento</Link>
              : (
                <span className="flex items-center gap-2 text-xs text-amber-700">
                  Memorial de cumplimiento pendiente de asignación
                  {coordina && <button disabled={pendiente} className="enlace" onClick={() => abrir(d.id)}>Abrir ahora</button>}
                </span>
              )
          )}
          {d.sancionAtribuible && <span className="rounded-full bg-red-50 px-2 py-px text-xs text-red-700">Sin remuneración</span>}
          {coordina && d.favorable === false && (
            <button disabled={pendiente} className="ml-auto text-xs enlace" onClick={() => sancion(d)}>
              {d.sancionAtribuible ? "Quitar sanción atribuible" : "Sanción atribuible a entrega tardía"}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
