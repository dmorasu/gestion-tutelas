import { Download, ExternalLink, FileSpreadsheet, FileText, FileType2, FolderOpen, Image as Imagen, type LucideIcon } from "lucide-react"
import { ETAPAS, fechaHora } from "@/src/lib/formato"
import SubirArchivos from "../SubirArchivos"

export type DocumentoCaso = {
  id: number, nombre: string, tipo: string, tipoMime: string | null, proveedor: string | null, webUrl: string | null
  actuacionId: number | null, escritoId: number | null, createdAt: string
}
type Actuacion = { id: number, etapa: string, escritos: { id: number, version: number }[] }

// El expediente como está en SharePoint: por etapa y, dentro, por carpeta
const ORDEN = ["Entrada", "Insumos", "Escritos", "Soportes"]
const ETIQUETA: Record<string, string> = { ESCRITO: "Escrito", ANEXO: "Anexo", INSUMO: "Insumo", SOPORTE: "Soporte", RESPUESTA: "Respuesta de la entidad", CORREO: "Adjunto de correo" }

const icono = (d: DocumentoCaso): { Icono: LucideIcon, color: string } => {
  const n = d.nombre.toLowerCase()
  if (n.endsWith(".pdf")) return { Icono: FileType2, color: "text-red-500" }
  if (/\.(docx?|odt|rtf)$/.test(n)) return { Icono: FileText, color: "text-sky-600" }
  if (/\.(xlsx?|csv)$/.test(n)) return { Icono: FileSpreadsheet, color: "text-emerald-600" }
  if (/\.(png|jpe?g|gif|webp|tiff?)$/.test(n)) return { Icono: Imagen, color: "text-violet-500" }
  return { Icono: FileText, color: "text-slate-400" }
}

export default function DocumentosCaso({ actuaciones, documentos, puedeSubir }: { actuaciones: Actuacion[], documentos: DocumentoCaso[], puedeSubir: (actuacionId: number) => boolean }) {
  const version = new Map(actuaciones.flatMap(a => a.escritos.map(e => [e.id, e.version])))
  const carpeta = (d: DocumentoCaso) =>
    d.escritoId ? `Escritos V${version.get(d.escritoId) ?? ""}` : d.tipo === "INSUMO" ? "Insumos" : d.tipo === "CORREO" ? "Entrada" : "Soportes"
  const orden = (c: string) => ORDEN.indexOf(c.startsWith("Escritos") ? "Escritos" : c) * 100 + (Number(c.replace(/\D/g, "")) || 0)

  if (!documentos.length && !actuaciones.some(a => puedeSubir(a.id))) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-10 text-center">
        <FolderOpen size={30} className="mx-auto mb-2 text-slate-300" />
        <p className="text-xs font-medium text-slate-500">Sin documentos</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {actuaciones.map(a => {
        const suyos = documentos.filter(d => d.actuacionId === a.id)
        const carpetas = [...new Set(suyos.map(carpeta))].sort((x, y) => orden(x) - orden(y))
        return (
          <div key={a.id} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{ETAPAS[a.etapa]} · {suyos.length} documentos</h3>
              {puedeSubir(a.id) && <SubirArchivos actuacionId={a.id} tipos={["SOPORTE", "INSUMO", "ESCRITO", "ANEXO"]} />}
            </div>
            {carpetas.length === 0 && <p className="text-xs text-slate-500">Sin documentos en esta etapa.</p>}
            {carpetas.map(c => (
              <div key={c} className="rounded-lg border border-slate-200">
                <p className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  <FolderOpen size={14} className="text-slate-400" /> {c}
                </p>
                <ul className="divide-y divide-slate-100">
                  {suyos.filter(d => carpeta(d) === c).map(d => {
                    const { Icono, color } = icono(d)
                    return (
                      <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                        <Icono size={18} className={`shrink-0 ${color}`} />
                        <div className="min-w-0 flex-1">
                          {d.proveedor
                            ? <a href={`/archivos/${d.id}`} target="_blank" className="block truncate text-xs font-medium text-slate-800 hover:underline" title={d.nombre}>{d.nombre}</a>
                            : <span className="block truncate text-xs text-slate-500" title="No se pudo guardar en el repositorio">{d.nombre}</span>}
                          <p className="text-[11px] text-slate-400">{ETIQUETA[d.tipo] ?? d.tipo} · {fechaHora(d.createdAt)}</p>
                        </div>
                        {d.proveedor && <a href={`/archivos/${d.id}?descargar=1`} title="Descargar" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Download size={15} /></a>}
                        {d.webUrl && <a href={d.webUrl} target="_blank" rel="noreferrer" title="Abrir en SharePoint (para editar en Word)" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ExternalLink size={15} /></a>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
