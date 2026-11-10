"use client"

import { useState, useTransition } from "react"
import clsx from "clsx"
import { toast } from "react-toastify"
import { Hand, Send, UserRound } from "lucide-react"
import { soltarCorreo, tomarCorreo, trasladarCorreo } from "../acciones"
import { fechaHora } from "@/src/lib/formato"

type Props = {
  correoId: number, usuarioId: number, responsableId: number | null, responsable: string | null
  tomadoEn: string | null, nota: string | null, personas: { id: number, nombre: string }[], pendiente: boolean
}

// Quién está atendiendo el correo: así nadie lo atiende dos veces y nada queda sin dueño
export default function BarraAtencion({ correoId, usuarioId, responsableId, responsable, tomadoEn, nota, personas, pendiente }: Props) {
  const [ocupado, iniciar] = useTransition()
  const [trasladando, setTrasladando] = useState(false)
  const [destino, setDestino] = useState("")
  const [texto, setTexto] = useState("")
  const mio = responsableId === usuarioId

  const ejecutar = (fn: () => Promise<{ ok: boolean, errores?: string[] }>, mensaje: string) => iniciar(async () => {
    const r = await fn()
    if (!r.ok) return void toast.error(r.errores?.join(". "))
    toast.success(mensaje)
    setTrasladando(false)
  })

  return (
    <div className={clsx("rounded-xl border px-4 py-3 shadow-sm", !responsableId && pendiente ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-slate-700">
          <UserRound size={16} className="text-slate-400" />
          {responsableId
            ? <span><b>{mio ? "Usted" : responsable}</b> lo está atendiendo{tomadoEn && <span className="text-slate-500"> desde {fechaHora(tomadoEn)}</span>}</span>
            : pendiente ? <span className="font-semibold text-amber-900">Nadie lo está atendiendo</span> : <span className="text-slate-500">Sin responsable</span>}
        </p>
        {pendiente && (
          <div className="flex flex-wrap gap-2">
            {!mio && (
              <button disabled={ocupado} className="boton-primario py-1.5 text-xs inline-flex items-center gap-1.5"
                onClick={() => ejecutar(() => tomarCorreo(correoId, !!responsableId), "Ahora lo atiende usted")}>
                <Hand size={14} /> {responsableId ? "Tomarlo yo" : "Tomar"}
              </button>
            )}
            <button disabled={ocupado} className="boton-secundario py-1.5 text-xs inline-flex items-center gap-1.5" onClick={() => setTrasladando(x => !x)}>
              <Send size={14} /> Trasladar
            </button>
            {mio && <button disabled={ocupado} className="boton-secundario py-1.5 text-xs" onClick={() => ejecutar(() => soltarCorreo(correoId), "Lo soltó: vuelve a estar sin atender")}>Soltar</button>}
          </div>
        )}
      </div>
      {nota && <p className="mt-1.5 text-xs text-slate-600">Nota: {nota}</p>}
      {trasladando && (
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={destino} onChange={e => setDestino(e.target.value)} className="campo w-auto">
            <option value="">A quién…</option>
            {personas.filter(p => p.id !== responsableId).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Nota (qué debe hacer)" className="campo flex-1 min-w-[12rem]" />
          <button disabled={ocupado || !destino} className="boton-primario"
            onClick={() => ejecutar(() => trasladarCorreo(correoId, Number(destino), texto), "Correo trasladado")}>Trasladar</button>
        </div>
      )}
    </div>
  )
}
