"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { Eye, Send } from "lucide-react"
import { enviarPruebaPlantilla, guardarPlantilla, vistaPreviaPlantilla } from "./acciones"

export type Plantilla = { codigo: string, nombre: string, buzon: string, titulo: string, asunto: string, cuerpo: string, confirmada: boolean }

export default function EditorPlantilla({ plantilla: p, envioReal }: { plantilla: Plantilla, envioReal: boolean }) {
  const [pendiente, iniciar] = useTransition()
  const [titulo, setTitulo] = useState(p.titulo)
  const [asunto, setAsunto] = useState(p.asunto)
  const [cuerpo, setCuerpo] = useState(p.cuerpo)
  const [confirmada, setConfirmada] = useState(p.confirmada)
  const [previa, setPrevia] = useState<{ asunto: string, html: string } | null>(null)
  const cambiado = titulo !== p.titulo || asunto !== p.asunto || cuerpo !== p.cuerpo || confirmada !== p.confirmada

  const guardar = () => iniciar(async () => {
    const r = await guardarPlantilla(p.codigo, { titulo, asunto, cuerpo, confirmada })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Plantilla guardada")
  })

  // Siempre con lo que está escrito ahora (aunque no se haya guardado)
  const verPrevia = () => iniciar(async () => {
    const r = await vistaPreviaPlantilla(p.codigo, { titulo, asunto, cuerpo })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    setPrevia(r.datos as { asunto: string, html: string })
  })

  const probar = () => iniciar(async () => {
    const r = await enviarPruebaPlantilla(p.codigo, { titulo, asunto, cuerpo })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success(`Prueba enviada a ${(r.datos as { para: string }).para}`)
  })

  return (
    <div className="tarjeta p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{p.nombre}</h3>
        {confirmada
          ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200">Definitiva</span>
          : <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-300">Borrador</span>}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr,2fr]">
        <div>
          <label className="etiqueta">Título del correo</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} className="campo" />
        </div>
        <div>
          <label className="etiqueta">Asunto</label>
          <input value={asunto} onChange={e => setAsunto(e.target.value)} className="campo font-mono text-xs" />
        </div>
      </div>
      <div>
        <label className="etiqueta">Cuerpo</label>
        <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} rows={7} className="campo text-sm" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmada} onChange={e => setConfirmada(e.target.checked)} /> Plantilla definitiva del cliente
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={pendiente} onClick={verPrevia} className="boton-secundario py-1.5 inline-flex items-center gap-1.5"><Eye size={14} /> Vista previa</button>
          {envioReal && (
            <button disabled={pendiente} onClick={probar} className="boton-secundario py-1.5 inline-flex items-center gap-1.5" title="Llega a su correo con datos de ejemplo">
              <Send size={14} /> Enviarme una prueba
            </button>
          )}
          <button disabled={!cambiado || pendiente} onClick={guardar} className="boton-primario py-1.5">Guardar</button>
        </div>
      </div>

      {previa && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2 text-xs">
            <span className="truncate"><span className="text-slate-500">Asunto: </span><span className="font-medium text-slate-800">{previa.asunto}</span></span>
            <button onClick={() => setPrevia(null)} className="enlace shrink-0">Cerrar</button>
          </div>
          {/* sandbox sin scripts: el HTML del correo se muestra aislado de la app */}
          <iframe title={`Vista previa: ${p.nombre}`} srcDoc={previa.html} sandbox="" className="w-full h-[640px] bg-slate-100" />
        </div>
      )}
    </div>
  )
}
