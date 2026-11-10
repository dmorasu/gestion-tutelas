import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Flame, Inbox, PackageCheck, RotateCcw, Bell, Gavel, XCircle, type LucideIcon } from "lucide-react"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { fechaHora } from "@/src/lib/formato"
import Semaforo from "@/components/ui/Semaforo"
import GraficoDiario, { type DiaTablero } from "./GraficoDiario"

// =====================================
// TABLERO DE LA OPERACIÓN (D28): las mismas vistas que lee Power BI (esquema "tablero").
// Lo ve la firma y el perfil de consulta del cliente; los descuentos (D29) solo la firma
// =====================================

type Ans = { codigo: string, nombre: string, sentido: string | null, meta: number | null, cumplen: number, total: number, porcentaje: number | null, cumple: boolean | null, fuera_de_app: boolean }
type Datos = {
  generado: string, mes: string
  kpis: Record<string, number>
  porEtapa: { etapa: string, etapa_nombre: string, abiertas: number, vencidas: number }[]
  semaforo: { semaforo: string, total: number }[]
  porEquipo: { equipo: string, abiertas: number, vencidas: number, rojas: number }[]
  diario: DiaTablero[]
  ans: Ans[]
  interno: null | {
    descuentos: { codigo: string, nombre: string, porcentaje: number | null, meta: number | null, nivel: string, descuento: number }[]
    total: { suma: number, aplicado: number, topado: boolean, valor: number | null }
    reincidencia: string[]
    sinRemuneracion: { decision_id: number, caso_id: number, numero_interno: string | null, radicado: string, instancia: string, sentido: string }[]
  }
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
const ORDEN_SEMAFORO = ["VENCIDO", "ROJO", "AMARILLO", "VERDE", "SIN_FECHA"]
const NIVELES: Record<string, string> = { LEVE: "Leve", MODERADO: "Moderado", GRAVE: "Grave" }
const pesos = (n: number) => n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })

// El resultado de un ANS con su estado: ícono y texto, nunca solo el color
function EstadoAns({ a }: { a: Ans }) {
  if (a.fuera_de_app) return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><CircleDashed size={13} />Fuera de la app</span>
  if (a.cumple === null) return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><CircleDashed size={13} />Sin casos</span>
  return a.cumple
    ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={13} />Cumple</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700"><XCircle size={13} />No cumple</span>
}

export default async function TableroPage() {
  await requiereRol("COORDINADOR", "ASISTENTE", "REVISOR", "CONSULTA")
  const t = await obtener<Datos>("/tablero")
  const k = t.kpis
  const aTiempo = k.primeras_mes ? Math.round((k.primeras_mes_a_tiempo / k.primeras_mes) * 1000) / 10 : null
  const maxEtapa = Math.max(1, ...t.porEtapa.map(e => e.abiertas))
  const semaforo = ORDEN_SEMAFORO.map(s => ({ s, total: t.semaforo.find(x => x.semaforo === s)?.total ?? 0 }))
  const totalAbiertas = semaforo.reduce((a, b) => a + b.total, 0)

  const tiles: { nombre: string, valor: string, Icono: LucideIcon, alerta?: boolean }[] = [
    { nombre: "Abiertas", valor: String(k.abiertas), Icono: Inbox },
    { nombre: "Asignadas hoy", valor: String(k.asignadas_hoy), Icono: Clock },
    { nombre: "Críticas", valor: String(k.criticas), Icono: Flame, alerta: k.criticas > 0 },
    { nombre: "Vencidas", valor: String(k.vencidas), Icono: AlertTriangle, alerta: k.vencidas > 0 },
    { nombre: "Primeras entregas del mes", valor: String(k.primeras_mes), Icono: PackageCheck },
    { nombre: "A tiempo en el mes", valor: aTiempo === null ? "—" : `${aTiempo.toLocaleString("es-CO")} %`, Icono: CheckCircle2 },
    { nombre: "Devoluciones de fondo", valor: String(k.devoluciones_fondo_mes), Icono: RotateCcw, alerta: k.devoluciones_fondo_mes > 0 },
    { nombre: "Cumplimientos pendientes", valor: String(k.cumplimientos_pendientes), Icono: Gavel, alerta: k.cumplimientos_pendientes > 0 }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="titulo-pagina">Tablero de la operación</h1>
        <p className="text-xs text-slate-400">Actualizado {fechaHora(t.generado)}</p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ nombre, valor, Icono, alerta }) => (
          <div key={nombre} className="tarjeta px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <Icono size={13} className={alerta ? "text-red-600" : "text-slate-400"} />{nombre}
            </p>
            <p className={`mt-1 text-2xl font-semibold ${alerta ? "text-red-700" : "text-slate-900"}`}>{valor}</p>
          </div>
        ))}
      </section>

      <section className="tarjeta p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Asignaciones y primeras entregas · últimos 30 días</h2>
        <GraficoDiario dias={t.diario} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tarjeta p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Abiertas por etapa</h2>
          {t.porEtapa.length === 0 ? <p className="text-sm text-slate-500">No hay actuaciones abiertas.</p> : (
            <ul className="space-y-3">
              {t.porEtapa.map(e => (
                <li key={e.etapa} title={`${e.etapa_nombre}: ${e.abiertas} abiertas, ${e.vencidas} vencidas`}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-800">{e.etapa_nombre}</span>
                    <span className="text-xs text-slate-500"><b className="text-slate-900">{e.abiertas}</b>{e.vencidas > 0 && <> · <span className="font-semibold text-red-700">{e.vencidas} vencidas</span></>}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-r bg-slate-100">
                    <div className="h-2 rounded-r bg-slate-600" style={{ width: `${(e.abiertas / maxEtapa) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Semáforo de lo abierto</h2>
          <ul className="space-y-2.5">
            {semaforo.map(({ s, total }) => (
              <li key={s} className="flex items-center justify-between gap-3 text-sm">
                <Semaforo valor={s} />
                <span className="text-slate-500"><b className="text-slate-900">{total}</b>{totalAbiertas > 0 && ` · ${Math.round((total / totalAbiertas) * 100)} %`}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="tarjeta p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Acuerdos de servicio · {nombreMes(t.mes)}</h2>
        <div className="overflow-x-auto">
          <table className="tabla w-full">
            <thead><tr><th>ANS</th><th>Indicador</th><th className="text-right">Resultado</th><th className="text-right">Meta</th><th className="text-right">Casos</th><th>Estado</th></tr></thead>
            <tbody>
              {t.ans.map(a => (
                <tr key={a.codigo}>
                  <td className="whitespace-nowrap font-mono text-xs">{a.codigo}</td>
                  <td>{a.nombre}</td>
                  <td className="text-right font-semibold">{a.porcentaje === null ? "—" : `${a.porcentaje.toLocaleString("es-CO")} %`}</td>
                  <td className="text-right text-slate-500">{a.meta === null ? "—" : `${a.sentido === "MAX" ? "≤" : a.sentido === "CERO" ? "" : "≥"} ${a.meta} ${a.sentido === "CERO" ? "casos" : "%"}`}</td>
                  <td className="text-right text-slate-500">{a.total}</td>
                  <td><EstadoAns a={a} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="tarjeta p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Por equipo</h2>
        {t.porEquipo.length === 0 ? <p className="text-sm text-slate-500">Sin actuaciones abiertas.</p> : (
          <table className="tabla w-full">
            <thead><tr><th>Equipo</th><th className="text-right">Abiertas</th><th className="text-right">Urgentes</th><th className="text-right">Vencidas</th></tr></thead>
            <tbody>
              {t.porEquipo.map(e => (
                <tr key={e.equipo}>
                  <td>{e.equipo}</td>
                  <td className="text-right font-semibold">{e.abiertas}</td>
                  <td className={`text-right ${e.rojas ? "text-red-700" : ""}`}>{e.rojas}</td>
                  <td className={`text-right ${e.vencidas ? "font-semibold text-red-700" : ""}`}>{e.vencidas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* D29: solo la firma. El cliente (perfil de consulta) no recibe estos datos */}
      {t.interno && (
        <section className="tarjeta border-amber-200 p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><Bell size={15} className="text-amber-600" />Descuentos del mes (interno)</h2>
          {t.interno.reincidencia.length > 0 && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              Incumplimiento grave tres meses seguidos en {t.interno.reincidencia.join(", ")}: con requerimiento del supervisor y plan de mejora no cumplido, es incumplimiento reiterado.
            </p>
          )}
          {t.interno.descuentos.length === 0 ? <p className="text-sm text-slate-500">Sin descuentos en el mes.</p> : (
            <table className="tabla w-full">
              <thead><tr><th>ANS</th><th>Indicador</th><th className="text-right">Resultado</th><th className="text-right">Meta</th><th>Nivel</th><th className="text-right">Descuento</th></tr></thead>
              <tbody>
                {t.interno.descuentos.map(x => (
                  <tr key={x.codigo}>
                    <td className="whitespace-nowrap font-mono text-xs">{x.codigo}</td>
                    <td>{x.nombre}</td>
                    <td className="text-right">{x.porcentaje === null ? "—" : `${x.porcentaje.toLocaleString("es-CO")} %`}</td>
                    <td className="text-right text-slate-500">{x.meta ?? "—"}</td>
                    <td>{NIVELES[x.nivel] ?? x.nivel}</td>
                    <td className="text-right font-semibold">{x.descuento.toLocaleString("es-CO")} %</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} className="text-right font-semibold">Total del mes{t.interno.total.topado && " (con tope)"}</td>
                  <td className="text-right font-semibold">
                    {t.interno.total.aplicado.toLocaleString("es-CO")} %{t.interno.total.valor !== null && <span className="block text-xs font-normal text-slate-500">{pesos(t.interno.total.valor)}</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          {t.interno.sinRemuneracion.length > 0 && (
            <div className="mt-4">
              <p className="etiqueta">Casos sin remuneración por sanción atribuible</p>
              <ul className="text-sm">
                {t.interno.sinRemuneracion.map(c => <li key={c.decision_id}><a href={`/casos/${c.caso_id}`} className="enlace">{c.numero_interno ?? c.radicado}</a></li>)}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
