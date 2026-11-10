"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-toastify"
import { CheckCircle2, XCircle } from "lucide-react"
import { guardarAsistencia } from "./acciones"

export type DiaAsistencia = {
  fecha: string, habil: boolean, registrado: boolean, cumple: boolean
  personas: { id: number, nombre: string, rol: string, estado: string | null, observacion: string | null }[]
  porRol: { rol: string, presentes: number, justificados: number, requerido: number, cumple: boolean }[]
}

const ROLES: Record<string, string> = { COORDINADOR: "Coordinador", REVISOR: "Revisores", AUXILIAR: "Auxiliares jurídicos", ASISTENTE: "Asistentes administrativos" }
const ESTADOS: Record<string, string> = { PRESENTE: "Presente", AUSENTE: "Ausente", INCAPACIDAD: "Incapacidad", VACACIONES: "Vacaciones", PERMISO: "Permiso" }

export default function FormAsistencia({ dia }: { dia: DiaAsistencia }) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  // Sin registro, todos arrancan como presentes: se marca solo quien faltó
  const [estados, setEstados] = useState<Record<number, string>>(() => Object.fromEntries(dia.personas.map(p => [p.id, p.estado ?? "PRESENTE"])))
  const [notas, setNotas] = useState<Record<number, string>>(() => Object.fromEntries(dia.personas.map(p => [p.id, p.observacion ?? ""])))

  const guardar = () => iniciar(async () => {
    const r = await guardarAsistencia(dia.fecha, dia.personas.map(p => ({ usuarioId: p.id, estado: estados[p.id], observacion: notas[p.id] || null })))
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Asistencia guardada")
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="etiqueta">Día</label>
          <input type="date" defaultValue={dia.fecha} className="campo w-auto" onChange={e => e.target.value && router.push(`/asistencia?fecha=${e.target.value}`)} />
        </div>
        {!dia.habil && <p className="pb-2 text-sm text-amber-700">No es día hábil: no cuenta para el ANS-11.</p>}
        {dia.registrado && (
          <p className={`flex items-center gap-1.5 pb-2 text-sm font-medium ${dia.cumple ? "text-emerald-700" : "text-red-700"}`}>
            {dia.cumple ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{dia.cumple ? "Equipo mínimo completo" : "Por debajo del equipo mínimo"}
          </p>
        )}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {dia.porRol.map(r => (
          <div key={r.rol} className="tarjeta px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{ROLES[r.rol] ?? r.rol}</p>
            <p className={`mt-1 text-2xl font-semibold ${dia.registrado && !r.cumple ? "text-red-700" : "text-slate-900"}`}>
              {r.presentes + r.justificados}<span className="text-sm font-normal text-slate-400"> / {r.requerido}</span>
            </p>
          </div>
        ))}
      </section>

      <section className="tarjeta p-5">
        {dia.personas.length === 0 ? <p className="text-sm text-slate-500">No hay personas activas con perfil de coordinador, revisor, auxiliar o asistente.</p> : (
          <div className="overflow-x-auto">
            <table className="tabla w-full">
              <thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Observación</th></tr></thead>
              <tbody>
                {dia.personas.map(p => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap">{p.nombre}</td>
                    <td className="text-slate-500">{ROLES[p.rol] ?? p.rol}</td>
                    <td>
                      <select value={estados[p.id]} onChange={e => setEstados(x => ({ ...x, [p.id]: e.target.value }))} className="campo py-1">
                        {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td><input value={notas[p.id]} onChange={e => setNotas(x => ({ ...x, [p.id]: e.target.value }))} className="campo py-1" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {dia.personas.length > 0 && (
          <div className="mt-4 flex justify-end"><button disabled={pendiente} onClick={guardar} className="boton-primario">Guardar asistencia</button></div>
        )}
      </section>
    </div>
  )
}
