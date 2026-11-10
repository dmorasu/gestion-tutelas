import Link from "next/link"
import clsx from "clsx"
import { AlertTriangle, Archive, CheckCheck, Inbox, UserRound, type LucideIcon } from "lucide-react"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { BUZONES, ETAPAS, PROPOSITOS, fechaHora, radicado } from "@/src/lib/formato"
import Criticidad from "@/components/ui/Criticidad"
import BotonLeerBuzon from "./BotonLeerBuzon"

type CorreoFila = {
  id: number, buzon: string | null, remitente: string | null, nombreRemitente: string | null, asunto: string | null, fechaCorreo: string,
  etapaDetectada: string | null, criticidadDetectada: string | null, vencimientoDetectado: string | null, radicados: string[],
  estado: string, porRevisar: boolean, proposito: string | null, enlacesPendientes: number, responsable: string | null, notaTraslado: string | null,
  caso: { id: number, radicado: string, numeroInterno: string | null } | null, archivos: { id: number }[], deOtroOperador: boolean
}
type EstadoBuzon = {
  envio: string, porAtender: number, mios: number, asignacionesVencidas: number, minutosAlerta: number, cuotaGb: number
  buzones: { buzon: string, direccion: string, porcentaje: number | null, alerta: boolean, estado: { tamanoBytes: string | null, ultimoError: string | null } | null }[]
}

const PESTANAS: { clave: string, nombre: string, Icono: LucideIcon }[] = [
  { clave: "POR_ATENDER", nombre: "Por atender", Icono: Inbox },
  { clave: "MIOS", nombre: "Mis pendientes", Icono: UserRound },
  { clave: "ASOCIADO", nombre: "Asociados", Icono: CheckCheck },
  { clave: "DESCARTADO", nombre: "Descartados", Icono: Archive }
]

const gb = (bytes: string | null | undefined) => (bytes ? (Number(bytes) / 1024 ** 3).toFixed(1) : "—")

// Minutos que lleva esperando (se calcula al pintar la página)
const minutosEsperando = (fecha: string) => Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000))
const espera = (min: number) => (min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${Math.floor(min / 1440)} días`)

// Lo que le falta a cada correo para quedar atendido
function QueFalta({ c }: { c: CorreoFila }) {
  const chips: { texto: string, clase: string }[] = []
  if (c.estado === "POR_REGISTRAR") chips.push({ texto: c.caso ? "Registrar etapa o asociar" : "Registrar o asociar", clase: "bg-slate-800 text-white" })
  if (c.porRevisar) chips.push({ texto: `Clasificar: ${(PROPOSITOS[c.proposito ?? ""] ?? "respuesta").toLowerCase()}`, clase: "bg-amber-100 text-amber-800" })
  if (c.enlacesPendientes) chips.push({ texto: `${c.enlacesPendientes} enlace(s) por traer`, clase: "bg-sky-100 text-sky-800" })
  if (!chips.length) return <span className="text-xs text-slate-400">—</span>
  return <div className="flex flex-wrap gap-1">{chips.map(ch => <span key={ch.texto} className={clsx("rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", ch.clase)}>{ch.texto}</span>)}</div>
}

export default async function CorreosPage({ searchParams }: { searchParams: Promise<{ etapa?: string, estado?: string, buzon?: string, pagina?: string }> }) {
  await requiereRol("ASISTENTE", "COORDINADOR")
  const filtros = await searchParams
  const estado = filtros.estado ?? "POR_ATENDER"
  const query = new URLSearchParams(Object.entries({ ...filtros, estado }).filter(([, v]) => v) as [string, string][])
  const [{ correos, total }, b] = await Promise.all([
    obtener<{ correos: CorreoFila[], total: number }>(`/correos?${query}`),
    obtener<EstadoBuzon>("/correos/estado-buzon")
  ])
  const trabajo = estado === "POR_ATENDER" || estado === "MIOS"
  const enlace = (cambios: Record<string, string>) => `/correos?${new URLSearchParams({ ...Object.fromEntries(query), ...cambios, pagina: "1" })}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Correos</h1>
          <p className="mt-1 text-xs text-slate-400">
            {b.porAtender} por atender · {b.mios} a su nombre
            {b.envio === "SIMULADO" && <span className="text-amber-700"> · Envío simulado: los correos de salida no salen</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonLeerBuzon />
          <Link href="/casos/nuevo" className="boton-secundario">Asignación manual o en paquete</Link>
        </div>
      </div>

      {b.asignacionesVencidas > 0 && (
        <Link href={enlace({ estado: "POR_ATENDER", buzon: "ASIGNACIONES" })} className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 hover:bg-red-100">
          <AlertTriangle size={18} className="shrink-0" />
          <span><b>{b.asignacionesVencidas} asignación(es)</b> llevan más de {b.minutosAlerta} minutos sin registrar. Al coordinador le llega un aviso por correo.</span>
        </Link>
      )}

      {b.buzones.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {b.buzones.map(x => (
            <div key={x.buzon} className={`tarjeta px-4 py-3 ${x.alerta ? "ring-1 ring-amber-300" : ""}`}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700">{BUZONES[x.buzon]}</span>
                <span className={x.alerta ? "text-amber-700 font-semibold" : "text-slate-500"}>
                  {x.porcentaje === null ? "Sin medir" : `${gb(x.estado?.tamanoBytes)} de ${b.cuotaGb} GB · ${x.porcentaje}%`}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full ${x.alerta ? "bg-amber-500" : "bg-slate-600"}`} style={{ width: `${Math.min(100, x.porcentaje ?? 0)}%` }} />
              </div>
              <p className="mt-1 truncate text-[11px] text-slate-400" title={x.direccion}>{x.direccion}{x.estado?.ultimoError && <span className="text-red-600"> · error en la última lectura</span>}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {PESTANAS.map(({ clave, nombre, Icono }) => (
            <Link key={clave} href={`/correos?estado=${clave}`} className={clsx("inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition",
              estado === clave ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700")}>
              <Icono size={15} /> {nombre}
              {clave === "POR_ATENDER" && b.porAtender > 0 && <span className="rounded-full bg-slate-200 px-1.5 py-px text-[10px] text-slate-700">{b.porAtender}</span>}
              {clave === "MIOS" && b.mios > 0 && <span className="rounded-full bg-sky-100 px-1.5 py-px text-[10px] text-sky-700">{b.mios}</span>}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap gap-2">
          <input type="hidden" name="estado" value={estado} />
          <select name="buzon" defaultValue={filtros.buzon ?? ""} className="campo w-auto py-1.5 text-xs">
            <option value="">Todos los buzones</option>
            {Object.entries(BUZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="etapa" defaultValue={filtros.etapa ?? ""} className="campo w-auto py-1.5 text-xs">
            <option value="">Todas las etapas</option>
            {Object.entries(ETAPAS).filter(([k]) => k !== "PQRS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="boton-secundario py-1.5 text-xs">Filtrar</button>
        </form>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla w-full">
          <thead>
            <tr><th>Llegó</th>{trabajo && <th>Espera</th>}<th>Buzón</th>{trabajo && <th>Qué falta</th>}<th>Asunto</th><th>Radicado</th><th>Quién lo atiende</th></tr>
          </thead>
          <tbody>
            {correos.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-500">{trabajo ? "Todo atendido." : "No hay correos."}</td></tr>}
            {correos.map(c => {
              const min = minutosEsperando(c.fechaCorreo)
              const vencida = c.buzon === "ASIGNACIONES" && c.estado === "POR_REGISTRAR" && min > b.minutosAlerta
              return (
                <tr key={c.id} className={clsx("hover:bg-slate-50", vencida && "bg-red-50/60")}>
                  <td className="whitespace-nowrap text-xs">{fechaHora(c.fechaCorreo)}</td>
                  {trabajo && <td className={clsx("whitespace-nowrap text-xs", vencida ? "font-semibold text-red-700" : "text-slate-500")}>{espera(min)}</td>}
                  <td className="whitespace-nowrap text-xs">
                    {c.buzon ? BUZONES[c.buzon] : "—"}
                    {c.etapaDetectada && <p className="text-slate-500">{ETAPAS[c.etapaDetectada]}</p>}
                    {c.criticidadDetectada && <div className="mt-0.5"><Criticidad valor={c.criticidadDetectada} /></div>}
                  </td>
                  {trabajo && <td><QueFalta c={c} /></td>}
                  <td className="max-w-[22rem]">
                    <Link href={`/correos/${c.id}`} className="enlace line-clamp-2">{c.asunto || "(sin asunto)"}</Link>
                    <p className="truncate text-[11px] text-slate-400" title={c.remitente ?? ""}>{c.nombreRemitente || c.remitente}{c.archivos.length > 0 && ` · ${c.archivos.length} adjunto(s)`}</p>
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {c.radicados.length ? radicado(c.radicados[0]) : <span className="text-slate-400">—</span>}
                    {c.radicados.length > 1 && <span className="text-slate-500"> +{c.radicados.length - 1}</span>}
                    {c.caso && <p className="text-emerald-700">Caso {c.caso.numeroInterno ?? "existente"}</p>}
                    {c.deOtroOperador && <p className="text-red-700 font-medium">De otro operador</p>}
                  </td>
                  <td className="text-xs">
                    {c.responsable ? <span className="font-medium text-slate-700">{c.responsable}</span> : trabajo ? <span className="font-semibold text-amber-700">Nadie</span> : "—"}
                    {c.notaTraslado && <p className="max-w-[12rem] truncate text-[11px] text-slate-500" title={c.notaTraslado}>{c.notaTraslado}</p>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {total > 50 && <p className="text-right text-xs text-slate-500">{total} correos; se muestran los primeros 50</p>}
    </div>
  )
}
