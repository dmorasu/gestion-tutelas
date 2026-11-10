"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import clsx from "clsx"
import { toast } from "react-toastify"
import { CheckCircle2, CloudDownload, ExternalLink, Link2, Upload, XCircle } from "lucide-react"
import { descartarEnlace, traerEnlace } from "../acciones"

export type Enlace = { id: number, url: string, estado: string, archivos: number, error: string | null }

// Cada enlace de SharePoint es un pendiente del correo: se trae al expediente (la app lo intenta sola),
// se sube a mano si pide iniciar sesión, o se descarta con motivo
export default function EnlacesCorreo({ correoId, enlaces }: { correoId: number, enlaces: Enlace[] }) {
  const router = useRouter()
  const [ocupado, iniciar] = useTransition()
  const [subiendo, setSubiendo] = useState<number | null>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const [paraSubir, setParaSubir] = useState<number | null>(null)

  const traer = (e: Enlace) => iniciar(async () => {
    const r = await traerEnlace(correoId, e.id)
    if (!r.ok) return void toast.error(r.errores?.join(". "))
    toast.success("Documento traído al expediente")
  })

  const descartar = (e: Enlace) => {
    const motivo = prompt("¿Por qué se descarta este enlace? (no es un documento del caso, repetido…)")
    if (!motivo?.trim()) return
    iniciar(async () => {
      const r = await descartarEnlace(correoId, e.id, motivo)
      if (!r.ok) return void toast.error(r.errores?.join(". "))
      toast.success("Enlace descartado")
    })
  }

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length || !paraSubir) return
    setSubiendo(paraSubir)
    const datos = new FormData()
    for (const a of Array.from(archivos)) datos.append("archivos", a)
    try {
      const r = await fetch(`/correos-enlaces/${paraSubir}/subir`, { method: "POST", body: datos })
      const json = await r.json().catch(() => null)
      if (!r.ok) return void toast.error(json?.error ?? "No se pudo subir")
      toast.success("Documento subido al expediente")
      router.refresh()
    } finally {
      setSubiendo(null)
      if (entrada.current) entrada.current.value = ""
    }
  }

  if (!enlaces.length) return null
  const pendientes = enlaces.filter(e => e.estado === "PENDIENTE").length

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <Link2 size={14} /> Enlaces de SharePoint
        {pendientes > 0 && <span className="rounded-full bg-amber-100 px-2 py-px text-[11px] text-amber-800">{pendientes} por traer</span>}
      </p>
      <input ref={entrada} type="file" multiple className="hidden" onChange={e => subir(e.target.files)} />
      <ul className="divide-y divide-slate-100">
        {enlaces.map(e => (
          <li key={e.id} className="py-2 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {e.estado === "DESCARGADO" ? <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                : e.estado === "DESCARTADO" ? <XCircle size={15} className="text-slate-400 shrink-0" />
                  : <CloudDownload size={15} className="text-amber-600 shrink-0" />}
              <a href={e.url} target="_blank" rel="noreferrer" className={clsx("min-w-0 flex-1 truncate text-xs hover:underline", e.estado === "DESCARTADO" ? "text-slate-400 line-through" : "text-slate-700")} title={e.url}>
                {e.url} <ExternalLink size={11} className="inline" />
              </a>
              {e.estado === "PENDIENTE" && (
                <span className="flex gap-1.5">
                  <button disabled={ocupado} onClick={() => traer(e)} className="boton-primario py-1 px-2.5 text-[11px]">Traer al expediente</button>
                  <button disabled={ocupado || subiendo === e.id} onClick={() => { setParaSubir(e.id); entrada.current?.click() }} className="boton-secundario py-1 px-2.5 text-[11px] inline-flex items-center gap-1">
                    <Upload size={12} /> {subiendo === e.id ? "Subiendo…" : "Subir a mano"}
                  </button>
                  <button disabled={ocupado} onClick={() => descartar(e)} className="rounded px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100">Descartar</button>
                </span>
              )}
            </div>
            {e.estado === "DESCARGADO" && <p className="pl-6 text-[11px] text-emerald-700">{e.archivos} documento(s) en el expediente</p>}
            {e.estado === "PENDIENTE" && e.error && <p className="pl-6 text-[11px] text-red-700">{e.error}. Ábralo, descárguelo y use «Subir a mano».</p>}
            {e.estado === "DESCARTADO" && e.error && <p className="pl-6 text-[11px] text-slate-500">Descartado: {e.error}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
