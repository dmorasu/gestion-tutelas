import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { ETAPAS, fechaHora, radicado } from "@/src/lib/formato"

type Persona = {
  id: number, nombre: string, capacidadDiaria: number | null, recibidas: number, tomadas: number, insumos: number,
  enviadasRevision: number, devueltasAuxiliar: number, entregadas: number, usoCapacidad: number | null, pendientes: number, vencidas: number
}
type Movimiento = {
  hora: string, nombre: string | null, estado: string, accion: string, casoId: number, numeroInterno: string | null, radicado: string,
  etapa: string, actuacionId: number, horasDesdeAsignacion: number | null, aTiempo: boolean | null
}
type Cierre = {
  dia: string
  totales: { recibidas: number, enviadasRevision: number, devueltasAuxiliar: number, entregadas: number, aTiempo: number, tarde: number }
  personas: Persona[]
  movimientos: Movimiento[]
}

const duracion = (horas: number) => (horas < 24 ? `${horas.toLocaleString("es-CO")} h` : `${Math.floor(horas / 24)} d ${Math.round(horas % 24)} h`)

export default async function CierreDiaPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const { dia } = await searchParams
  const c = await obtener<Cierre>(`/seguimiento/cierre-dia${dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? `?dia=${dia}` : ""}`)
  const t = c.totales

  const tiles = [
    { nombre: "Recibidas", valor: t.recibidas },
    { nombre: "Enviadas a revisión", valor: t.enviadasRevision },
    { nombre: "Devueltas por el revisor", valor: t.devueltasAuxiliar },
    { nombre: "Entregadas a la entidad", valor: t.entregadas },
    { nombre: "Respondidas a tiempo", valor: t.aTiempo },
    { nombre: "Respondidas tarde", valor: t.tarde, alerta: t.tarde > 0 }
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="titulo-pagina">Cierre del día</h1>
        <form className="flex items-end gap-2">
          <input type="date" name="dia" defaultValue={c.dia} className="campo py-1.5" />
          <button className="boton-secundario py-1.5">Ver</button>
        </form>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(x => (
          <div key={x.nombre} className="tarjeta px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{x.nombre}</p>
            <p className={`mt-1 text-2xl font-semibold ${x.alerta ? "text-red-700" : "text-slate-900"}`}>{x.valor}</p>
          </div>
        ))}
      </section>

      {/* POR PERSONA */}
      <section className="tarjeta p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Capacidad de respuesta por persona</h2>
        {c.personas.length === 0 ? <p className="text-sm text-slate-500">Nadie movió casos este día.</p> : (
          <div className="overflow-x-auto">
            <table className="tabla w-full">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="text-right">Recibidas</th>
                  <th className="text-right">Tomadas</th>
                  <th className="text-right">Insumos pedidos</th>
                  <th className="text-right">A revisión</th>
                  <th className="text-right">Devueltas al auxiliar</th>
                  <th className="text-right">Entregadas</th>
                  <th className="min-w-[10rem]">Respondidas / capacidad</th>
                  <th className="text-right">Pendientes</th>
                </tr>
              </thead>
              <tbody>
                {c.personas.map(p => (
                  <tr key={p.id}>
                    <td className="font-medium whitespace-nowrap">{p.nombre}</td>
                    <td className="text-right">{p.recibidas}</td>
                    <td className="text-right">{p.tomadas}</td>
                    <td className="text-right">{p.insumos}</td>
                    <td className="text-right font-semibold">{p.enviadasRevision}</td>
                    <td className="text-right">{p.devueltasAuxiliar}</td>
                    <td className="text-right font-semibold">{p.entregadas}</td>
                    <td>
                      {p.capacidadDiaria ? (
                        <div title={`${p.enviadasRevision} de ${p.capacidadDiaria} al día`}>
                          <div className="flex justify-between text-xs text-slate-600">
                            <span>{p.enviadasRevision} de {p.capacidadDiaria}</span><span>{p.usoCapacidad}%</span>
                          </div>
                          <div className="mt-1 h-2 rounded-r bg-slate-100">
                            <div className="h-2 rounded-r bg-slate-600" style={{ width: `${Math.min(100, p.usoCapacidad ?? 0)}%` }} />
                          </div>
                        </div>
                      ) : <span className="text-xs text-slate-400">Sin capacidad diaria</span>}
                    </td>
                    <td className="text-right">
                      <Link href={`/casos?auxiliarId=${p.id}&todos=1`} className="hover:underline">{p.pendientes}</Link>
                      {p.vencidas > 0 && <span className="ml-1 text-xs font-semibold text-red-700">({p.vencidas} vencidas)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* POR CASO */}
      <section className="tarjeta p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Movimientos por caso</h2>
        {c.movimientos.length === 0 ? <p className="text-sm text-slate-500">Sin movimientos este día.</p> : (
          <div className="overflow-x-auto">
            <table className="tabla w-full">
              <thead>
                <tr><th>Hora</th><th>Caso</th><th>Etapa</th><th>Persona</th><th>Qué hizo</th><th className="text-right">Desde la asignación</th><th>Frente al ANS</th></tr>
              </thead>
              <tbody>
                {c.movimientos.map((m, i) => (
                  <tr key={`${m.actuacionId}-${m.hora}-${i}`}>
                    <td className="whitespace-nowrap text-xs">{fechaHora(m.hora)}</td>
                    <td className="whitespace-nowrap">
                      <Link href={`/casos/${m.casoId}?actuacion=${m.actuacionId}`} className="font-medium hover:underline">{m.numeroInterno ?? "—"}</Link>
                      <span className="block text-[11px] text-slate-400">{radicado(m.radicado)}</span>
                    </td>
                    <td className="text-xs">{ETAPAS[m.etapa] ?? m.etapa}</td>
                    <td className="text-xs whitespace-nowrap">{m.nombre ?? "—"}</td>
                    <td className="text-xs">{m.accion}</td>
                    <td className="text-right text-xs whitespace-nowrap">{m.horasDesdeAsignacion !== null ? duracion(m.horasDesdeAsignacion) : ""}</td>
                    <td className="text-xs">
                      {m.aTiempo === true && <span className="text-emerald-700">A tiempo</span>}
                      {m.aTiempo === false && <span className="font-semibold text-red-700">Después del límite</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
