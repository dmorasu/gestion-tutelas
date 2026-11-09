"use client"

import { useActionState, useState } from "react"
import clsx from "clsx"
import { Check, Dot, KeyRound } from "lucide-react"
import { cambiarContrasena } from "./acciones"
import { REGLAS_CONTRASENA } from "@/src/auth/politicaContrasena"

export default function FormCambio() {
  const [errores, accion, enviando] = useActionState(cambiarContrasena, null)
  const [nueva, setNueva] = useState("")
  const cumple = REGLAS_CONTRASENA.every(r => r.cumple(nueva))

  return (
    <form action={accion} className="space-y-5">
      <div>
        <label className="etiqueta" htmlFor="contrasenaActual">Contraseña actual</label>
        <input id="contrasenaActual" name="contrasenaActual" type="password" required autoComplete="current-password" className="campo" />
      </div>
      <div>
        <label className="etiqueta" htmlFor="contrasena">Contraseña nueva</label>
        <input id="contrasena" name="contrasena" type="password" required autoComplete="new-password" value={nueva} onChange={e => setNueva(e.target.value)} className="campo" />
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          {REGLAS_CONTRASENA.map(r => (
            <li key={r.texto} className={clsx("flex items-center gap-1", r.cumple(nueva) ? "text-emerald-600" : "text-slate-400")}>
              {r.cumple(nueva) ? <Check size={12} /> : <Dot size={12} />} {r.texto}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <label className="etiqueta" htmlFor="confirmacion">Repita la contraseña nueva</label>
        <input id="confirmacion" name="confirmacion" type="password" required autoComplete="new-password" className="campo" />
      </div>
      {errores && (
        <ul className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errores.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
      <button disabled={enviando || !cumple} className="boton-primario w-full">
        <KeyRound size={15} />
        {enviando ? "Guardando..." : "Guardar contraseña"}
      </button>
    </form>
  )
}
