import Link from "next/link"
import clsx from "clsx"
import { CheckCircle2, XCircle, MinusCircle } from "lucide-react"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { radicado } from "@/src/lib/formato"

type Indicador = {
  codigo: string, nombre: string, regla: string, meta: number | null, sentido: "MIN" | "MAX" | "CERO"
  cumplen: number, total: number, porcentaje: number | null, cumple: boolean | null, fueraDeApp?: boolean
  incumplidos: { casoId: number, numeroInterno: string | null, radicado: string, detalle: string }[]
}

// Fechas de Bogotá para los atajos de periodo
const hoyBogota = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10)
const sumar = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
const atajos = () => {
  const hoy = hoyBogota()
  const inicioMes = `${hoy.slice(0, 8)}01`
  const finMesAnterior = sumar(inicioMes, -1)
  const lunes = sumar(hoy, -((new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7))
  return [
    { nombre: "Este mes", desde: inicioMes, hasta: hoy },
    { nombre: "Mes anterior", desde: `${finMesAnterior.slice(0, 8)}01`, hasta: finMesAnterior },
    { nombre: "Semana anterior", desde: sumar(lunes, -7), hasta: sumar(lunes, -1) },
    { nombre: "Esta semana", desde: lunes, hasta: hoy }
  ]
}

// Estado con ícono y texto: el color nunca va solo
function Estado({ i }: { i: Indicador }) {
  if (i.fueraDeApp) return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><MinusCircle size={14} /> Fuera de la app</span>
  if (i.cumple === null) return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><MinusCircle size={14} /> Sin datos</span>
  return i.cumple
    ? <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200"><CheckCircle2 size={14} /> Cumple</span>
    : <span className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-red-200"><XCircle size={14} /> No cumple</span>
}

// Medidor: el resultado sobre una pista de 0 a 100 % con la marca de la meta
function Medidor({ i }: { i: Indicador }) {
  if (i.porcentaje === null || i.sentido === "CERO") return null
  return (
    <div className="relative mt-2 h-2 rounded-r bg-slate-100" title={`${i.porcentaje} % (meta ${i.sentido === "MIN" ? "≥" : "≤"} ${i.meta} %)`}>
      <div className="h-2 rounded-r bg-slate-600" style={{ width: `${Math.min(100, i.porcentaje)}%` }} />
      {i.meta !== null && <div className="absolute -top-1 h-4 w-0.5 bg-slate-900" style={{ left: `${i.meta}%` }} />}
    </div>
  )
}

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<{ desde?: string, hasta?: string }> }) {
  await requiereRol("COORDINADOR", "REVISOR", "ASISTENTE")
  const f = await searchParams
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][])
  const { desde, hasta, indicadores } = await obtener<{ desde: string, hasta: string, indicadores: Indicador[] }>(`/seguimiento/ans?${query}`)
  const medidos = indicadores.filter(i => i.cumple !== null)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Indicadores ANS</h1>
          <p className="mt-1 text-xs text-slate-400">Del {desde} al {hasta} · {medidos.filter(i => i.cumple).length} de {medidos.length} cumplen</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          {atajos().map(a => (
            <Link key={a.nombre} href={`/indicadores?desde=${a.desde}&hasta=${a.hasta}`}
              className={clsx("rounded-md px-2.5 py-1.5 text-xs font-medium", a.desde === desde && a.hasta === hasta ? "bg-slate-800 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
              {a.nombre}
            </Link>
          ))}
          <input type="date" name="desde" defaultValue={desde} className="campo w-auto py-1.5 text-xs" />
          <input type="date" name="hasta" defaultValue={hasta} className="campo w-auto py-1.5 text-xs" />
          <button className="boton-secundario py-1.5 text-xs">Ver</button>
        </form>
      </div>

      <div className="tarjeta divide-y divide-slate-100">
        {indicadores.map(i => (
          <details key={i.codigo} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
              <span className="w-14 text-xs font-semibold text-slate-500">{i.codigo}</span>
              <span className="flex-1 min-w-[12rem] text-sm font-medium text-slate-800">{i.nombre}</span>
              <span className="w-64 text-right text-sm whitespace-nowrap">
                {i.fueraDeApp ? "—" : i.sentido === "CERO"
                  ? <><b className="text-slate-900">{i.total}</b> <span className="text-slate-500">{i.total === 1 ? "evento" : "eventos"} · meta 0</span></>
                  : i.porcentaje === null ? <span className="text-slate-400">—</span>
                    : <><b className="text-slate-900">{i.porcentaje} %</b> <span className="text-slate-500">({i.cumplen}/{i.total}) · meta {i.sentido === "MIN" ? "≥" : "≤"} {i.meta} %</span></>}
              </span>
              <span className="w-28 text-right"><Estado i={i} /></span>
            </summary>
            <div className="pl-[4.5rem] pr-2">
              <Medidor i={i} />
              <p className="mt-2 text-xs text-slate-500">{i.regla}</p>
              {i.incumplidos.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {i.incumplidos.map((x, n) => (
                    <li key={n} className="flex gap-2">
                      {x.casoId ? <Link href={`/casos/${x.casoId}`} className="enlace shrink-0">{x.numeroInterno ?? radicado(x.radicado)}</Link> : null}
                      <span className="text-slate-600">{x.detalle}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
