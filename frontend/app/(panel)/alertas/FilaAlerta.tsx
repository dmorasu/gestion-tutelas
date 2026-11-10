"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "react-toastify"
import { emitirAlerta, descartarAlerta } from "./acciones"
import { fechaHora, radicado, tiempoRestante } from "@/src/lib/formato"

export type AlertaFila = {
  id: number, tipo: string, mensaje: string, estado: string, fechaDeteccion: string, fechaLimiteEmision: string | null, fechaEmision: string | null,
  motivoDescarte: string | null, caso: { id: number, numeroInterno: string | null, radicado: string }, usuario: { nombre: string } | null
}

export default function FilaAlerta({ a, nombre, puedeEmitir }: { a: AlertaFila, nombre: string, puedeEmitir: boolean }) {
  const [pendiente, iniciar] = useTransition()
  const [abierto, setAbierto] = useState<"" | "emitir" | "descartar">("")
  const [texto, setTexto] = useState("")
  const tarde = !!a.fechaLimiteEmision && new Date(a.fechaLimiteEmision) < new Date()

  const ejecutar = (fn: () => Promise<{ ok: boolean, errores?: string[] }>, mensaje: string) => iniciar(async () => {
    const r = await fn()
    if (!r.ok) return void toast.error(r.errores?.join(". "))
    toast.success(mensaje)
    setAbierto("")
  })

  return (
    <li className="px-5 py-4 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            {nombre} · <Link href={`/casos/${a.caso.id}`} className="enlace">{a.caso.numeroInterno ?? radicado(a.caso.radicado)}</Link>
          </p>
          <p className="text-sm text-slate-600">{a.mensaje}</p>
          <p className="mt-1 text-xs text-slate-500">
            Detectada {fechaHora(a.fechaDeteccion)}
            {a.estado === "PENDIENTE" && a.fechaLimiteEmision && (
              <span className={tarde ? "text-red-700 font-semibold" : ""}> · emitir antes de {fechaHora(a.fechaLimiteEmision)} ({tiempoRestante(a.fechaLimiteEmision)})</span>
            )}
            {a.estado === "EMITIDA" && <> · emitida {fechaHora(a.fechaEmision)}{a.usuario && ` por ${a.usuario.nombre}`}</>}
            {a.estado === "DESCARTADA" && <> · descartada{a.usuario && ` por ${a.usuario.nombre}`}: {a.motivoDescarte}</>}
          </p>
        </div>
        {a.estado === "PENDIENTE" && puedeEmitir && (
          <div className="flex gap-2">
            <button disabled={pendiente} className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "descartar" ? "" : "descartar")}>Descartar</button>
            <button disabled={pendiente} className="boton-primario py-1.5 text-xs" onClick={() => setAbierto(abierto === "emitir" ? "" : "emitir")}>Emitir al cliente</button>
          </div>
        )}
      </div>
      {abierto && (
        <div className="flex gap-2">
          <input value={texto} onChange={e => setTexto(e.target.value)} className="campo"
            placeholder={abierto === "emitir" ? "Nota adicional para el cliente (opcional)" : "Por qué se descarta"} />
          <button disabled={pendiente || (abierto === "descartar" && !texto.trim())} className={abierto === "emitir" ? "boton-primario" : "boton-secundario"}
            onClick={() => abierto === "emitir"
              ? ejecutar(() => emitirAlerta(a.id, texto), "Alerta emitida")
              : ejecutar(() => descartarAlerta(a.id, texto), "Alerta descartada")}>
            {abierto === "emitir" ? "Enviar" : "Descartar"}
          </button>
        </div>
      )}
    </li>
  )
}
