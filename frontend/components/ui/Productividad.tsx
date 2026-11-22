// Productividad del día de una persona (reunión 18-nov, fase 7): lo mismo en su tablero y en el cierre
export type Productividad = {
  usuarioId: number
  elaborados: number, horasElaboracion: number | null
  corregidos: number, horasCorreccion: number | null
  revisados: number, devueltosAuxiliar: number, horasRevision: number | null
  registrados: number, horasRegistro: number | null
}

export const horasHabiles = (h: number | null) => (h === null ? "—" : `${h.toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`)

type Perfiles = { auxiliar: boolean, revisor: boolean, asistente: boolean }

// Tarjetas del tablero diario: solo las del perfil de quien mira
export function TarjetasProductividad({ p, perfiles }: { p: Productividad | null, perfiles: Perfiles }) {
  const v = p ?? { elaborados: 0, horasElaboracion: null, corregidos: 0, horasCorreccion: null, revisados: 0, devueltosAuxiliar: 0, horasRevision: null, registrados: 0, horasRegistro: null }
  const tarjetas = [
    ...(perfiles.auxiliar ? [
      { nombre: "Escritos elaborados", valor: String(v.elaborados), detalle: `Producción promedio ${horasHabiles(v.horasElaboracion)}` },
      { nombre: "Escritos corregidos", valor: String(v.corregidos), detalle: `Corrección promedio ${horasHabiles(v.horasCorreccion)}` }
    ] : []),
    ...(perfiles.revisor ? [
      { nombre: "Escritos revisados", valor: String(v.revisados), detalle: `${v.devueltosAuxiliar} devueltos · revisión promedio ${horasHabiles(v.horasRevision)}` }
    ] : []),
    ...(perfiles.asistente ? [
      { nombre: "Asignaciones registradas", valor: String(v.registrados), detalle: `Registro promedio ${horasHabiles(v.horasRegistro)}` }
    ] : [])
  ]
  if (!tarjetas.length) return null
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Mi productividad de hoy</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tarjetas.map(t => (
          <div key={t.nombre} className="tarjeta px-4 py-3" title="Horas hábiles de la jornada">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t.nombre}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{t.valor}</p>
            <p className="text-[11px] text-slate-400">{t.detalle}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
