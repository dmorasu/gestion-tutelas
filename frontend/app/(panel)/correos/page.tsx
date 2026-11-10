import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { BUZONES, ETAPAS, PROPOSITOS, fechaHora, radicado, tiempoRestante } from "@/src/lib/formato"
import Criticidad from "@/components/ui/Criticidad"
import BotonLeerBuzon from "./BotonLeerBuzon"

type CorreoFila = {
  id: number, buzon: string | null, remitente: string | null, nombreRemitente: string | null, asunto: string | null, fechaCorreo: string,
  etapaDetectada: string | null, criticidadDetectada: string | null, vencimientoDetectado: string | null, radicados: string[],
  proposito: string | null, caso: { id: number, radicado: string, numeroInterno: string | null } | null,
  archivos: { id: number }[], deOtroOperador: boolean
}
type EstadoBuzon = {
  envio: string, porRegistrar: number, porRevisar: number, cuotaGb: number
  buzones: { buzon: string, direccion: string, porcentaje: number | null, alerta: boolean, estado: { tamanoBytes: string | null, ultimoError: string | null } | null }[]
}

const gb = (bytes: string | null | undefined) => (bytes ? (Number(bytes) / 1024 ** 3).toFixed(1) : "—")

const TITULOS: Record<string, string> = {
  POR_REGISTRAR: "Correos por registrar",
  POR_REVISAR: "Respuestas por revisar",
  ASOCIADO: "Correos asociados",
  DESCARTADO: "Correos descartados"
}

export default async function CorreosPage({ searchParams }: { searchParams: Promise<{ etapa?: string, estado?: string, buzon?: string, pagina?: string }> }) {
  await requiereRol("ASISTENTE", "COORDINADOR")
  const filtros = await searchParams
  const query = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][])
  const [{ correos, total }, estadoBuzon] = await Promise.all([
    obtener<{ correos: CorreoFila[], total: number }>(`/correos?${query}`),
    obtener<EstadoBuzon>("/correos/estado-buzon")
  ])
  const estado = filtros.estado ?? "POR_REGISTRAR"
  const pendientes = estado === "POR_REGISTRAR" || estado === "POR_REVISAR"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">{TITULOS[estado] ?? "Correos"}</h1>
          <p className="mt-1 text-xs text-slate-400">
            {total} correos · {estadoBuzon.porRegistrar} por registrar · {estadoBuzon.porRevisar} por revisar
            {estadoBuzon.envio === "SIMULADO" && <span className="text-amber-700"> · Envío simulado: los correos de salida no salen</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <form className="flex flex-wrap gap-2">
            <select name="estado" defaultValue={estado} className="campo w-auto">
              {Object.entries(TITULOS).map(([k, v]) => <option key={k} value={k}>{v.replace("Correos ", "").replace("Respuestas ", "")}</option>)}
            </select>
            <select name="buzon" defaultValue={filtros.buzon ?? ""} className="campo w-auto">
              <option value="">Todos los buzones</option>
              {Object.entries(BUZONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select name="etapa" defaultValue={filtros.etapa ?? ""} className="campo w-auto">
              <option value="">Todas las etapas</option>
              {Object.entries(ETAPAS).filter(([k]) => k !== "PQRS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="boton-secundario">Filtrar</button>
          </form>
          <BotonLeerBuzon />
          <Link href="/casos/nuevo" className="boton-secundario">Asignación manual o Excel</Link>
        </div>
      </div>

      {estadoBuzon.buzones.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {estadoBuzon.buzones.map(b => (
            <div key={b.buzon} className={`tarjeta px-4 py-3 ${b.alerta ? "ring-1 ring-amber-300" : ""}`}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-700">{BUZONES[b.buzon]}</span>
                <span className={b.alerta ? "text-amber-700 font-semibold" : "text-slate-500"}>
                  {b.porcentaje === null ? "Sin medir" : `${gb(b.estado?.tamanoBytes)} de ${estadoBuzon.cuotaGb} GB · ${b.porcentaje}%`}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full ${b.alerta ? "bg-amber-500" : "bg-slate-600"}`} style={{ width: `${Math.min(100, b.porcentaje ?? 0)}%` }} />
              </div>
              <p className="mt-1 truncate text-[11px] text-slate-400" title={b.direccion}>{b.direccion}{b.estado?.ultimoError && <span className="text-red-600"> · error en la última lectura</span>}</p>
            </div>
          ))}
        </div>
      )}

      <div className="tarjeta overflow-x-auto">
        <table className="tabla w-full">
          <thead>
            <tr><th>Llegó</th>{pendientes && <th>Espera</th>}<th>Buzón</th><th>Etapa</th><th>Vence</th><th>Remitente</th><th>Asunto</th><th>Radicado</th><th>Adj.</th></tr>
          </thead>
          <tbody>
            {correos.length === 0 && <tr><td colSpan={9} className="text-center text-slate-500 py-8">No hay correos.</td></tr>}
            {correos.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap">{fechaHora(c.fechaCorreo)}</td>
                {pendientes && <td className="whitespace-nowrap text-xs text-slate-500">{tiempoRestante(c.fechaCorreo).replace("Vencido hace ", "")}</td>}
                <td className="whitespace-nowrap">
                  {c.buzon ? BUZONES[c.buzon] : "—"}
                  {c.proposito && c.proposito !== "SEGUIMIENTO" && <p className="text-xs text-slate-500">{PROPOSITOS[c.proposito] ?? c.proposito}</p>}
                </td>
                <td className="whitespace-nowrap">
                  {c.etapaDetectada ? ETAPAS[c.etapaDetectada] : c.buzon === "ASIGNACIONES" ? <span className="text-amber-700">Sin etapa</span> : "—"}
                  {c.criticidadDetectada && <div className="mt-0.5"><Criticidad valor={c.criticidadDetectada} /></div>}
                </td>
                <td className="whitespace-nowrap text-xs">{c.vencimientoDetectado ? fechaHora(c.vencimientoDetectado) : "—"}</td>
                <td className="max-w-[12rem] truncate" title={c.remitente ?? ""}>{c.nombreRemitente || c.remitente}</td>
                <td className="max-w-[22rem]">
                  <Link href={`/correos/${c.id}`} className="enlace line-clamp-2">{c.asunto || "(sin asunto)"}</Link>
                </td>
                <td className="whitespace-nowrap text-xs">
                  {c.radicados.length ? radicado(c.radicados[0]) : <span className="text-amber-700">No encontrado</span>}
                  {c.radicados.length > 1 && <span className="text-slate-500"> +{c.radicados.length - 1}</span>}
                  {c.caso && <p className="text-emerald-700">Caso {c.caso.numeroInterno ?? "existente"}</p>}
                  {c.deOtroOperador && <p className="text-red-700 font-medium">De otro operador</p>}
                </td>
                <td>{c.archivos.length || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
