// Par etiqueta / valor para las vistas de detalle (mismo diseño que Nodex)
export default function Dato({ etiqueta, valor, className }: { etiqueta: string, valor: React.ReactNode, className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{etiqueta}</dt>
      <dd className="mt-1 break-words text-xs text-slate-700">{valor === null || valor === undefined || valor === "" ? "—" : valor}</dd>
    </div>
  )
}
