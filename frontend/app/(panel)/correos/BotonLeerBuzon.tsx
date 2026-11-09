"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-toastify"
import { leerBuzon } from "./acciones"

export default function BotonLeerBuzon() {
  const [pendiente, iniciar] = useTransition()
  const router = useRouter()
  return (
    <button
      disabled={pendiente}
      className="boton-secundario"
      onClick={() => iniciar(async () => {
        const r = await leerBuzon()
        if (!r.ok) return void toast.error(r.errores.join(". "))
        toast.success("Lectura del buzón en curso. Actualice en unos segundos.")
        setTimeout(() => router.refresh(), 8000)
      })}
    >
      Leer buzón ahora
    </button>
  )
}
