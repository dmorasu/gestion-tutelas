import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import TarjetaEquipo, { type Persona } from "./TarjetaEquipo"
import NuevoEquipo from "./NuevoEquipo"

type Equipo = { id: number, nombre: string, etapas: string[], activo: boolean }
type Usuario = { id: number, nombre: string, activo: boolean, equipoId: number | null, roles: { codigo: string }[], equipo: { nombre: string } | null }

// Solo revisores y auxiliares forman equipos: asistentes y coordinador son transversales
const rolDe = (u: Usuario): Persona["rol"] | null =>
  u.roles.some(r => r.codigo === "REVISOR") ? "REVISOR" : u.roles.some(r => r.codigo === "AUXILIAR") ? "AUXILIAR" : null

export default async function EquiposPage() {
  await requiereRol("COORDINADOR")
  const [equipos, usuarios] = await Promise.all([obtener<Equipo[]>("/catalogos/equipos"), obtener<Usuario[]>("/catalogos/usuarios")])
  const personas: Persona[] = usuarios
    .filter(u => u.activo && rolDe(u))
    .map(u => ({ id: u.id, nombre: u.nombre, rol: rolDe(u)!, equipoId: u.equipoId, equipo: u.equipo?.nombre ?? null }))
  const sinEquipo = personas.filter(p => !p.equipoId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="titulo-pagina">Equipos</h1>
        <p className="mt-1 text-xs text-slate-400">
          {equipos.length} equipos · {personas.filter(p => p.rol === "REVISOR").length} revisores · {personas.filter(p => p.rol === "AUXILIAR").length} auxiliares
        </p>
      </div>

      {sinEquipo.length > 0 && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Sin equipo: {sinEquipo.map(p => p.nombre).join(", ")}. El reparto los usa solo si ningún equipo atiende la etapa.
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {equipos.map(e => (
          <TarjetaEquipo key={e.id} equipo={e} miembros={personas.filter(p => p.equipoId === e.id)} otros={personas.filter(p => p.equipoId !== e.id)} />
        ))}
      </div>

      <NuevoEquipo />
    </div>
  )
}
