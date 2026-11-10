// Tarjeta con título para agrupar datos (mismo diseño que Nodex)
export default function Seccion({ titulo, acciones, children, sinRelleno }: {
  titulo: string
  acciones?: React.ReactNode
  children: React.ReactNode
  sinRelleno?: boolean
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-700">{titulo}</h2>
        {acciones}
      </div>
      <div className={sinRelleno ? "" : "p-5"}>{children}</div>
    </section>
  )
}
