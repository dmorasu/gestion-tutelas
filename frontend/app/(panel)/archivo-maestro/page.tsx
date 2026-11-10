import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { fechaHora, radicado } from "@/src/lib/formato"
import CargarMaestro from "./CargarMaestro"

type Datos = {
  total: number
  pqrs: number
  muestra: { id: number, radicado: string, operador: string | null }[]
  ultima: { archivoMaestro: string | null, createdAt: string } | null
  marcados: { id: number, numeroInterno: string | null, radicado: string, estado: string }[]
}

export default async function ArchivoMaestroPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requiereRol("COORDINADOR")
  const { q } = await searchParams
  const d = await obtener<Datos>(`/seguimiento/archivo-maestro${q ? `?q=${encodeURIComponent(q)}` : ""}`)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="titulo-pagina">Archivo maestro</h1>
        <p className="mt-1 text-xs text-slate-400">
          {d.total} radicados de otros operadores o equipos ({d.pqrs} PQRS){d.ultima && ` · ${d.ultima.archivoMaestro} · cargado ${fechaHora(d.ultima.createdAt)}`}
        </p>
      </div>
      <CargarMaestro />

      {d.marcados.length > 0 && (
        <section className="tarjeta p-4 space-y-2">
          <h2 className="text-sm font-semibold text-red-800">Casos nuestros que otro operador o equipo ya atiende ({d.marcados.length})</h2>
          <div className="flex flex-wrap gap-2">
            {d.marcados.map(c => (
              <Link key={c.id} href={`/casos/${c.id}`} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-900 hover:bg-red-100">
                {c.numeroInterno ?? radicado(c.radicado)}{c.estado === "CERRADO" && " (cerrado)"}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="tarjeta p-4 space-y-3">
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar radicado o PQRS" className="campo" />
          <button className="boton-secundario">Buscar</button>
        </form>
        <table className="tabla w-full">
          <thead><tr><th>Radicado</th><th>Operador</th></tr></thead>
          <tbody>
            {d.muestra.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-slate-500">Sin resultados.</td></tr>}
            {d.muestra.map(r => <tr key={r.id}><td className="font-mono text-xs">{radicado(r.radicado)}</td><td>{r.operador ?? "—"}</td></tr>)}
          </tbody>
        </table>
      </section>
    </div>
  )
}
