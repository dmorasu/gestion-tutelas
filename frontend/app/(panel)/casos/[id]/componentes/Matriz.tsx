"use client"

import { useMemo, useState } from "react"
import clsx from "clsx"
import { ChevronDown, Plus, Trash2 } from "lucide-react"

// =====================================
// CASILLAS DE LA MATRIZ DE INSUMOS (reunión 18-nov, modelos de la firma)
// Datos faltantes, insumos y anexos se marcan de la matriz de insumos (Configuración → Catálogos) y lo
// que no esté en ella se escribe aparte. En el correo salen solo los marcados.
// =====================================

export type ItemMatriz = { id: number, grupo: string | null, clase: "DOCUMENTO" | "INFORMACION" | null, nombre: string }

export const GRUPO_GENERAL = "Generales de la acción"

const Casilla = ({ marcado, onCambio, children }: { marcado: boolean, onCambio: () => void, children: React.ReactNode }) => (
  <label className={clsx("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs transition", marcado ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50")}>
    <input type="checkbox" checked={marcado} onChange={onCambio} className="mt-0.5" />
    <span>{children}</span>
  </label>
)

const alternar = <T,>(lista: T[], x: T) => (lista.includes(x) ? lista.filter(y => y !== x) : [...lista, x])

// ── Datos faltantes: la lista general (documentos de la acción) más "otros" ──
export function FormDatosFaltantes({ generales, textoInicial, pendiente, enviar }: {
  generales: ItemMatriz[], textoInicial: string, pendiente: boolean, enviar: (items: string[], otros: string, adjuntarExpediente: boolean) => void
}) {
  const [marcados, setMarcados] = useState<string[]>([])
  const [otros, setOtros] = useState(textoInicial)
  // El modelo de la firma adjunta el borrador de solicitud del expediente al despacho (1.1)
  const [adjuntar, setAdjuntar] = useState(true)
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="grid gap-0.5 sm:grid-cols-2">
        {generales.map(i => <Casilla key={i.id} marcado={marcados.includes(i.nombre)} onCambio={() => setMarcados(m => alternar(m, i.nombre))}>{i.nombre}</Casilla>)}
      </div>
      <div>
        <label className="etiqueta">Otros (uno por línea)</label>
        <textarea value={otros} onChange={e => setOtros(e.target.value)} rows={2} className="campo" />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={adjuntar} onChange={e => setAdjuntar(e.target.checked)} /> Adjuntar el borrador de solicitud del expediente al despacho
      </label>
      <button disabled={pendiente || (!marcados.length && !otros.trim())} onClick={() => enviar(marcados, otros, adjuntar)} className="boton-primario">
        Enviar solicitud{marcados.length ? ` (${marcados.length + (otros.trim() ? otros.trim().split("\n").length : 0)})` : ""}
      </button>
    </div>
  )
}

// ── Insumos: la matriz por grupo, con documentos e información, más los que no estén ──
export type InsumoPedido = { descripcion: string, minimo: boolean, itemCatalogoId: number | null, clase: "DOCUMENTO" | "INFORMACION" | null }

export function FormInsumosMatriz({ matriz, pendiente, enviar }: { matriz: ItemMatriz[], pendiente: boolean, enviar: (insumos: InsumoPedido[]) => void }) {
  // Los generales de la acción son los datos faltantes de la asistencia: aquí van los demás grupos
  const grupos = useMemo(() => [...new Set(matriz.filter(i => i.grupo !== GRUPO_GENERAL).map(i => i.grupo ?? ""))], [matriz])
  const [abierto, setAbierto] = useState<string | null>(grupos[0] ?? null)
  const [marcados, setMarcados] = useState<number[]>([])
  const [libres, setLibres] = useState<string[]>([])
  const elegidos = matriz.filter(i => marcados.includes(i.id))
  const total = elegidos.length + libres.filter(x => x.trim()).length

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      {grupos.map(grupo => {
        const delGrupo = matriz.filter(i => (i.grupo ?? "") === grupo)
        const n = delGrupo.filter(i => marcados.includes(i.id)).length
        return (
          <div key={grupo} className="rounded-md border border-slate-100">
            <button type="button" onClick={() => setAbierto(abierto === grupo ? null : grupo)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-700">
              <span>{grupo}{n > 0 && <span className="ml-2 rounded-full bg-slate-800 px-1.5 py-px text-[10px] text-white">{n}</span>}</span>
              <ChevronDown size={14} className={clsx("transition", abierto === grupo && "rotate-180")} />
            </button>
            {abierto === grupo && (
              <div className="grid gap-x-4 border-t border-slate-100 px-1 py-2 sm:grid-cols-2">
                {(["DOCUMENTO", "INFORMACION"] as const).map(clase => {
                  const items = delGrupo.filter(i => i.clase === clase)
                  if (!items.length) return null
                  return (
                    <div key={clase}>
                      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{clase === "DOCUMENTO" ? "Documentos" : "Información"}</p>
                      {items.map(i => <Casilla key={i.id} marcado={marcados.includes(i.id)} onCambio={() => setMarcados(m => alternar(m, i.id))}>{i.nombre}</Casilla>)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {libres.map((texto, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={texto} onChange={e => setLibres(l => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Insumo que no está en la matriz" className="campo" />
          <button type="button" onClick={() => setLibres(l => l.filter((_, j) => j !== i))} className="boton-icono" aria-label="Quitar"><Trash2 size={14} /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className="enlace inline-flex items-center gap-1 text-xs" onClick={() => setLibres(l => [...l, ""])}><Plus size={13} />Otro insumo</button>
        <button disabled={pendiente || !total} className="boton-primario ml-auto"
          onClick={() => enviar([
            ...elegidos.map(i => ({ descripcion: i.nombre, minimo: true, itemCatalogoId: i.id, clase: i.clase })),
            ...libres.filter(x => x.trim()).map(x => ({ descripcion: x.trim(), minimo: true, itemCatalogoId: null, clase: null }))
          ])}>
          Enviar solicitud{total ? ` (${total})` : ""}
        </button>
      </div>
    </div>
  )
}

// ── Entrega: documentos entregados (la ficha siempre) y anexos de la matriz ──
export type DatosEntrega = { documentos: string[], otroDocumento: string, anexos: string[], otrosAnexos: string }

export function FormEntrega({ version, documentos, sugerido, anexos, pendiente, enviar }: {
  version: string, documentos: Record<string, string>, sugerido: string | null, anexos: ItemMatriz[], pendiente: boolean, enviar: (d: DatosEntrega) => void
}) {
  const [marcados, setMarcados] = useState<string[]>(sugerido ? [sugerido] : [])
  const [otroDocumento, setOtroDocumento] = useState("")
  const [anexosMarcados, setAnexos] = useState<string[]>([])
  const [otrosAnexos, setOtrosAnexos] = useState("")
  const [verAnexos, setVerAnexos] = useState(false)
  const grupos = [...new Set(anexos.map(i => i.grupo ?? ""))]
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <div>
        <p className="etiqueta">Documentos entregados</p>
        <div className="grid gap-0.5 sm:grid-cols-2">
          {Object.entries(documentos).map(([clave, nombre]) => clave === "FICHA"
            ? <Casilla key={clave} marcado onCambio={() => undefined}>{nombre} (siempre)</Casilla>
            : <Casilla key={clave} marcado={marcados.includes(clave)} onCambio={() => setMarcados(m => alternar(m, clave))}>{nombre}</Casilla>)}
        </div>
        <input value={otroDocumento} onChange={e => setOtroDocumento(e.target.value)} placeholder="Otra actuación (opcional)" className="campo mt-2" />
      </div>
      <div>
        <button type="button" onClick={() => setVerAnexos(!verAnexos)} className="etiqueta inline-flex items-center gap-1">
          Anexos {anexosMarcados.length > 0 && `(${anexosMarcados.length})`} <ChevronDown size={13} className={clsx("transition", verAnexos && "rotate-180")} />
        </button>
        {verAnexos && grupos.map(grupo => (
          <div key={grupo} className="mt-1">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{grupo}</p>
            <div className="grid gap-0.5 sm:grid-cols-2">
              {anexos.filter(i => (i.grupo ?? "") === grupo).map(i => <Casilla key={i.id} marcado={anexosMarcados.includes(i.nombre)} onCambio={() => setAnexos(m => alternar(m, i.nombre))}>{i.nombre}</Casilla>)}
            </div>
          </div>
        ))}
        <textarea value={otrosAnexos} onChange={e => setOtrosAnexos(e.target.value)} rows={2} placeholder="Otros anexos (uno por línea)" className="campo mt-2" />
      </div>
      <button disabled={pendiente} className="boton-primario" onClick={() => enviar({ documentos: marcados, otroDocumento, anexos: anexosMarcados, otrosAnexos })}>Entregar {version}</button>
    </div>
  )
}
