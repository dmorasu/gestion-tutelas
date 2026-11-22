import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"

type Medida = { fase: string, cantidad: number, promedio: number | null, mediana: number | null }
type Tiempos = {
  desde: string, hasta: string
  general: Medida[]
  porEtapaTipo: { etapa: string, nombreEtapa: string, tipoRespuesta: string, actuaciones: number, fases: Medida[] }[]
  porPersona: { usuarioId: number, nombre: string, perfil: string, fases: Medida[] }[]
  nombresFase: Record<string, string>
}

const PERFILES: Record<string, string> = { ASISTENTE: "Asistente", AUXILIAR: "Auxiliar", REVISOR: "Revisor" }
// Lo que hace la firma va primero; las esperas de la entidad, al final
const COLUMNAS = ["REGISTRO", "POR_ASUMIR", "ELABORACION", "REVISION", "AJUSTE", "CORREGIDO", "CORRECCION", "INSUMOS", "ENTIDAD"]
const CORTOS: Record<string, string> = {
  REGISTRO: "Registro", POR_ASUMIR: "Por asumir", ELABORACION: "Elaboración", REVISION: "Revisión", AJUSTE: "Ajuste interno",
  CORREGIDO: "Corrección", CORRECCION: "Devolución de la entidad", INSUMOS: "Espera de insumos", ENTIDAD: "Validación de la entidad"
}

const horas = (h: number | null) => (h === null ? "—" : `${h.toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`)

function Celda({ m }: { m?: Medida }) {
  if (!m) return <td className="text-right text-slate-300">—</td>
  return (
    <td className="text-right whitespace-nowrap" title={`Promedio en horas hábiles. Mediana ${horas(m.mediana)} · ${m.cantidad} ${m.cantidad === 1 ? "vez" : "veces"}`}>
      <span className="font-medium text-slate-800">{horas(m.promedio)}</span>
      <span className="ml-1 text-[11px] text-slate-400">({m.cantidad})</span>
    </td>
  )
}

export default async function TiemposPage({ searchParams }: { searchParams: Promise<{ desde?: string, hasta?: string }> }) {
  await requiereRol("COORDINADOR", "REVISOR", "ASISTENTE")
  const { desde, hasta } = await searchParams
  const fechaValida = (x?: string) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x)
  const filtro = new URLSearchParams({ ...(fechaValida(desde) ? { desde: desde! } : {}), ...(fechaValida(hasta) ? { hasta: hasta! } : {}) })
  const t = await obtener<Tiempos>(`/seguimiento/tiempos?${filtro}`)
  // Solo las columnas que tienen datos en el periodo
  const usadas = COLUMNAS.filter(c => t.general.some(m => m.fase === c))
  const de = (fases: Medida[], fase: string) => fases.find(m => m.fase === fase)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="titulo-pagina">Tiempos</h1>
        <form className="flex items-end gap-2">
          <input type="date" name="desde" defaultValue={t.desde} className="campo py-1.5" />
          <input type="date" name="hasta" defaultValue={t.hasta} className="campo py-1.5" />
          <button className="boton-secundario py-1.5">Ver</button>
        </form>
      </div>

      {t.general.length === 0 ? (
        <p className="tarjeta px-5 py-8 text-center text-sm text-slate-500">No hay pasos terminados en este periodo.</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {usadas.map(c => {
              const m = de(t.general, c)!
              return (
                <div key={c} className="tarjeta px-4 py-3" title={t.nombresFase[c]}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{CORTOS[c]}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{horas(m.promedio)}</p>
                  <p className="text-[11px] text-slate-400">Mediana {horas(m.mediana)} · {m.cantidad} {m.cantidad === 1 ? "vez" : "veces"}</p>
                </div>
              )
            })}
          </section>

          <section className="tarjeta p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Por etapa y tipo de respuesta</h2>
            <div className="overflow-x-auto">
              <table className="tabla w-full">
                <thead>
                  <tr>
                    <th>Etapa</th><th>Tipo de respuesta</th><th className="text-right">Actuaciones</th>
                    {usadas.map(c => <th key={c} className="text-right whitespace-nowrap">{CORTOS[c]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {t.porEtapaTipo.map(f => (
                    <tr key={`${f.etapa}-${f.tipoRespuesta}`}>
                      <td className="whitespace-nowrap font-medium">{f.nombreEtapa}</td>
                      <td className="text-xs">{f.tipoRespuesta}</td>
                      <td className="text-right">{f.actuaciones}</td>
                      {usadas.map(c => <Celda key={c} m={de(f.fases, c)} />)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="tarjeta p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">Por persona</h2>
            {t.porPersona.length === 0 ? <p className="text-sm text-slate-500">Sin pasos con responsable en este periodo.</p> : (
              <div className="overflow-x-auto">
                <table className="tabla w-full">
                  <thead>
                    <tr>
                      <th>Persona</th><th>Perfil</th>
                      {usadas.filter(c => c !== "INSUMOS" && c !== "ENTIDAD").map(c => <th key={c} className="text-right whitespace-nowrap">{CORTOS[c]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {t.porPersona.map(p => (
                      <tr key={`${p.usuarioId}-${p.perfil}`}>
                        <td className="whitespace-nowrap font-medium">{p.nombre}</td>
                        <td className="text-xs">{PERFILES[p.perfil] ?? p.perfil}</td>
                        {usadas.filter(c => c !== "INSUMOS" && c !== "ENTIDAD").map(c => <Celda key={c} m={de(p.fases, c)} />)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
