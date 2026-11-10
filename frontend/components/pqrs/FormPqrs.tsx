"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-toastify"
import { registrarCorreo } from "@/app/(panel)/correos/acciones"
import { crearPqrsLigada, registrarManual } from "@/app/(panel)/casos/acciones"
import { isoDesdeLocal } from "@/src/lib/formato"

// =====================================
// PQRS (D21–D24): radicado de la entidad (alfanumérico), tipo de petición (su término sale del
// parámetro TERMINOS_PQRS) y fecha en que el ciudadano la radicó. Tres usos: registro manual, desde
// un correo de asignación, o ligada a una tutela por derecho de petición (D24)
// =====================================

type Props = {
  modo: "manual" | "correo" | "ligada"
  tiposPeticion: Record<string, string>
  correoId?: number
  casoId?: number
  alTerminar?: () => void
}

export default function FormPqrs({ modo, tiposPeticion, correoId, casoId, alTerminar }: Props) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()

  const enviar = (d: FormData) => iniciar(async () => {
    const comun = {
      radicado: String(d.get("radicado") ?? ""),
      tipoPeticion: d.get("tipoPeticion"),
      observaciones: d.get("observaciones") || null
    }
    const radicacion = isoDesdeLocal(String(d.get("fechaRadicacion") ?? ""))
    const r = modo === "ligada"
      ? await crearPqrsLigada(casoId!, { ...comun, fechaRadicacionPeticion: radicacion })
      : modo === "correo"
        ? await registrarCorreo(correoId!, { ...comun, tipoSolicitud: "PQRS", etapa: "PQRS", fechaNotificacion: radicacion })
        : await registrarManual({ ...comun, tipoSolicitud: "PQRS", etapa: "PQRS", fechaNotificacion: radicacion, fechaAsignacion: isoDesdeLocal(String(d.get("fechaAsignacion") ?? "")) })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    const { casoId: nuevo, numeroInterno, deOtroOperador } = r.datos as { casoId: number, numeroInterno: string, deOtroOperador: boolean }
    toast.success(`PQRS registrada: caso ${numeroInterno}`)
    if (deOtroOperador) toast.warn("Según el archivo maestro, otro equipo ya responde esta PQRS")
    alTerminar?.()
    router.push(`/casos/${nuevo}`)
  })

  return (
    <form action={enviar} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
      <div>
        <label className="etiqueta">Radicado de la petición</label>
        <input name="radicado" required className="campo font-mono" />
      </div>
      <div>
        <label className="etiqueta">Tipo de petición</label>
        <select name="tipoPeticion" required className="campo">
          {Object.entries(tiposPeticion).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="etiqueta">Radicada por el ciudadano el</label>
        <input type="datetime-local" name="fechaRadicacion" required className="campo" />
      </div>
      {modo === "manual" && (
        <div>
          <label className="etiqueta">Asignada el</label>
          <input type="datetime-local" name="fechaAsignacion" required className="campo" />
        </div>
      )}
      <div className="sm:col-span-2">
        <label className="etiqueta">Observaciones</label>
        <textarea name="observaciones" rows={2} className="campo" />
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <button disabled={pendiente} className="boton-primario">{modo === "ligada" ? "Crear PQRS ligada" : "Registrar PQRS"}</button>
      </div>
    </form>
  )
}
