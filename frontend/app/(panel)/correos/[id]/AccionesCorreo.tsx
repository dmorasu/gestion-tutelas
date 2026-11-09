"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-toastify"
import { asociarCorreo, descartarCorreo } from "../acciones"
import { ETAPAS } from "@/src/lib/formato"

// Lo que no es una asignación nueva: un correo más de una actuación abierta, o algo que no es de tutelas
export default function AccionesCorreo({ correoId, actuaciones }: { correoId: number, actuaciones: { id: number, etapa: string }[] }) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [motivo, setMotivo] = useState("")
  const [actuacionId, setActuacionId] = useState(actuaciones[0]?.id ?? 0)

  const ejecutar = (fn: () => Promise<{ ok: boolean, errores?: string[] }>, mensaje: string) =>
    iniciar(async () => {
      const r = await fn()
      if (!r.ok) return void toast.error(r.errores?.join(". "))
      toast.success(mensaje)
      router.push("/correos")
    })

  return (
    <div className="tarjeta p-5 space-y-4 text-sm">
      {actuaciones.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Es un correo más de una actuación abierta</p>
          <div className="flex gap-2">
            <select value={actuacionId} onChange={e => setActuacionId(Number(e.target.value))} className="campo">
              {actuaciones.map(a => <option key={a.id} value={a.id}>{ETAPAS[a.etapa]} #{a.id}</option>)}
            </select>
            <button disabled={pendiente} className="boton-secundario" onClick={() => ejecutar(() => asociarCorreo(correoId, actuacionId), "Correo asociado")}>Asociar</button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700">No es una asignación</p>
        <div className="flex gap-2">
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (publicidad, respuesta automática…)" className="campo" />
          <button disabled={pendiente || !motivo.trim()} className="boton-secundario" onClick={() => ejecutar(() => descartarCorreo(correoId, motivo), "Correo descartado")}>Descartar</button>
        </div>
      </div>
    </div>
  )
}
