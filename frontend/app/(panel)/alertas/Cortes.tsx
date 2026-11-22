"use client"

import { useTransition } from "react"
import { toast } from "react-toastify"
import { enviarCorteAhora, reenviarCorte } from "./acciones"
import { dia, fechaHora } from "@/src/lib/formato"

export type CorteFila = {
  id: number, dia: string, hora: string, automatico: boolean, cantidad: number, estado: "ENVIADO" | "SIMULADO" | "ERROR", error: string | null,
  reenvios: number, ultimoReenvio: string | null, createdAt: string, usuario: { nombre: string } | null
}

const ESTADO_CORTE = { ENVIADO: "Enviado", SIMULADO: "Simulado", ERROR: "No salió" } as const

// Botón del encabezado: corte a mano con todas las pendientes (si el worker no corre o algo no puede esperar)
export function BotonCorte() {
  const [pendiente, iniciar] = useTransition()
  return (
    <button disabled={pendiente} className="boton-primario" onClick={() => iniciar(async () => {
      const r = await enviarCorteAhora()
      if (!r.ok) return void toast.error(r.errores.join(". "))
      const { cantidad } = r.datos as { cantidad: number }
      toast.success(cantidad ? `Corte enviado con ${cantidad} alertas` : "No había alertas pendientes")
    })}>
      {pendiente ? "Enviando…" : "Enviar corte ahora"}
    </button>
  )
}

function FilaCorte({ c, puedeEmitir }: { c: CorteFila, puedeEmitir: boolean }) {
  const [pendiente, iniciar] = useTransition()
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">
          {dia(c.dia)} · {c.automatico ? `corte de las ${c.hora}` : `enviado a mano a las ${c.hora}`}
        </p>
        <p className="text-xs text-slate-500">
          {c.cantidad ? `${c.cantidad} alertas` : "Sin alertas pendientes: no se envió correo"}
          {c.cantidad > 0 && <> · <span className={c.estado === "ERROR" ? "font-semibold text-red-700" : c.estado === "SIMULADO" ? "text-amber-700" : ""}>{ESTADO_CORTE[c.estado]}</span></>}
          {!c.automatico && c.usuario && ` por ${c.usuario.nombre}`}
          {c.reenvios > 0 && ` · reenviado ${c.reenvios === 1 ? "una vez" : `${c.reenvios} veces`}, la última ${fechaHora(c.ultimoReenvio)}`}
        </p>
        {c.error && <p className="text-xs text-red-700">{c.error}</p>}
      </div>
      {puedeEmitir && c.cantidad > 0 && c.estado !== "ERROR" && (
        <button disabled={pendiente} className="boton-secundario py-1.5 text-xs" onClick={() => iniciar(async () => {
          const r = await reenviarCorte(c.id)
          if (!r.ok) return void toast.error(r.errores.join(". "))
          toast.success("Corte reenviado")
        })}>
          {pendiente ? "Reenviando…" : "Reenviar"}
        </button>
      )}
    </li>
  )
}

export default function Cortes({ cortes, puedeEmitir }: { cortes: CorteFila[], puedeEmitir: boolean }) {
  return (
    <ul className="tarjeta divide-y divide-slate-100">
      {cortes.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">Aún no hay cortes.</li>}
      {cortes.map(c => <FilaCorte key={c.id} c={c} puedeEmitir={puedeEmitir} />)}
    </ul>
  )
}
