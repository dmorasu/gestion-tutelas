"use client"

import { useActionState, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "react-toastify"
import { Mail, LockKeyhole, LogIn } from "lucide-react"
import { iniciarSesion } from "./acciones"

const claseLabel = "flex items-center gap-2 text-xs font-semibold text-slate-600"

function BotonIngresar() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="boton-primario w-full focus:outline-none focus:ring-2 focus:ring-slate-300">
      <LogIn size={15} />
      {pending ? "Ingresando..." : "Iniciar sesión"}
    </button>
  )
}

export default function FormLogin() {
  // { error, intento }: el intento hace que el mismo error se vuelva a avisar
  const [estado, accion] = useActionState(iniciarSesion, null)

  useEffect(() => {
    if (estado?.error) toast.error(estado.error)
  }, [estado])

  return (
    <form action={accion} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="correo" className={claseLabel}><Mail size={14} className="text-slate-400" />Correo electrónico</label>
        <input id="correo" name="correo" type="email" placeholder="correo@empresa.com" autoComplete="username" defaultValue={estado?.correo} className="campo" />
      </div>
      <div className="space-y-2">
        <label htmlFor="contrasena" className={claseLabel}><LockKeyhole size={14} className="text-slate-400" />Contraseña</label>
        <input id="contrasena" name="contrasena" type="password" placeholder="Ingresa tu contraseña" autoComplete="current-password" className="campo" />
      </div>
      <BotonIngresar />
    </form>
  )
}
