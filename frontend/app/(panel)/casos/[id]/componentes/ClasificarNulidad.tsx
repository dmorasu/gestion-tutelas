"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { pasoActuacion } from "../../acciones"
import { ETAPAS, ETAPAS_PROCESO } from "@/src/lib/formato"

// Reunión 18-nov: la nulidad llega sin etapa. Quien la recibió revisa el caso, decide en qué etapa queda
// el radicado y el sistema lo reparte al equipo de esa etapa. Queda en la bitácora con la nota
export default function ClasificarNulidad({ casoId, actuacionId, puede }: { casoId: number, actuacionId: number, puede: boolean }) {
  const [etapa, setEtapa] = useState("")
  const [pendiente, iniciar] = useTransition()

  const clasificar = (d: FormData) => iniciar(async () => {
    const r = await pasoActuacion(casoId, actuacionId, "clasificar-nulidad", { etapa, nota: String(d.get("nota") ?? "").trim() || null })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    const { auxiliar } = (r.datos ?? {}) as { auxiliar?: string | null }
    toast.success(`Queda en ${ETAPAS[etapa].toLowerCase()}${auxiliar ? `: la recibe ${auxiliar}` : ""}`)
  })

  return (
    <div className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-slate-800">Nulidad por clasificar</p>
      {puede && (
        <form action={clasificar} className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {ETAPAS_PROCESO.map(e => (
              <button key={e} type="button" className="opcion" aria-pressed={etapa === e} onClick={() => setEtapa(e)}>{ETAPAS[e]}</button>
            ))}
          </div>
          <input name="nota" maxLength={2000} placeholder="Nota para la bitácora (opcional)" className="campo" />
          <button disabled={pendiente || !etapa} className="boton-primario">Clasificar</button>
        </form>
      )}
    </div>
  )
}
