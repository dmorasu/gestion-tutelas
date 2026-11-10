import Link from "next/link"
import { AlertTriangle, Clock, Flame, Inbox, PackageCheck, Copy, UserX, Bell } from "lucide-react"
import { obtener } from "@/src/lib/api"
import { obtenerSesion } from "@/src/auth/dal"
import { tieneRol } from "@/src/auth/permisos"
import { ESTADOS_ACTUACION, ETAPAS } from "@/src/lib/formato"

type Carga = { abiertas: number, criticas: number, vencidas: number, entregadasSemana: number }
type Tablero = {
  totales: { abiertas: number, asignadasHoy: number, criticas: number, vencidas: number, pendientesInsumos: number, duplicados: number, entregadasSemana: number, sinAsignar: number }
  porEstado: Record<string, number>
  matriz: { etapa: string, estados: Record<string, number> }[]
  personas: ({ id: number, nombre: string, equipo: string | null } & Carga)[]
  porEquipo: ({ id: number, nombre: string } & Carga)[]
  alertasPendientes: number
}

// Rampa de un solo tono (grafito), de menos a más: la matriz compara magnitudes
const RAMPA = ["bg-white text-slate-300", "bg-slate-100 text-slate-700", "bg-slate-200 text-slate-800", "bg-slate-300 text-slate-900", "bg-slate-600 text-white", "bg-slate-800 text-white"]
const tono = (n: number, max: number) => (n === 0 ? RAMPA[0] : RAMPA[Math.min(5, 1 + Math.floor((n / Math.max(max, 1)) * 4.999))])

// Las columnas siguen el orden del flujo; no se muestran cerradas
const ESTADOS = Object.keys(ESTADOS_ACTUACION).filter(e => e !== "CERRADA")

export default async function SeguimientoPage() {
  const sesion = await obtenerSesion()
  const t = await obtener<Tablero>("/seguimiento/tablero")
  const veTodo = tieneRol(sesion.roles, ["COORDINADOR", "ASISTENTE"])
  const esRevisor = tieneRol(sesion.roles, ["REVISOR"])
  const alcance = veTodo ? "Toda la operación" : esRevisor ? "Su equipo y lo que revisa" : "Sus casos"
  const maxCelda = Math.max(0, ...t.matriz.flatMap(f => Object.values(f.estados)))
  const maxPersona = Math.max(1, ...t.personas.map(p => p.abiertas))
  const filas = t.matriz.filter(f => Object.values(f.estados).some(Boolean))

  const tiles: { nombre: string, valor: number, Icono: typeof Inbox, href: string, alerta?: boolean }[] = [
    { nombre: "Abiertas", valor: t.totales.abiertas, Icono: Inbox, href: "/casos" },
    { nombre: "Asignadas hoy", valor: t.totales.asignadasHoy, Icono: Clock, href: "/casos" },
    { nombre: "Críticas", valor: t.totales.criticas, Icono: Flame, href: "/casos?criticidad=CRITICO", alerta: t.totales.criticas > 0 },
    { nombre: "Vencidas sin entregar", valor: t.totales.vencidas, Icono: AlertTriangle, href: "/casos?semaforo=VENCIDO", alerta: t.totales.vencidas > 0 },
    { nombre: "Esperando insumos", valor: t.totales.pendientesInsumos, Icono: Clock, href: "/casos?estado=EN_INSUMOS" },
    { nombre: "Entregadas en 7 días", valor: t.totales.entregadasSemana, Icono: PackageCheck, href: "/casos?estado=ENTREGADO" },
    { nombre: "Sin auxiliar", valor: t.totales.sinAsignar, Icono: UserX, href: "/casos", alerta: t.totales.sinAsignar > 0 },
    { nombre: "De otro operador", valor: t.totales.duplicados, Icono: Copy, href: "/archivo-maestro", alerta: t.totales.duplicados > 0 }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Tablero diario</h1>
          <p className="mt-1 text-xs text-slate-400">{alcance}</p>
        </div>
        {t.alertasPendientes > 0 && tieneRol(sesion.roles, ["COORDINADOR", "REVISOR", "ASISTENTE"]) && (
          <Link href="/alertas" className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100">
            <Bell size={15} /> {t.alertasPendientes} alertas por emitir
          </Link>
        )}
      </div>

      {/* INDICADORES DEL DÍA */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ nombre, valor, Icono, href, alerta }) => (
          <Link key={nombre} href={href} className="tarjeta px-4 py-3 transition hover:bg-slate-50">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <Icono size={13} className={alerta ? "text-red-600" : "text-slate-400"} />{nombre}
            </p>
            <p className={`mt-1 text-2xl font-semibold ${alerta ? "text-red-700" : "text-slate-900"}`}>{valor}</p>
          </Link>
        ))}
      </section>

      {/* ETAPA × ESTADO */}
      <section className="tarjeta p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Casos abiertos por etapa y estado</h2>
        {filas.length === 0 ? <p className="text-sm text-slate-500">No hay actuaciones abiertas.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="text-left text-[11px] font-medium text-slate-500 px-2">Etapa</th>
                  {ESTADOS.map(e => <th key={e} className="text-[11px] font-medium text-slate-500 px-1 align-bottom min-w-[4.5rem]">{ESTADOS_ACTUACION[e]}</th>)}
                  <th className="text-[11px] font-semibold text-slate-700 px-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => {
                  const total = Object.values(f.estados).reduce((s, n) => s + n, 0)
                  return (
                    <tr key={f.etapa}>
                      <td className="px-2 text-sm font-medium text-slate-700 whitespace-nowrap">{ETAPAS[f.etapa]}</td>
                      {ESTADOS.map(e => {
                        const n = f.estados[e] ?? 0
                        return (
                          <td key={e} className="p-0">
                            {n > 0 ? (
                              <Link href={`/casos?etapa=${f.etapa}&estado=${e}`} title={`${ETAPAS[f.etapa]} · ${ESTADOS_ACTUACION[e]}: ${n}`}
                                className={`block rounded px-2 py-2 text-center text-sm font-semibold hover:ring-2 hover:ring-slate-400 ${tono(n, maxCelda)}`}>{n}</Link>
                            ) : <span className={`block rounded px-2 py-2 text-center text-sm ${RAMPA[0]}`}>·</span>}
                          </td>
                        )
                      })}
                      <td className="px-2 text-center text-sm font-semibold text-slate-900">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* CARGA POR PERSONA */}
        <section className="tarjeta p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Carga por auxiliar</h2>
          {t.personas.length === 0 ? <p className="text-sm text-slate-500">Sin actuaciones asignadas.</p> : (
            <ul className="space-y-3">
              {t.personas.map(p => (
                <li key={p.id} title={`${p.nombre}: ${p.abiertas} abiertas, ${p.criticas} críticas, ${p.vencidas} vencidas, ${p.entregadasSemana} entregadas en 7 días`}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <Link href={`/casos?auxiliarId=${p.id}&todos=1`} className="font-medium text-slate-800 hover:underline truncate">{p.nombre}</Link>
                    <span className="shrink-0 text-xs text-slate-500">
                      <b className="text-slate-900">{p.abiertas}</b> abiertas
                      {p.criticas > 0 && <> · <span className="text-red-700">{p.criticas} críticas</span></>}
                      {p.vencidas > 0 && <> · <span className="text-red-700 font-semibold">{p.vencidas} vencidas</span></>}
                      {" · "}{p.entregadasSemana} entregadas
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-r bg-slate-100">
                    <div className="h-2 rounded-r bg-slate-600" style={{ width: `${(p.abiertas / maxPersona) * 100}%` }} />
                  </div>
                  {p.equipo && <p className="mt-0.5 text-[11px] text-slate-400">{p.equipo}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* POR EQUIPO */}
        <section className="tarjeta p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Por equipo</h2>
          {t.porEquipo.length === 0 ? <p className="text-sm text-slate-500">Sin actuaciones en equipos.</p> : (
            <table className="tabla w-full">
              <thead><tr><th>Equipo</th><th className="text-right">Abiertas</th><th className="text-right">Críticas</th><th className="text-right">Vencidas</th><th className="text-right">Entregadas 7 días</th></tr></thead>
              <tbody>
                {t.porEquipo.map(e => (
                  <tr key={e.id}>
                    <td><Link href={`/casos?equipoId=${e.id}&todos=1`} className="hover:underline">{e.nombre}</Link></td>
                    <td className="text-right font-semibold">{e.abiertas}</td>
                    <td className={`text-right ${e.criticas ? "text-red-700" : ""}`}>{e.criticas}</td>
                    <td className={`text-right ${e.vencidas ? "text-red-700 font-semibold" : ""}`}>{e.vencidas}</td>
                    <td className="text-right">{e.entregadasSemana}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
