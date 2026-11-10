"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { Plus } from "lucide-react"
import { crearEquipo } from "./acciones"
import { ETAPAS_EQUIPO } from "./TarjetaEquipo"
import Modal from "@/components/ui/Modal"

export default function NuevoEquipo() {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const [etapas, setEtapas] = useState<string[]>([])

  const crear = (datos: FormData) => iniciar(async () => {
    const r = await crearEquipo(String(datos.get("nombre")), etapas)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Equipo creado")
    setEtapas([])
    setAbierto(false)
  })

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="boton-primario"><Plus size={15} />Nuevo equipo</button>
      <Modal abierto={abierto} alCerrar={() => !pendiente && setAbierto(false)} titulo="Nuevo equipo">
        <form action={crear} className="space-y-4">
          <div><label className="etiqueta">Nombre</label><input name="nombre" required autoFocus className="campo" /></div>
          <div>
            <label className="etiqueta">Etapas que atiende</label>
            <div className="flex flex-wrap gap-1.5">
              {ETAPAS_EQUIPO.map(([k, v]) => (
                <button key={k} type="button" className="opcion" aria-pressed={etapas.includes(k)}
                  onClick={() => setEtapas(x => (x.includes(k) ? x.filter(y => y !== k) : [...x, k]))}>{v}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setAbierto(false)} className="boton-secundario">Cancelar</button>
            <button disabled={pendiente} className="boton-primario">Crear equipo</button>
          </div>
        </form>
      </Modal>
    </>
  )
}
