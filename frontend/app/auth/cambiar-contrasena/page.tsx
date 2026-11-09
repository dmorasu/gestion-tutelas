import Link from "next/link"
import { obtenerSesion } from "@/src/auth/dal"
import FormCambio from "./FormCambio"

export default async function CambiarContrasenaPage() {
  const sesion = await obtenerSesion({ permitirTemporal: true })
  return (
    <div className="w-full max-w-md">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-800">Cambiar contraseña</h1>
        <p className="mt-2 text-xs text-slate-400">{sesion.correo}</p>
        <div className="mt-6 h-px w-full bg-slate-200" />
      </div>
      {sesion.debeCambiarContrasena && (
        <p className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Está usando una contraseña temporal. Cree la suya para continuar.</p>
      )}
      <FormCambio />
      <div className="mt-5 flex justify-between text-xs">
        {!sesion.debeCambiarContrasena ? <Link href="/inicio" className="enlace">Volver</Link> : <span />}
        <form action="/auth/salir" method="post"><button className="text-slate-400 hover:text-slate-600">Cerrar sesión</button></form>
      </div>
    </div>
  )
}
