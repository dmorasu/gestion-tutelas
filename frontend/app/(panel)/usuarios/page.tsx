import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { fechaHora } from "@/src/lib/formato"
import TablaUsuarios from "./TablaUsuarios"

type Usuario = {
  id: number, nombre: string, correo: string, activo: boolean, capacidadDiaria: number | null, ultimoIngreso: string | null,
  debeCambiarContrasena: boolean, minutosBloqueo?: number, roles: { codigo: string }[], equipoId: number | null
}
type Equipo = { id: number, nombre: string }

export default async function UsuariosPage() {
  const sesion = await requiereRol("ADMIN")
  const [usuarios, equipos] = await Promise.all([obtener<Usuario[]>("/catalogos/usuarios"), obtener<Equipo[]>("/catalogos/equipos")])
  return (
    <TablaUsuarios
      usuarioId={sesion.id}
      equipos={equipos}
      usuarios={usuarios.map(u => ({ ...u, roles: u.roles.map(r => r.codigo), ultimoIngreso: u.ultimoIngreso ? fechaHora(u.ultimoIngreso) : "Nunca" }))}
    />
  )
}
