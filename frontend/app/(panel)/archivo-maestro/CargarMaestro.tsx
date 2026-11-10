"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-toastify"

export default function CargarMaestro() {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [operador, setOperador] = useState("")
  const [cargando, setCargando] = useState(false)

  const cargar = async (archivo: File | undefined) => {
    if (!archivo) return
    if (!confirm("El archivo maestro nuevo reemplaza al anterior. ¿Continuar?")) return
    setCargando(true)
    const datos = new FormData()
    datos.set("archivo", archivo)
    datos.set("operador", operador)
    try {
      const r = await fetch("/seguimiento/archivo-maestro", { method: "POST", body: datos })
      const json = await r.json().catch(() => null)
      if (!r.ok) return void toast.error(json?.error ?? "No se pudo cargar")
      toast.success(`${json.otrosOperadores} radicados de otros operadores · ${json.casosMarcados} casos marcados · ${json.alertas} alertas nuevas`)
      router.refresh()
    } finally {
      setCargando(false)
      if (entrada.current) entrada.current.value = ""
    }
  }

  return (
    <div className="tarjeta p-4 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[16rem]">
        <label className="etiqueta">Operador, si el archivo no trae esa columna</label>
        <input value={operador} onChange={e => setOperador(e.target.value)} placeholder="Ej.: contratista de la entidad" className="campo" />
      </div>
      <input ref={entrada} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => cargar(e.target.files?.[0])} />
      <button disabled={cargando} onClick={() => entrada.current?.click()} className="boton-primario">{cargando ? "Cargando…" : "Cargar archivo maestro"}</button>
    </div>
  )
}
