"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "react-toastify"
import clsx from "clsx"
import { Check, Link2, Merge, X } from "lucide-react"
import { decidirRelacion, relacionarCaso, unirCaso } from "../../acciones"
import Modal from "@/components/ui/Modal"
import { ESTADOS_ACTUACION, ETAPAS, fechaHora, radicado } from "@/src/lib/formato"
import type { Resultado } from "@/src/lib/api"

export type Vinculo = {
  id: number, tipo: string, estado: "SUGERIDA" | "CONFIRMADA", motivo: string | null, nota: string | null, decididoPor: string | null, fechaDecision: string | null
  otro: {
    id: number, numeroInterno: string | null, radicado: string, estado: string, fechaFacturacion: string | null, derechos: string | null,
    accionantes: string[], actuaciones: { id: number, etapa: string, estado: string }[]
  }
}

type Props = { casoId: number, vinculos: Vinculo[], tipos: Record<string, string>, puedeDecidir: boolean, coordina: boolean }

// Qué significa cada relación para la factura (reunión 18-nov)
const EN_FACTURA: Record<string, string> = {
  MISMO_PROCESO: "Se factura una sola vez: el que llegó primero",
  TEMERIDAD: "Cada radicado se factura",
  ANTECEDENTE: "Cada radicado se factura"
}

export default function CasosRelacionados({ casoId, vinculos, tipos, puedeDecidir, coordina }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [uniendo, setUniendo] = useState<Vinculo | null>(null)
  const [tipoNuevo, setTipoNuevo] = useState("ANTECEDENTE")

  const ejecutar = (accion: () => Promise<Resultado>, mensaje: string, despues?: () => void) => iniciar(async () => {
    const r = await accion()
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success(mensaje)
    despues?.()
  })

  const decidir = (v: Vinculo, d: FormData, estado: "CONFIRMADA" | "DESCARTADA") =>
    ejecutar(() => decidirRelacion(casoId, v.id, { estado, tipo: String(d.get("tipo") ?? v.tipo), nota: String(d.get("nota") ?? "").trim() || null }),
      estado === "CONFIRMADA" ? "Relación confirmada" : "Sugerencia descartada")

  return (
    <div className="space-y-4">
      {vinculos.length === 0 && <p className="text-xs text-slate-500">Sin casos relacionados.</p>}
      <ul className="space-y-3">
        {vinculos.map(v => (
          <li key={v.id} className={clsx("rounded-lg border px-4 py-3 text-sm", v.estado === "SUGERIDA" ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-white")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip border-slate-300 bg-slate-100 text-slate-700">{tipos[v.tipo] ?? v.tipo}</span>
              {v.estado === "SUGERIDA" && <span className="chip border-amber-200 bg-amber-50 text-amber-700">Por revisar</span>}
              <Link href={`/casos/${v.otro.id}`} className="enlace font-semibold">{v.otro.numeroInterno ?? "Caso"}</Link>
              <span className="font-mono text-xs text-slate-500">{radicado(v.otro.radicado)}</span>
              {v.otro.estado === "CERRADO" && <span className="text-xs text-slate-400">cerrado</span>}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              {v.otro.accionantes.join(", ") || "Sin accionante"}
              {v.otro.actuaciones.length > 0 && ` · ${v.otro.actuaciones.map(a => `${ETAPAS[a.etapa]}: ${ESTADOS_ACTUACION[a.estado]?.toLowerCase()}`).join("; ")}`}
            </p>
            {v.otro.derechos && <p className="mt-0.5 text-xs text-slate-500">Derechos: {v.otro.derechos}</p>}
            {v.motivo && <p className="mt-1 text-xs text-slate-500">{v.motivo}</p>}
            {v.estado === "CONFIRMADA" && (
              <p className="mt-1 text-xs text-slate-500">
                Confirmada por {v.decididoPor ?? "—"} el {fechaHora(v.fechaDecision)} · {EN_FACTURA[v.tipo]}
                {v.nota && <span className="block whitespace-pre-line text-slate-600">{v.nota}</span>}
              </p>
            )}

            {v.estado === "SUGERIDA" && puedeDecidir && (
              <form className="mt-3 flex flex-wrap items-end gap-2" action={d => decidir(v, d, "CONFIRMADA")}>
                <div className="w-48">
                  <label className="etiqueta">Es</label>
                  <select name="tipo" defaultValue={v.tipo} className="campo">
                    {Object.entries(tipos).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                  </select>
                </div>
                <div className="min-w-48 flex-1">
                  <label className="etiqueta">Nota</label>
                  <input name="nota" maxLength={2000} placeholder="Cómo se procede con el antecedente" className="campo" />
                </div>
                <button disabled={pendiente} className="boton-primario"><Check size={15} />Confirmar</button>
                <button type="button" disabled={pendiente} className="boton-secundario"
                  onClick={e => decidir(v, new FormData(e.currentTarget.form!), "DESCARTADA")}><X size={15} />No tiene relación</button>
              </form>
            )}

            {v.estado === "CONFIRMADA" && v.tipo === "MISMO_PROCESO" && coordina && (
              <button type="button" onClick={() => setUniendo(v)} className="boton-secundario mt-3 py-1.5 text-xs"><Merge size={14} />Unir a este caso</button>
            )}
          </li>
        ))}
      </ul>

      {puedeDecidir && (
        <form action={d => ejecutar(() => relacionarCaso(casoId, { otro: String(d.get("otro") ?? ""), tipo: tipoNuevo, nota: String(d.get("nota") ?? "").trim() || null }), "Casos relacionados")}
          className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
          <div className="w-56">
            <label className="etiqueta">Relacionar con</label>
            <input name="otro" required placeholder="GPA-2026-00010 o radicado" className="campo" />
          </div>
          <div className="w-48">
            <label className="etiqueta">Es</label>
            <select value={tipoNuevo} onChange={e => setTipoNuevo(e.target.value)} className="campo">
              {Object.entries(tipos).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </div>
          <div className="min-w-48 flex-1">
            <label className="etiqueta">Nota</label>
            <input name="nota" maxLength={2000} className="campo" />
          </div>
          <button disabled={pendiente} className="boton-secundario"><Link2 size={15} />Relacionar</button>
        </form>
      )}

      <Modal abierto={!!uniendo} alCerrar={() => !pendiente && setUniendo(null)} titulo="Unir casos" subtitulo={uniendo ? `${uniendo.otro.numeroInterno ?? "Caso"} pasa a este caso` : ""}>
        {uniendo && (
          <form className="space-y-4" action={d => ejecutar(() => unirCaso(casoId, uniendo.otro.id, String(d.get("motivo") ?? "")), "Casos unidos", () => setUniendo(null))}>
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">
              <li>Sus actuaciones, correos, documentos, notas y bitácora pasan a este caso, y los documentos a su carpeta.</li>
              <li>{uniendo.otro.numeroInterno} deja de existir. Su radicado {radicado(uniendo.otro.radicado)} y su número quedan guardados aquí para reconocer los correos que lleguen con ellos.</li>
              <li>Se factura una sola vez, con la primera asignación de los dos.</li>
            </ul>
            <div>
              <label className="etiqueta">Motivo</label>
              <textarea name="motivo" required rows={2} maxLength={500} className="campo" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setUniendo(null)} className="boton-secundario">Cancelar</button>
              <button disabled={pendiente} className="boton-primario"><Merge size={15} />Unir</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
