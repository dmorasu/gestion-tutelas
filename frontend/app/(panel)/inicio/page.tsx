import Link from "next/link"
import { ArrowUpRight, Inbox, LayoutList, SlidersHorizontal, Users, type LucideIcon } from "lucide-react"
import { fetchApi } from "@/src/lib/api"
import { obtenerSesion } from "@/src/auth/dal"
import { NOMBRES_ROLES, modulosPermitidos, tieneRol, type CodigoRol } from "@/src/auth/permisos"
import { ETAPAS, fechaHora } from "@/src/lib/formato"

// Aspecto de cada módulo (las clases van completas: Tailwind solo genera las que lee literalmente)
const ASPECTO: Record<string, { Icono: LucideIcon, fondo: string, sombra: string, borde: string, halo: string }> = {
  "/correos": { Icono: Inbox, fondo: "from-cyan-400 to-sky-600", sombra: "shadow-cyan-500/30", borde: "hover:border-cyan-300", halo: "bg-cyan-400" },
  "/casos": { Icono: LayoutList, fondo: "from-orange-400 to-red-600", sombra: "shadow-orange-500/30", borde: "hover:border-orange-300", halo: "bg-orange-400" },
  "/parametros": { Icono: SlidersHorizontal, fondo: "from-slate-500 to-slate-700", sombra: "shadow-slate-500/30", borde: "hover:border-slate-400", halo: "bg-slate-400" },
  "/usuarios": { Icono: Users, fondo: "from-rose-400 to-pink-600", sombra: "shadow-rose-500/30", borde: "hover:border-rose-300", halo: "bg-rose-400" }
}

type Resumen = { semaforo: Record<string, number>, porEtapa: { etapa: string, count: number }[], porRegistrar: number }
type EstadoBuzon = { activo: boolean, estado: { ultimaEjecucion: string | null, ultimoError: string | null } | null }
type Pendiente = { cantidad: number, texto: string }

const leer = async <T,>(ruta: string): Promise<T | null> => {
  const r = await fetchApi(ruta).catch(() => null)
  return r?.ok ? r.json() as Promise<T> : null
}

const COLORES = [
  { clave: "VENCIDO", nombre: "Vencidas", punto: "bg-red-600", texto: "text-red-700" },
  { clave: "ROJO", nombre: "Críticas", punto: "bg-red-400", texto: "text-red-600" },
  { clave: "AMARILLO", nombre: "Próximas", punto: "bg-amber-400", texto: "text-amber-700" },
  { clave: "VERDE", nombre: "A tiempo", punto: "bg-emerald-500", texto: "text-emerald-700" },
  { clave: "SIN_FECHA", nombre: "Sin fecha límite", punto: "bg-slate-300", texto: "text-slate-500" }
]

const saludo = () => {
  const hora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "numeric", hour12: false }))
  return hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches"
}

export default async function InicioPage() {
  const sesion = await obtenerSesion()
  const modulos = modulosPermitidos(sesion.roles)
  const registra = tieneRol(sesion.roles, ["ASISTENTE", "COORDINADOR"])
  const [resumen, buzon] = await Promise.all([
    leer<Resumen>("/casos/resumen"),
    registra ? leer<EstadoBuzon>("/correos/estado-buzon") : Promise.resolve(null)
  ])

  const pendientes: Record<string, Pendiente[]> = {
    "/correos": resumen?.porRegistrar ? [{ cantidad: resumen.porRegistrar, texto: "por registrar" }] : [],
    "/casos": [
      { cantidad: resumen?.semaforo.VENCIDO ?? 0, texto: "vencidas" },
      { cantidad: resumen?.semaforo.ROJO ?? 0, texto: "críticas" },
      { cantidad: resumen?.semaforo.AMARILLO ?? 0, texto: "próximas" }
    ].filter(p => p.cantidad > 0)
  }
  const urgentes = (resumen?.semaforo.VENCIDO ?? 0) + (resumen?.semaforo.ROJO ?? 0)
  const hoy = new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" })

  return (
    <div className="space-y-8">
      {/* SALUDO */}
      <section className="aparecer relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-600 via-slate-800 to-slate-950 px-6 py-7 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-slate-300/20 blur-3xl" aria-hidden="true" />
        <div className="relative">
          <p className="text-xs font-medium capitalize text-slate-300">{hoy}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{saludo()}, {sesion.nombre.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-slate-200">
            {urgentes > 0
              ? <>Tienes <b className="text-white">{urgentes}</b> actuación(es) vencidas o críticas.</>
              : "Todo al día en tus actuaciones."}
          </p>
          {sesion.roles.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {sesion.roles.map(rol => (
                <span key={rol} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur">
                  {NOMBRES_ROLES[rol as CodigoRol] ?? rol}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* MÓDULOS */}
      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Tus módulos</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modulos.map((modulo, i) => {
            const { Icono, fondo, sombra, borde, halo } = ASPECTO[modulo.href] ?? ASPECTO["/parametros"]
            const suyos = pendientes[modulo.href] ?? []
            return (
              <Link
                key={modulo.href}
                href={modulo.href}
                style={{ animationDelay: `${80 + i * 60}ms` }}
                className={`aparecer group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${borde}`}
              >
                <span className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-2xl transition duration-500 group-hover:opacity-30 ${halo}`} aria-hidden="true" />
                <div className="relative flex items-start justify-between">
                  <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition duration-300 group-hover:-rotate-6 group-hover:scale-110 ${fondo} ${sombra}`}>
                    <Icono size={22} strokeWidth={2} />
                  </span>
                  <ArrowUpRight size={18} className="text-slate-300 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-600" />
                </div>
                <h3 className="relative mt-4 text-base font-semibold text-slate-800">{modulo.nombre}</h3>
                <p className="relative mt-1 text-xs leading-5 text-slate-500">{modulo.descripcion}</p>
                {suyos.length > 0 && (
                  <ul className="relative mt-4 flex flex-wrap gap-1.5">
                    {suyos.map(p => (
                      <li key={p.texto} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                        <span className="latido h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                        {p.cantidad} {p.texto}
                      </li>
                    ))}
                  </ul>
                )}
              </Link>
            )
          })}
        </div>
      </section>

      {/* PLAZOS */}
      {resumen && (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="tarjeta p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">{registra ? "Actuaciones abiertas" : "Mis actuaciones"}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {COLORES.map(c => (
                <Link key={c.clave} href={`/casos?semaforo=${c.clave}`} className="rounded-xl border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    <span className={`h-2 w-2 rounded-full ${c.punto}`} />{c.nombre}
                  </p>
                  <p className={`mt-1 text-xl font-semibold ${c.texto}`}>{resumen.semaforo[c.clave] ?? 0}</p>
                </Link>
              ))}
            </div>
          </div>
          <div className="tarjeta p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Por etapa</h2>
            {resumen.porEtapa.length === 0
              ? <p className="text-xs text-slate-400">Sin actuaciones abiertas</p>
              : (
                <ul className="space-y-2 text-xs">
                  {resumen.porEtapa.map(e => (
                    <li key={e.etapa} className="flex justify-between">
                      <Link href={`/casos?etapa=${e.etapa}`} className="text-slate-600 hover:text-slate-900">{ETAPAS[e.etapa] ?? e.etapa}</Link>
                      <span className="font-semibold text-slate-800">{e.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            {buzon && (
              <p className="mt-5 border-t border-slate-100 pt-4 text-[11px] text-slate-400">
                {buzon.activo ? `Buzón leído: ${fechaHora(buzon.estado?.ultimaEjecucion)}` : "Lectura del buzón apagada"}
                {buzon.estado?.ultimoError && <span className="block text-red-600">Error en la última lectura</span>}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
