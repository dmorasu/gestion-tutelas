import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { fechaHora } from "@/src/lib/formato"
import FilaUsuario from "./FilaUsuario"
import NuevoUsuario from "./NuevoUsuario"

type Usuario = {
  id: number, nombre: string, correo: string, activo: boolean, capacidadDiaria: number | null, ultimoIngreso: string | null,
  debeCambiarContrasena: boolean, minutosBloqueo?: number, roles: { codigo: string }[]
}

export default async function UsuariosPage() {
  const sesion = await requiereRol("ADMIN")
  const usuarios = await obtener<Usuario[]>("/catalogos/usuarios")

  return (
    <div className="space-y-4">
      <div>
        <h1 className="titulo-pagina">Usuarios</h1>
      </div>
      <NuevoUsuario />
      <div className="tarjeta overflow-x-auto">
        <table className="tabla w-full">
          <thead><tr><th>Usuario</th><th>Perfiles</th><th>Casos nuevos por día</th><th>Activo</th><th>Último ingreso</th><th></th></tr></thead>
          <tbody>
            {usuarios.map(u => (
              <FilaUsuario key={u.id} usuario={{ ...u, roles: u.roles.map(r => r.codigo), ultimoIngreso: fechaHora(u.ultimoIngreso) }} esUsted={u.id === sesion.id} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
