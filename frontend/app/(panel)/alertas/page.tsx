import Link from "next/link"
import clsx from "clsx"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { tieneRol } from "@/src/auth/permisos"
import FilaAlerta, { type AlertaFila } from "./FilaAlerta"
import BotonDetectar from "./BotonDetectar"

const ESTADOS: Record<string, string> = { PENDIENTE: "Por emitir", EMITIDA: "Emitidas", DESCARTADA: "Descartadas", TODAS: "Todas" }

export default async function AlertasPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const sesion = await requiereRol("COORDINADOR", "REVISOR", "ASISTENTE")
  const estado = (await searchParams).estado ?? "PENDIENTE"
  const { alertas, nombres } = await obtener<{ alertas: AlertaFila[], nombres: Record<string, string> }>(`/seguimiento/alertas?estado=${estado}`)
  const puedeEmitir = tieneRol(sesion.roles, ["COORDINADOR"])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Alertas</h1>
          <p className="mt-1 text-xs text-slate-400">{alertas.length} {ESTADOS[estado]?.toLowerCase()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(ESTADOS).map(([k, v]) => (
            <Link key={k} href={`/alertas?estado=${k}`} className={clsx("rounded-md px-2.5 py-1.5 text-xs font-medium", k === estado ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{v}</Link>
          ))}
          <BotonDetectar />
        </div>
      </div>
      <ul className="tarjeta divide-y divide-slate-100">
        {alertas.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">No hay alertas.</li>}
        {alertas.map(a => <FilaAlerta key={a.id} a={a} nombre={nombres[a.tipo] ?? a.tipo} puedeEmitir={puedeEmitir} />)}
      </ul>
    </div>
  )
}
