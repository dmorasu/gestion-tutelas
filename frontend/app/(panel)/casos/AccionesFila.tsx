"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { Eye, Pencil, Trash2 } from "lucide-react"
import { actualizarActuacion, eliminarActuacion } from "./acciones"
import Modal from "@/components/ui/Modal"
import { CRITICIDADES, ESTADOS_ACTUACION, ETAPAS, isoDesdeLocal, valorFechaHoraLocal, yaEntregada } from "@/src/lib/formato"

type Persona = { id: number, nombre: string }
export type FilaAcciones = {
  id: number, etapa: string, estado: string, criticidad: string, fechaVencimientoInformada: string | null,
  auxiliarId: number | null, revisorId: number | null, caso: { id: number, numeroInterno: string | null }
}

// Acciones rápidas de una fila del tablero de casos: ver, editar lo básico y eliminar lo registrado por error
export default function AccionesFila({ a, puedeEditar, coordina, auxiliares, revisores }: {
  a: FilaAcciones, puedeEditar: boolean, coordina: boolean, auxiliares: Persona[], revisores: Persona[]
}) {
  const [editando, setEditando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const nombre = `${a.caso.numeroInterno ?? "Caso"} · ${ETAPAS[a.etapa]}`
  const entregada = yaEntregada(a.estado)

  const guardar = (d: FormData) => {
    const cambios: Record<string, unknown> = {
      estado: d.get("estado"),
      fechaVencimientoInformada: isoDesdeLocal(String(d.get("vence") ?? "")) || null
    }
    // Solo si cambió: enviarla la deja "puesta a mano" y el recálculo ya no la toca
    if (d.get("criticidad") !== a.criticidad) cambios.criticidad = d.get("criticidad")
    if (coordina) {
      const auxiliarId = Number(d.get("auxiliarId")) || null
      const revisorId = Number(d.get("revisorId")) || null
      if (auxiliarId !== a.auxiliarId) cambios.auxiliarId = auxiliarId
      if (revisorId !== a.revisorId) cambios.revisorId = revisorId
    }
    iniciar(async () => {
      const r = await actualizarActuacion(a.caso.id, a.id, cambios)
      if (!r.ok) return void toast.error(r.errores.join(". "))
      toast.success(`${nombre}: actualizado`)
      setEditando(false)
    })
  }

  const eliminar = (d: FormData) => iniciar(async () => {
    const r = await eliminarActuacion(a.id, String(d.get("motivo") ?? ""))
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success((r.datos as { casoEliminado: boolean }).casoEliminado ? "Caso eliminado" : "Actuación eliminada")
    setEliminando(false)
  })

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Link href={`/casos/${a.caso.id}?actuacion=${a.id}`} className="boton-icono" title="Ver" aria-label={`Ver ${nombre}`}><Eye size={15} /></Link>
      {puedeEditar && <button type="button" onClick={() => setEditando(true)} className="boton-icono" title="Editar" aria-label={`Editar ${nombre}`}><Pencil size={15} /></button>}
      {coordina && (
        <button type="button" onClick={() => setEliminando(true)} disabled={entregada} className="boton-icono-peligro"
          title={entregada ? "Ya se entregó a la entidad: se cierra, no se elimina" : "Eliminar"} aria-label={`Eliminar ${nombre}`}>
          <Trash2 size={15} />
        </button>
      )}

      <Modal abierto={editando} alCerrar={() => !pendiente && setEditando(false)} titulo="Editar actuación" subtitulo={nombre}>
        <form action={guardar} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="etiqueta">Criticidad</label>
            <select name="criticidad" defaultValue={a.criticidad} className="campo">
              {Object.entries(CRITICIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="etiqueta">Estado</label>
            <select name="estado" defaultValue={a.estado} className="campo">
              {Object.entries(ESTADOS_ACTUACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="etiqueta">Vencimiento informado por la entidad</label>
            <input type="datetime-local" name="vence" defaultValue={valorFechaHoraLocal(a.fechaVencimientoInformada)} className="campo" />
          </div>
          {coordina && (
            <>
              <div>
                <label className="etiqueta">Auxiliar</label>
                <select name="auxiliarId" defaultValue={a.auxiliarId ?? ""} className="campo">
                  <option value="">Sin asignar</option>
                  {auxiliares.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="etiqueta">Revisor</label>
                <select name="revisorId" defaultValue={a.revisorId ?? ""} className="campo">
                  <option value="">Sin asignar</option>
                  {revisores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => setEditando(false)} className="boton-secundario">Cancelar</button>
            <button disabled={pendiente} className="boton-primario">Guardar</button>
          </div>
        </form>
      </Modal>

      <Modal abierto={eliminando} alCerrar={() => !pendiente && setEliminando(false)} titulo="Eliminar actuación" subtitulo={nombre}>
        <form action={eliminar} className="space-y-4">
          <p className="text-xs text-slate-500">Para asignaciones registradas por error. Si es la única actuación del caso, se elimina el caso; el correo de la asignación vuelve a la bandeja.</p>
          <textarea name="motivo" required rows={3} maxLength={500} placeholder="Motivo" autoFocus className="campo" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEliminando(false)} className="boton-secundario">Cancelar</button>
            <button disabled={pendiente} className="boton-peligro"><Trash2 size={15} />Eliminar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
