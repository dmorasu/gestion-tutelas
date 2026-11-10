"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import clsx from "clsx"
import { toast } from "react-toastify"
import { MailOpen, PenLine, Reply, Send } from "lucide-react"
import { borradorCorreo, pasoActuacion } from "../../acciones"
import { BUZONES, PROPOSITOS, fechaHora } from "@/src/lib/formato"

export type CorreoCaso = {
  id: number, direccion: string, buzon: string | null, remitente: string | null, para: string[], asunto: string | null, fechaCorreo: string
  proposito: string | null, estado: string, porRevisar: boolean, error: string | null, actuacionId: number | null
}
type Borrador = { asunto: string, destinatarios: Record<string, string[]> }
type Actuacion = { id: number, etapa: string, nombre: string }

export default function CorreosCaso({ casoId, correos, actuaciones, puedeEscribir }: {
  casoId: number, correos: CorreoCaso[], actuaciones: Actuacion[], puedeEscribir: boolean
}) {
  const [pendiente, iniciar] = useTransition()
  const [abierto, setAbierto] = useState(false)
  const [actuacionId, setActuacionId] = useState(actuaciones[0]?.id ?? 0)
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [buzon, setBuzon] = useState("ASIGNACIONES")
  const [para, setPara] = useState("")
  const [asunto, setAsunto] = useState("")
  const [cuerpo, setCuerpo] = useState("")
  const [responderA, setResponderA] = useState<CorreoCaso | null>(null)

  // Abre el formulario con el asunto normalizado y los destinatarios del buzón
  const escribir = (respuesta: CorreoCaso | null, idActuacion = actuacionId) => iniciar(async () => {
    const r = await borradorCorreo(idActuacion)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    const b = r.datos as Borrador
    const elegido = respuesta?.buzon ?? "ASIGNACIONES"
    setBorrador(b)
    setActuacionId(idActuacion)
    setResponderA(respuesta)
    setBuzon(elegido)
    setPara(respuesta?.remitente ?? b.destinatarios[elegido]?.join(", ") ?? "")
    setAsunto(respuesta?.asunto ? (/^re:/i.test(respuesta.asunto) ? respuesta.asunto : `RE: ${respuesta.asunto}`) : b.asunto)
    setCuerpo("Buen día.\n\n\n\nCordialmente,\nEquipo de apoyo jurídico")
    setAbierto(true)
  })

  const cambiarBuzon = (nuevo: string) => {
    setBuzon(nuevo)
    if (!responderA && borrador) setPara(borrador.destinatarios[nuevo]?.join(", ") ?? "")
  }

  const enviar = () => iniciar(async () => {
    const r = await pasoActuacion(casoId, actuacionId, "correo", {
      buzon, para: para.split(/[,;\s]+/).filter(Boolean), asunto, cuerpo, responderACorreoId: responderA?.id ?? null
    })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Correo enviado")
    setAbierto(false)
  })

  return (
    <div className="space-y-4">
      {puedeEscribir && !abierto && actuaciones.length > 0 && (
        <button disabled={pendiente} onClick={() => escribir(null)} className="boton-primario inline-flex items-center gap-2"><PenLine size={15} /> Escribir correo</button>
      )}

      {abierto && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="etiqueta">Sale por el buzón de</label>
              <select value={buzon} onChange={e => cambiarBuzon(e.target.value)} className="campo">
                {Object.entries(BUZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {actuaciones.length > 1 && (
              <div>
                <label className="etiqueta">Actuación</label>
                <select value={actuacionId} onChange={e => escribir(responderA, Number(e.target.value))} className="campo">
                  {actuaciones.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
            )}
            <div className={actuaciones.length > 1 ? "" : "sm:col-span-2"}>
              <label className="etiqueta">Para (separe con comas)</label>
              <input value={para} onChange={e => setPara(e.target.value)} className="campo" />
            </div>
          </div>
          {responderA && <p className="text-xs text-slate-500">Responde en el hilo de: <b>{responderA.asunto}</b></p>}
          <div>
            <label className="etiqueta">Asunto</label>
            <input value={asunto} onChange={e => setAsunto(e.target.value)} className="campo font-mono text-xs" />
          </div>
          <div>
            <label className="etiqueta">Mensaje</label>
            <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={8} className="campo" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="boton-secundario">Cancelar</button>
            <button disabled={pendiente} onClick={enviar} className="boton-primario inline-flex items-center gap-2"><Send size={14} /> Enviar</button>
          </div>
        </div>
      )}

      {correos.length === 0 && <p className="text-sm text-slate-500">Sin correos.</p>}
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {correos.map(c => {
          const saliente = c.direccion === "SALIENTE"
          return (
            <li key={c.id} className="flex gap-3 px-4 py-3">
              <span className={clsx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", saliente ? "bg-slate-200 text-slate-700" : "bg-teal-100 text-teal-700")}>
                {saliente ? <Send size={13} /> : <MailOpen size={13} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-slate-500">
                  {saliente ? "Enviado" : "Recibido"}{c.buzon ? ` · buzón de ${BUZONES[c.buzon].toLowerCase()}` : ""}{c.proposito ? ` · ${PROPOSITOS[c.proposito] ?? c.proposito}` : ""} · {fechaHora(c.fechaCorreo)}
                  {c.estado === "SIMULADO" && <span className="text-amber-700"> · simulado (no salió)</span>}
                  {c.estado === "ERROR" && <span className="text-red-700"> · no se envió</span>}
                  {c.porRevisar && <span className="text-amber-700 font-semibold"> · por revisar</span>}
                </p>
                {saliente
                  ? <p className="text-sm text-slate-800 [overflow-wrap:anywhere]" title={c.para.join(", ")}>{c.asunto || "(sin asunto)"}</p>
                  : <Link href={`/correos/${c.id}`} className="text-sm text-slate-800 hover:underline [overflow-wrap:anywhere]">{c.asunto || "(sin asunto)"}</Link>}
                <p className="text-[11px] text-slate-400 truncate">{saliente ? `Para: ${c.para.join(", ")}` : `De: ${c.remitente ?? "—"}`}</p>
                {c.error && <p className="text-xs text-red-700 [overflow-wrap:anywhere]">{c.error}</p>}
              </div>
              {!saliente && puedeEscribir && (
                <button disabled={pendiente} onClick={() => escribir(c, c.actuacionId ?? actuacionId)} title="Responder" className="self-start rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Reply size={16} /></button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
