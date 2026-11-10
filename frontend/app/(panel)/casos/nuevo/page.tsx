import Link from "next/link"
import clsx from "clsx"
import { fetchApi, leerErrores, obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import FormRegistro, { type Juzgado } from "../../correos/[id]/FormRegistro"
import CargueExcel, { type Analisis } from "./CargueExcel"

export default async function NuevaAsignacionPage({ searchParams }: { searchParams: Promise<{ modo?: string, archivoId?: string }> }) {
  await requiereRol("ASISTENTE", "COORDINADOR")
  const { modo, archivoId } = await searchParams
  const excel = modo === "excel" || !!archivoId
  const juzgados = excel ? [] : await obtener<Juzgado[]>("/catalogos/juzgados")
  // Excel adjunto de un correo: se lee aquí y la pantalla abre con el emparejamiento listo
  let inicial: Analisis | null = null
  let error: string | null = null
  if (archivoId) {
    const r = await fetchApi("/cargues/analizar", { method: "POST", body: JSON.stringify({ archivoId: Number(archivoId) }) })
    if (r.ok) inicial = await r.json()
    else error = (await leerErrores(r)).join(". ")
  }
  const pestana = (activa: boolean) => clsx("px-3 py-2 text-sm font-medium border-b-2", activa ? "border-slate-800 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700")

  return (
    <div className="space-y-4">
      <Link href="/casos" className="text-xs enlace">← Tablero</Link>
      <h1 className="titulo-pagina">Nueva asignación</h1>
      <div className="flex gap-2 border-b border-slate-200">
        <Link href="/casos/nuevo" className={pestana(!excel)}>Un caso</Link>
        <Link href="/casos/nuevo?modo=excel" className={pestana(excel)}>Desde Excel</Link>
      </div>
      {excel
        ? (
          <>
            {error && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <CargueExcel inicial={inicial} />
          </>
        )
        : (
          <div className="max-w-xl">
            <FormRegistro sugerencia={{ radicado: null, juzgadoId: null, etapa: null, criticidad: null, fechaVencimiento: null, tipoSolicitud: "TUTELA" }} juzgados={juzgados} casoExistente={null} />
          </div>
        )}
    </div>
  )
}
