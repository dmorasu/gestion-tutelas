"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "react-toastify"
import { crearUsuario } from "./acciones"
import { NOMBRES_ROLES, type CodigoRol } from "@/src/auth/permisos"
import ContrasenaTemporal from "@/components/ui/ContrasenaTemporal"

// Sin registro público: el administrador crea la cuenta y entrega la contraseña temporal
export default function NuevoUsuario() {
  const [pendiente, iniciar] = useTransition()
  const [roles, setRoles] = useState<string[]>([])
  const [creado, setCreado] = useState<{ correo: string, contrasena: string } | null>(null)
  const formulario = useRef<HTMLFormElement>(null)

  const crear = (datos: FormData) => iniciar(async () => {
    const correo = String(datos.get("correo"))
    const r = await crearUsuario(String(datos.get("nombre")), correo, roles)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    setCreado({ correo, contrasena: (r.datos as { contrasenaTemporal: string }).contrasenaTemporal })
    setRoles([])
    formulario.current?.reset()
  })

  return (
    <div className="space-y-3">
      <form ref={formulario} action={crear} className="tarjeta p-3 space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[12rem]"><label className="etiqueta">Nombre</label><input name="nombre" required className="campo" /></div>
          <div className="flex-1 min-w-[14rem]"><label className="etiqueta">Correo</label><input name="correo" type="email" required className="campo" /></div>
          <button disabled={pendiente} className="boton-primario">Crear usuario</button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-slate-500">Perfiles:</span>
          {(Object.keys(NOMBRES_ROLES) as CodigoRol[]).map(r => (
            <label key={r} className="flex items-center gap-1">
              <input type="checkbox" checked={roles.includes(r)} onChange={e => setRoles(x => (e.target.checked ? [...x, r] : x.filter(y => y !== r)))} /> {NOMBRES_ROLES[r]}
            </label>
          ))}
        </div>
      </form>
      {creado && <ContrasenaTemporal correo={creado.correo} contrasena={creado.contrasena} alCerrar={() => setCreado(null)} />}
    </div>
  )
}
