"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { atenderRespuesta } from "../acciones"
import { FormRespuesta } from "../../casos/[id]/PanelTrabajo"
import BotonAtendido from "./BotonAtendido"

export type Contexto = {
  actuacion: { id: number, etapa: string, estado: string } | null
  insumosPendientes: { id: number, descripcion: string, minimo: boolean }[]
  escrito: { id: number, version: number, estado: string } | null
  motivos: { id: number, nombre: string }[]
}

type Props = { correoId: number, casoId: number, proposito: string | null, contexto: Contexto, sugerencia: string | null }

// Atender desde el correo la respuesta que llegó: la hora que queda es la de llegada del correo
export default function AtenderRespuesta({ correoId, casoId, proposito, contexto, sugerencia }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [marcados, setMarcados] = useState(contexto.insumosPendientes.map(i => i.id))
  const [acuse, setAcuse] = useState(true)
  const actuacionId = contexto.actuacion?.id

  const ejecutar = (ruta: string, cuerpo: Record<string, unknown>, mensaje: string) => iniciar(async () => {
    const r = await atenderRespuesta(correoId, casoId, ruta, cuerpo)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success(mensaje)
  })

  const caja = "rounded border border-amber-300 bg-amber-50 p-3 space-y-3 text-amber-950"

  if (proposito === "RESPUESTA_ENTREGA" && actuacionId && contexto.escrito?.estado === "ENTREGADO") {
    return (
      <div className={caja}>
        <p className="text-sm font-medium">Respuesta a la entrega de la V{contexto.escrito.version}</p>
        <FormRespuesta pendiente={pendiente} sugerencia={sugerencia} motivos={contexto.motivos} conFecha={false}
          enviar={c => ejecutar(`/casos/actuaciones/${actuacionId}/respuesta`, { ...c, correoId }, "Respuesta registrada")} />
      </div>
    )
  }

  if (proposito === "RESPUESTA_INSUMOS" && actuacionId && contexto.insumosPendientes.length) {
    return (
      <div className={caja}>
        <p className="text-sm font-medium">¿Qué insumos llegaron en este correo?</p>
        <ul className="space-y-1 text-sm">
          {contexto.insumosPendientes.map(i => (
            <li key={i.id}>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={marcados.includes(i.id)} onChange={e => setMarcados(m => (e.target.checked ? [...m, i.id] : m.filter(x => x !== i.id)))} />
                {i.descripcion}
              </label>
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acuse} onChange={e => setAcuse(e.target.checked)} /> Confirmar el recibido al cliente</label>
        <button disabled={pendiente} className="boton-primario py-1.5"
          onClick={() => ejecutar(`/casos/actuaciones/${actuacionId}/insumos/recibidos`, { insumoIds: marcados, correoId, enviarAcuse: acuse }, "Insumos registrados")}>
          Registrar recepción
        </button>
      </div>
    )
  }

  if (proposito === "RESPUESTA_DATOS_FALTANTES") {
    return (
      <div className={caja}>
        <p className="text-sm font-medium">Datos faltantes recibidos</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acuse} onChange={e => setAcuse(e.target.checked)} /> Confirmar el recibido al cliente</label>
        <button disabled={pendiente} className="boton-primario py-1.5"
          onClick={() => ejecutar(`/correos/${correoId}/datos-faltantes-recibidos`, { enviarAcuse: acuse }, "Recibido confirmado")}>
          Registrar
        </button>
      </div>
    )
  }

  return <BotonAtendido correoId={correoId} />
}
