import { ExternalLink, FileText, Download } from "lucide-react"

export type DocumentoFila = { id: number, nombre: string, tipo?: string, webUrl?: string | null, proveedor?: string | null }

// Un documento del expediente: se ve en la app y, si está en SharePoint, se abre allá para editarlo
// en Word (las versiones las lleva SharePoint)
export default function Documento({ d }: { d: DocumentoFila }) {
  const disponible = !!d.proveedor
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-xs">
      <FileText size={13} className="text-slate-400 shrink-0" />
      {disponible
        ? <a href={`/archivos/${d.id}`} target="_blank" className="hover:underline max-w-[16rem] truncate" title={d.nombre}>{d.nombre}</a>
        : <span className="text-slate-500 max-w-[16rem] truncate" title="No se pudo guardar en el repositorio">{d.nombre}</span>}
      {disponible && <a href={`/archivos/${d.id}?descargar=1`} title="Descargar" className="text-slate-400 hover:text-slate-700"><Download size={13} /></a>}
      {d.webUrl && <a href={d.webUrl} target="_blank" rel="noreferrer" title="Abrir en SharePoint" className="text-slate-400 hover:text-slate-700"><ExternalLink size={13} /></a>}
    </span>
  )
}
