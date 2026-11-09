"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { desbloquearUsuario, guardarUsuario, restablecerContrasena } from "./acciones"
import { NOMBRES_ROLES, type CodigoRol } from "@/src/auth/permisos"
import ContrasenaTemporal from "@/components/ui/ContrasenaTemporal"

type Props = {
  usuario: {
    id: number, nombre: string, correo: string, activo: boolean, capacidadDiaria: number | null, ultimoIngreso: string,
    roles: string[], debeCambiarContrasena: boolean, minutosBloqueo?: number
  }
  esUsted: boolean
}

export default function FilaUsuario({ usuario: u, esUsted }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [roles, setRoles] = useState(u.roles)
  const [activo, setActivo] = useState(u.activo)
  const [capacidad, setCapacidad] = useState(u.capacidadDiaria ? String(u.capacidadDiaria) : "")
  const [temporal, setTemporal] = useState<string | null>(null)
  const cambiado = roles.join() !== u.roles.join() || activo !== u.activo || capacidad !== (u.capacidadDiaria ? String(u.capacidadDiaria) : "")

  const guardar = () => iniciar(async () => {
    const r = await guardarUsuario(u.id, { roles, activo, capacidadDiaria: capacidad ? Number(capacidad) : null })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success(esUsted ? "Guardado. Vuelva a entrar para ver sus perfiles nuevos." : "Usuario guardado")
  })

  const restablecer = () => iniciar(async () => {
    if (!confirm(`¿Dar una contraseña temporal nueva a ${u.nombre}? Se cerrarán sus sesiones abiertas.`)) return
    const r = await restablecerContrasena(u.id)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    setTemporal((r.datos as { contrasenaTemporal: string }).contrasenaTemporal)
  })

  const desbloquear = () => iniciar(async () => {
    const r = await desbloquearUsuario(u.id)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Cuenta desbloqueada")
  })

  return (
    <>
      <tr>
        <td>
          <p className="font-medium">{u.nombre}</p>
          <p className="text-xs text-slate-500">{u.correo}</p>
          {u.debeCambiarContrasena && <p className="text-xs text-amber-700">Con contraseña temporal</p>}
          {!!u.minutosBloqueo && <p className="text-xs text-red-700">Bloqueada {u.minutosBloqueo} min por intentos fallidos</p>}
        </td>
        <td>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {(Object.keys(NOMBRES_ROLES) as CodigoRol[]).map(r => (
              <label key={r} className="flex items-center gap-1 whitespace-nowrap">
                <input type="checkbox" checked={roles.includes(r)} onChange={e => setRoles(x => (e.target.checked ? [...x, r] : x.filter(y => y !== r)))} /> {NOMBRES_ROLES[r]}
              </label>
            ))}
          </div>
        </td>
        <td><input type="number" min={1} value={capacidad} onChange={e => setCapacidad(e.target.value)} placeholder="Sin límite" className="campo w-28" /></td>
        <td><input type="checkbox" checked={activo} disabled={esUsted} onChange={e => setActivo(e.target.checked)} /></td>
        <td className="text-xs whitespace-nowrap">{u.ultimoIngreso}</td>
        <td>
          <div className="flex flex-col gap-1 items-start">
            <button disabled={!cambiado || pendiente} onClick={guardar} className="boton-primario py-1.5">Guardar</button>
            <button disabled={pendiente} onClick={restablecer} className="text-xs enlace whitespace-nowrap">Restablecer contraseña</button>
            {!!u.minutosBloqueo && <button disabled={pendiente} onClick={desbloquear} className="text-xs text-red-700 hover:underline">Desbloquear</button>}
          </div>
        </td>
      </tr>
      {temporal && (
        <tr><td colSpan={6}><ContrasenaTemporal correo={u.correo} contrasena={temporal} alCerrar={() => setTemporal(null)} /></td></tr>
      )}
    </>
  )
}
