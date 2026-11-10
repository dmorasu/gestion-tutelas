"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-toastify"
import { Search } from "lucide-react"
import { asociarComo, buscarActuaciones, descartarCorreo } from "../acciones"
import { ESTADOS_ACTUACION, ETAPAS, radicado } from "@/src/lib/formato"

type Actuacion = { id: number, etapa: string, estado: string, caso: { id: number, numeroInterno: string | null, radicado: string, partes: { nombre: string }[] } }

// Qué es el correo dentro del caso: de eso depende si queda atendido o por clasificar
const PROPOSITOS = [
  { clave: "SEGUIMIENTO", nombre: "Seguimiento del caso" },
  { clave: "INFORMATIVO", nombre: "Informativo (sin acción)" },
  { clave: "RESPUESTA_INSUMOS", nombre: "Respuesta con insumos" },
  { clave: "RESPUESTA_DATOS_FALTANTES", nombre: "Respuesta con datos faltantes" },
  { clave: "RESPUESTA_ENTREGA", nombre: "Respuesta a una entrega" }
]

const MOTIVOS = ["Publicidad o boletín", "Respuesta automática (fuera de oficina)", "Correo repetido", "No es del servicio de la firma", "Prueba"]

// Lo que no es una asignación nueva: un correo de un caso (cualquiera, buscándolo) o algo que se descarta
export default function AccionesCorreo({ correoId, actuaciones }: { correoId: number, actuaciones: Actuacion[] }) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [q, setQ] = useState("")
  const [resultados, setResultados] = useState<Actuacion[]>(actuaciones)
  const [actuacionId, setActuacionId] = useState(actuaciones[0]?.id ?? 0)
  const [proposito, setProposito] = useState("SEGUIMIENTO")
  const [motivo, setMotivo] = useState(MOTIVOS[0])
  const [otro, setOtro] = useState("")

  const buscar = () => iniciar(async () => {
    const lista = (await buscarActuaciones(q.trim())).filter(a => a.estado !== "CERRADA")
    setResultados(lista)
    setActuacionId(lista[0]?.id ?? 0)
    if (!lista.length) toast.info("No hay actuaciones abiertas con esa búsqueda")
  })

  const ejecutar = (fn: () => Promise<{ ok: boolean, errores?: string[] }>, mensaje: string) => iniciar(async () => {
    const r = await fn()
    if (!r.ok) return void toast.error(r.errores?.join(". "))
    toast.success(mensaje)
    router.push("/correos")
  })

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700">Es de un caso que ya existe</p>
        <div className="flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscar() } }}
            placeholder="Número interno, radicado o accionante" className="campo" />
          <button type="button" disabled={pendiente || q.trim().length < 3} onClick={buscar} className="boton-secundario inline-flex items-center gap-1.5"><Search size={14} /> Buscar</button>
        </div>
        {resultados.length > 0 && (
          <>
            <select value={actuacionId} onChange={e => setActuacionId(Number(e.target.value))} className="campo">
              {resultados.map(a => (
                <option key={a.id} value={a.id}>
                  {a.caso.numeroInterno ?? radicado(a.caso.radicado)} · {ETAPAS[a.etapa]} · {ESTADOS_ACTUACION[a.estado]}{a.caso.partes[0] ? ` · ${a.caso.partes[0].nombre}` : ""}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select value={proposito} onChange={e => setProposito(e.target.value)} className="campo">
                {PROPOSITOS.map(p => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
              </select>
              <button disabled={pendiente || !actuacionId} className="boton-primario" onClick={() => ejecutar(() => asociarComo(correoId, actuacionId, proposito), "Correo asociado al caso")}>Asociar</button>
            </div>
          </>
        )}
      </div>
      <div className="space-y-2 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-700">No es del servicio</p>
        <div className="flex flex-wrap gap-2">
          <select value={motivo} onChange={e => setMotivo(e.target.value)} className="campo w-auto">
            {MOTIVOS.map(m => <option key={m}>{m}</option>)}
            <option value="OTRO">Otro motivo…</option>
          </select>
          {motivo === "OTRO" && <input value={otro} onChange={e => setOtro(e.target.value)} placeholder="Motivo" className="campo flex-1 min-w-[10rem]" />}
          <button disabled={pendiente || (motivo === "OTRO" && !otro.trim())} className="boton-secundario"
            onClick={() => ejecutar(() => descartarCorreo(correoId, motivo === "OTRO" ? otro : motivo), "Correo descartado")}>Descartar</button>
        </div>
      </div>
    </div>
  )
}
