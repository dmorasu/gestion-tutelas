"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { actualizarActuacion, asumirActuacion } from "../acciones"
import Semaforo from "@/components/ui/Semaforo"
import { ESTADOS_ACTUACION, ETAPAS, UNIDADES_TERMINO, fechaHora, isoDesdeLocal, tiempoRestante, valorFechaHoraLocal } from "@/src/lib/formato"

export type Responsable = { id: number, nombre: string }
export type ActuacionDetalle = {
  id: number, etapa: string, estado: string, semaforo: string | null,
  fechaAsignacion: string, fechaAsignacionEfectiva: string | null, fechaNotificacion: string | null,
  terminoValor: number | null, terminoUnidad: string | null, fechaVencimiento: string | null, fechaLimiteEntrega: string | null,
  auxiliarId: number | null, abogadoId: number | null, requiereRevisionAbogado: boolean, requiereInsumos: boolean, loQueSePide: string | null,
  auxiliar: Responsable | null, abogado: Responsable | null
}

type Props = {
  casoId: number, actuacion: ActuacionDetalle, gestiona: boolean, usuarioId: number,
  auxiliares: Responsable[], abogados: Responsable[], archivos: { id: number, nombre: string }[]
}

export default function PanelActuacion({ casoId, actuacion: a, gestiona, usuarioId, auxiliares, abogados, archivos }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [editando, setEditando] = useState(false)
  const esResponsable = a.auxiliarId === usuarioId || a.abogadoId === usuarioId
  const puedeEditar = gestiona || esResponsable

  const ejecutar = (fn: () => Promise<{ ok: boolean, errores?: string[] }>, mensaje: string) =>
    iniciar(async () => {
      const r = await fn()
      if (!r.ok) return void toast.error(r.errores?.join(". "))
      toast.success(mensaje)
      setEditando(false)
    })

  const guardar = (datos: FormData) => {
    const cambios: Record<string, unknown> = {
      fechaNotificacion: isoDesdeLocal(String(datos.get("fechaNotificacion") ?? "")),
      terminoValor: Number(datos.get("terminoValor")) || null,
      terminoUnidad: datos.get("terminoUnidad") || null,
      requiereInsumos: datos.get("requiereInsumos") === "on",
      requiereRevisionAbogado: datos.get("requiereRevisionAbogado") === "on",
      loQueSePide: datos.get("loQueSePide") || null,
      estado: datos.get("estado")
    }
    if (gestiona) {
      cambios.auxiliarId = Number(datos.get("auxiliarId")) || null
      cambios.abogadoId = Number(datos.get("abogadoId")) || null
    }
    ejecutar(() => actualizarActuacion(casoId, a.id, cambios), "Actuación actualizada")
  }

  return (
    <section className="tarjeta p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{ETAPAS[a.etapa]}</h3>
          <span className="text-sm text-slate-600">{ESTADOS_ACTUACION[a.estado]}</span>
          {a.semaforo && <Semaforo valor={a.semaforo} />}
        </div>
        <div className="flex gap-2">
          {a.estado === "POR_ASUMIR" && (esResponsable || gestiona) && (
            <button disabled={pendiente} className="boton-primario py-1.5" onClick={() => ejecutar(() => asumirActuacion(casoId, a.id), "Actuación asumida")}>Asumir</button>
          )}
          {puedeEditar && !editando && <button className="boton-secundario py-1.5" onClick={() => setEditando(true)}>Editar</button>}
        </div>
      </div>

      {!editando ? (
        <dl className="mt-4 grid sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
          <Dato nombre="Asignación (correo)" valor={fechaHora(a.fechaAsignacion)} />
          <Dato nombre="Cuenta desde (corte D1)" valor={fechaHora(a.fechaAsignacionEfectiva)} />
          <Dato nombre="Notificación" valor={fechaHora(a.fechaNotificacion)} />
          <Dato nombre="Término" valor={a.terminoValor ? `${a.terminoValor} ${UNIDADES_TERMINO[a.terminoUnidad ?? ""]?.toLowerCase() ?? ""}` : "—"} />
          <Dato nombre="Vencimiento judicial" valor={fechaHora(a.fechaVencimiento)} />
          <Dato nombre="Límite de entrega (ANS)" valor={`${fechaHora(a.fechaLimiteEntrega)}${a.fechaLimiteEntrega && a.estado !== "CERRADA" ? ` · ${tiempoRestante(a.fechaLimiteEntrega)}` : ""}`} destacado />
          <Dato nombre="Auxiliar" valor={a.auxiliar?.nombre ?? "Sin asignar"} />
          <Dato nombre="Abogado" valor={a.abogado?.nombre ?? (a.requiereRevisionAbogado ? "Sin asignar" : "No requiere")} />
          <Dato nombre="Insumos" valor={a.requiereInsumos ? "Requiere" : "No requiere"} />
          {a.loQueSePide && <div className="sm:col-span-3"><Dato nombre="Lo que se pide al juez" valor={a.loQueSePide} /></div>}
          {a.requiereInsumos && !a.fechaLimiteEntrega && ["CUMPLIMIENTO", "REQUERIMIENTO_PREVIO", "DESACATO"].includes(a.etapa) && (
            <p className="sm:col-span-3 text-xs text-amber-700">El ANS empieza a contar cuando lleguen los insumos (supuesto D6).</p>
          )}
        </dl>
      ) : (
        <form action={guardar} className="mt-4 grid sm:grid-cols-3 gap-3 text-sm">
          <div>
            <label className="etiqueta">Notificación</label>
            <input type="datetime-local" name="fechaNotificacion" defaultValue={valorFechaHoraLocal(a.fechaNotificacion)} className="campo" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="etiqueta">Término</label>
              <input type="number" min={1} name="terminoValor" defaultValue={a.terminoValor ?? ""} className="campo" />
            </div>
            <div>
              <label className="etiqueta">Unidad</label>
              <select name="terminoUnidad" defaultValue={a.terminoUnidad ?? "DIAS_HABILES"} className="campo px-2">
                {Object.entries(UNIDADES_TERMINO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="etiqueta">Estado</label>
            <select name="estado" defaultValue={a.estado} className="campo">
              {Object.entries(ESTADOS_ACTUACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {gestiona && (
            <>
              <div>
                <label className="etiqueta">Auxiliar</label>
                <select name="auxiliarId" defaultValue={a.auxiliarId ?? ""} className="campo">
                  <option value="">— Sin asignar —</option>
                  {auxiliares.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="etiqueta">Abogado</label>
                <select name="abogadoId" defaultValue={a.abogadoId ?? ""} className="campo">
                  <option value="">— Sin asignar —</option>
                  {abogados.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="flex flex-col justify-end gap-1">
            <label className="flex items-center gap-2"><input type="checkbox" name="requiereInsumos" defaultChecked={a.requiereInsumos} /> Requiere insumos</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="requiereRevisionAbogado" defaultChecked={a.requiereRevisionAbogado} /> Revisión de abogado</label>
          </div>
          <div className="sm:col-span-3">
            <label className="etiqueta">Lo que se pide al juez</label>
            <textarea name="loQueSePide" rows={2} defaultValue={a.loQueSePide ?? ""} className="campo" />
          </div>
          <div className="sm:col-span-3 flex gap-2 justify-end">
            <button type="button" className="boton-secundario" onClick={() => setEditando(false)}>Cancelar</button>
            <button disabled={pendiente} className="boton-primario">Guardar</button>
          </div>
        </form>
      )}

      {archivos.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {archivos.map(x => (
            <li key={x.id}><a href={`/archivos/${x.id}`} target="_blank" className="inline-block rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">📎 {x.nombre}</a></li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Dato({ nombre, valor, destacado }: { nombre: string, valor: string, destacado?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{nombre}</dt>
      <dd className={destacado ? "font-semibold text-slate-900" : ""}>{valor}</dd>
    </div>
  )
}
