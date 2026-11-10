import Link from "next/link"
import { ArrowLeft, FileSpreadsheet, FilePlus2, MessageSquareText } from "lucide-react"
import clsx from "clsx"
import { fetchApi, leerErrores, obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import FormRegistro, { type Juzgado } from "../../correos/[id]/FormRegistro"
import CargueExcel, { type Analisis } from "./CargueExcel"
import FormPqrs from "@/components/pqrs/FormPqrs"

export default async function NuevaAsignacionPage({ searchParams }: { searchParams: Promise<{ modo?: string, archivoId?: string, correoId?: string }> }) {
  await requiereRol("ASISTENTE", "COORDINADOR")
  const { modo, archivoId, correoId } = await searchParams
  const excel = modo === "excel" || !!archivoId || !!correoId
  // D21: la pestaña de PQRS solo aparece con el ámbito activo
  const pqrs = await obtener<{ activo: boolean, tiposPeticion: Record<string, string> }>("/catalogos/pqrs")
  const esPqrs = modo === "pqrs" && pqrs.activo
  const juzgados = excel || esPqrs ? [] : await obtener<Juzgado[]>("/catalogos/juzgados")
  // Excel adjunto de un correo: se lee aquí y la pantalla abre con el emparejamiento listo
  let inicial: Analisis | null = null
  let error: string | null = null
  // Excel adjunto de un correo, o un correo con varios radicados en el texto (misma pantalla)
  if (archivoId || correoId) {
    const r = archivoId
      ? await fetchApi("/cargues/analizar", { method: "POST", body: JSON.stringify({ archivoId: Number(archivoId) }) })
      : await fetchApi("/cargues/desde-correo", { method: "POST", body: JSON.stringify({ correoId: Number(correoId) }) })
    if (r.ok) inicial = await r.json()
    else error = (await leerErrores(r)).join(". ")
  }
  const pestana = (activa: boolean) => clsx("inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition", activa ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700")

  return (
    <div className="space-y-4">
      <div>
        <Link href="/casos" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><ArrowLeft size={14} /> Volver a casos</Link>
        <h1 className="mt-3 text-xl font-semibold text-slate-800">Nueva asignación</h1>
      </div>
      <nav className="flex w-fit gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <Link href="/casos/nuevo" className={pestana(!excel && !esPqrs)}><FilePlus2 size={15} /> Un caso</Link>
        <Link href="/casos/nuevo?modo=excel" className={pestana(excel)}><FileSpreadsheet size={15} /> Varios casos (Excel o correo)</Link>
        {pqrs.activo && <Link href="/casos/nuevo?modo=pqrs" className={pestana(esPqrs)}><MessageSquareText size={15} /> PQRS</Link>}
      </nav>
      {esPqrs ? <FormPqrs modo="manual" tiposPeticion={pqrs.tiposPeticion} /> : excel
        ? (
          <>
            {error && <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <CargueExcel inicial={inicial} />
          </>
        )
        : (
          <FormRegistro amplio sugerencia={{ radicado: null, juzgadoId: null, etapa: null, criticidad: null, fechaVencimiento: null, tipoSolicitud: "TUTELA" }} juzgados={juzgados} casoExistente={null} />
        )}
    </div>
  )
}
