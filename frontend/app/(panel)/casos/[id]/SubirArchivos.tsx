"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-toastify"
import { Upload } from "lucide-react"

type Tipo = "ESCRITO" | "ANEXO" | "INSUMO" | "SOPORTE"
const NOMBRES: Record<Tipo, string> = { ESCRITO: "Escrito", ANEXO: "Anexos", INSUMO: "Insumos", SOPORTE: "Soportes" }

// Sube al expediente en SharePoint (pasa por app/archivos/subir: los escritos pesan más de lo que
// aceptan las server actions)
export default function SubirArchivos({ actuacionId, tipos }: { actuacionId: number, tipos: Tipo[] }) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [tipo, setTipo] = useState<Tipo>(tipos[0])
  const [subiendo, setSubiendo] = useState(false)

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return
    setSubiendo(true)
    const datos = new FormData()
    datos.set("actuacionId", String(actuacionId))
    datos.set("tipo", tipo)
    for (const a of Array.from(archivos)) datos.append("archivos", a)
    try {
      const r = await fetch("/archivos/subir", { method: "POST", body: datos })
      const json = await r.json().catch(() => null)
      if (!r.ok) return void toast.error(json?.error ?? json?.errors?.[0]?.msg ?? "No se pudo subir")
      toast.success(archivos.length === 1 ? "Documento subido" : `${archivos.length} documentos subidos`)
      router.refresh()
    } finally {
      setSubiendo(false)
      if (entrada.current) entrada.current.value = ""
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tipos.length > 1 && (
        <select value={tipo} onChange={e => setTipo(e.target.value as Tipo)} className="campo w-auto py-1.5 text-xs">
          {tipos.map(t => <option key={t} value={t}>{NOMBRES[t]}</option>)}
        </select>
      )}
      <input ref={entrada} type="file" multiple className="hidden" onChange={e => subir(e.target.files)} />
      <button type="button" disabled={subiendo} onClick={() => entrada.current?.click()} className="boton-secundario py-1.5 text-xs inline-flex items-center gap-1.5">
        <Upload size={13} /> {subiendo ? "Subiendo…" : `Subir ${NOMBRES[tipo].toLowerCase()}`}
      </button>
    </div>
  )
}
