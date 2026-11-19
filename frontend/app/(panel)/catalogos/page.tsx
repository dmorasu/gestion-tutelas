import Link from "next/link"
import clsx from "clsx"
import { Scale, MessageSquareText, ClipboardList, type LucideIcon } from "lucide-react"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import ListaCatalogo, { type ItemCatalogo } from "./ListaCatalogo"

type Catalogo = "DERECHO" | "TIPO_RESPUESTA" | "INSUMO"

const PESTANAS: { clave: Catalogo, nombre: string, Icono: LucideIcon }[] = [
  { clave: "DERECHO", nombre: "Derechos", Icono: Scale },
  { clave: "TIPO_RESPUESTA", nombre: "Tipos de respuesta", Icono: MessageSquareText },
  { clave: "INSUMO", nombre: "Matriz de insumos", Icono: ClipboardList }
]

export default async function CatalogosPage({ searchParams }: { searchParams: Promise<{ catalogo?: string }> }) {
  await requiereRol("COORDINADOR")
  const { catalogo: pedido } = await searchParams
  const catalogo = PESTANAS.find(p => p.clave === pedido)?.clave ?? "DERECHO"
  const items = await obtener<ItemCatalogo[]>(`/catalogos/items?catalogo=${catalogo}&todos=1`)
  const activos = items.filter(i => i.activo).length
  const supuestos = items.filter(i => i.supuesto).length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="titulo-pagina">Catálogos</h1>
        <p className="mt-1 text-xs text-slate-400">
          {activos} activos{items.length > activos && ` · ${items.length - activos} apagados`}{supuestos > 0 && ` · ${supuestos} por confirmar`}
        </p>
      </div>

      <nav className="flex w-fit flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {PESTANAS.map(({ clave, nombre, Icono }) => (
          <Link key={clave} href={`/catalogos?catalogo=${clave}`} className={clsx("inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition",
            catalogo === clave ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700")}>
            <Icono size={15} /> {nombre}
          </Link>
        ))}
      </nav>

      <ListaCatalogo key={catalogo} catalogo={catalogo} items={items} />
    </div>
  )
}
