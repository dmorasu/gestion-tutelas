import Link from "next/link"
import clsx from "clsx"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { tieneRol } from "@/src/auth/permisos"
import { dia } from "@/src/lib/formato"
import FilaAlerta, { type AlertaFila } from "./FilaAlerta"
import BotonDetectar from "./BotonDetectar"
import Cortes, { BotonCorte, type CorteFila } from "./Cortes"

const ESTADOS: Record<string, string> = { PENDIENTE: "Por emitir", EMITIDA: "Emitidas", DESCARTADA: "Descartadas", TODAS: "Todas", CORTES: "Cortes" }

type DatosCortes = { cortes: CorteFila[], proximo: { dia: string, hora: string } | null, destinatarios: string[] }

export default async function AlertasPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const sesion = await requiereRol("COORDINADOR", "REVISOR", "ASISTENTE")
  const estado = (await searchParams).estado ?? "PENDIENTE"
  const verCortes = estado === "CORTES"
  const [lista, datosCortes] = await Promise.all([
    verCortes ? null : obtener<{ alertas: AlertaFila[], nombres: Record<string, string> }>(`/seguimiento/alertas?estado=${estado}`),
    obtener<DatosCortes>("/seguimiento/alertas/cortes")
  ])
  // Reunión 18-nov: los asistentes revisan los cortes y envían o reenvían lo que lo amerite
  const puedeEmitir = tieneRol(sesion.roles, ["COORDINADOR", "ASISTENTE"])
  const { proximo, destinatarios } = datosCortes
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Alertas</h1>
          <p className="mt-1 text-xs text-slate-400">
            {verCortes ? `${datosCortes.cortes.length} cortes` : `${lista!.alertas.length} ${ESTADOS[estado]?.toLowerCase()}`}
            {" · "}
            {proximo ? `próximo corte ${proximo.dia === hoy ? "hoy" : dia(proximo.dia)} a las ${proximo.hora}` : "envío automático apagado"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(ESTADOS).map(([k, v]) => (
            <Link key={k} href={`/alertas?estado=${k}`} className={clsx("rounded-md px-2.5 py-1.5 text-xs font-medium", k === estado ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{v}</Link>
          ))}
          <BotonDetectar />
          {puedeEmitir && <BotonCorte />}
        </div>
      </div>
      {destinatarios.length === 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
          Falta a quién enviar las alertas: configure CORREOS_ALERTAS en <Link href="/parametros" className="font-semibold underline">Parámetros</Link>.
        </p>
      )}
      {verCortes
        ? <Cortes cortes={datosCortes.cortes} puedeEmitir={puedeEmitir} />
        : (
          <ul className="tarjeta divide-y divide-slate-100">
            {lista!.alertas.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">No hay alertas.</li>}
            {lista!.alertas.map(a => <FilaAlerta key={a.id} a={a} nombre={lista!.nombres[a.tipo] ?? a.tipo} puedeEmitir={puedeEmitir} />)}
          </ul>
        )}
    </div>
  )
}
