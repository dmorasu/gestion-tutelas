"use client"

import { useMemo, useState } from "react"
import clsx from "clsx"
import {
  Bell, CalendarClock, FileText, FileUp, Flag, History, Inbox, Landmark, MailOpen, PencilLine, Send, Sparkles, Undo2, UserCog,
  type LucideIcon
} from "lucide-react"

export type EventoCaso = {
  clave: string, fecha: string, tipo: string, titulo: string, detalle: string | null
  cambios: { campo: string, antes: string | null, despues: string | null }[]
  usuario: string | null, origen: string | null, etapa: string | null
}

// Mismo diseño que el historial de trámites de Nodex: un ícono de color por tipo de evento
const ESTILO_TIPO: Record<string, { Icono: LucideIcon, color: string }> = {
  CREADO: { Icono: Sparkles, color: "bg-sky-100 text-sky-600" },
  ESTADO: { Icono: Flag, color: "bg-violet-100 text-violet-600" },
  ASIGNACION: { Icono: UserCog, color: "bg-indigo-100 text-indigo-600" },
  PLAZOS: { Icono: CalendarClock, color: "bg-sky-100 text-sky-600" },
  INSUMO: { Icono: Inbox, color: "bg-amber-100 text-amber-700" },
  ESCRITO: { Icono: FileText, color: "bg-emerald-100 text-emerald-700" },
  DEVOLUCION: { Icono: Undo2, color: "bg-red-100 text-red-600" },
  RADICACION: { Icono: Landmark, color: "bg-emerald-100 text-emerald-700" },
  CORREO_SALIDA: { Icono: Send, color: "bg-slate-200 text-slate-700" },
  CORREO_ENTRADA: { Icono: MailOpen, color: "bg-teal-100 text-teal-700" },
  DOCUMENTO: { Icono: FileUp, color: "bg-teal-100 text-teal-700" },
  ALERTA: { Icono: Bell, color: "bg-red-100 text-red-600" },
  DATOS: { Icono: PencilLine, color: "bg-slate-100 text-slate-600" }
}

const FILTROS: { clave: string, nombre: string, tipos: string[] | null }[] = [
  { clave: "todo", nombre: "Todo", tipos: null },
  { clave: "estados", nombre: "Estados", tipos: ["CREADO", "ESTADO", "RADICACION"] },
  { clave: "escritos", nombre: "Escritos y devoluciones", tipos: ["ESCRITO", "DEVOLUCION"] },
  { clave: "insumos", nombre: "Insumos", tipos: ["INSUMO"] },
  { clave: "correos", nombre: "Correos", tipos: ["CORREO_SALIDA", "CORREO_ENTRADA"] },
  { clave: "documentos", nombre: "Documentos", tipos: ["DOCUMENTO"] },
  { clave: "asignacion", nombre: "Asignaciones y plazos", tipos: ["ASIGNACION", "PLAZOS"] },
  { clave: "alertas", nombre: "Alertas", tipos: ["ALERTA"] },
  { clave: "datos", nombre: "Datos", tipos: ["DATOS"] }
]

const ORIGEN: Record<string, string> = { BUZON: "Buzón", CARGUE: "Cargue", SISTEMA: "Automático" }

const dia = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric" })
const hora = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" })
const claveDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" })

export default function HistorialCaso({ eventos }: { eventos: EventoCaso[] | null }) {
  const [filtro, setFiltro] = useState("todo")

  const porDia = useMemo(() => {
    const tipos = FILTROS.find(f => f.clave === filtro)?.tipos
    const grupos = new Map<string, EventoCaso[]>()
    for (const evento of eventos ?? []) {
      if (tipos && !tipos.includes(evento.tipo)) continue
      const clave = claveDia.format(new Date(evento.fecha))
      grupos.set(clave, [...(grupos.get(clave) ?? []), evento])
    }
    return [...grupos.values()]
  }, [eventos, filtro])

  if (eventos === null) return <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">No se pudo cargar el historial del caso.</p>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map(f => (
          <button key={f.clave} type="button" onClick={() => setFiltro(f.clave)}
            className={clsx("rounded-full border px-3 py-1 text-[11px] font-medium transition",
              filtro === f.clave ? "border-slate-300 bg-slate-100 text-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-50")}>
            {f.nombre}
          </button>
        ))}
      </div>

      {porDia.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
          <History size={30} className="mx-auto mb-2 text-slate-300" />
          <p className="text-xs font-medium text-slate-500">Sin movimientos</p>
        </div>
      ) : porDia.map(grupo => (
        <section key={grupo[0].clave}>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{dia.format(new Date(grupo[0].fecha))}</h3>
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {grupo.map(evento => {
              const { Icono, color } = ESTILO_TIPO[evento.tipo] ?? ESTILO_TIPO.DATOS
              const origen = evento.origen ? ORIGEN[evento.origen] : null
              return (
                <li key={evento.clave} className="relative">
                  <span className={clsx("absolute -left-[37px] top-0 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white", color)} aria-hidden="true">
                    <Icono size={13} />
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="text-xs font-semibold text-slate-700">{evento.titulo}</p>
                    {evento.etapa && <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-600">{evento.etapa}</span>}
                    {origen && <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] text-slate-500">{origen}</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{evento.usuario || "Sistema"} · {hora.format(new Date(evento.fecha))}</p>
                  {evento.detalle && <p className="mt-1.5 whitespace-pre-line text-xs leading-5 text-slate-600 [overflow-wrap:anywhere]">{evento.detalle}</p>}
                  {evento.cambios.length > 0 && (
                    <dl className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2">
                      {evento.cambios.map(cambio => (
                        <div key={cambio.campo} className="grid gap-x-3 text-[11px] sm:grid-cols-[150px_1fr]">
                          <dt className="text-slate-500">{cambio.campo}</dt>
                          <dd className="text-slate-700 [overflow-wrap:anywhere]">
                            {cambio.antes !== null && (
                              <><span className="text-slate-400 line-through">{cambio.antes}</span><span className="mx-1.5 text-slate-300">→</span></>
                            )}
                            {cambio.despues ?? <span className="italic text-slate-400">vacío</span>}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
