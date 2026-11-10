"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { actualizarActuacion, asumirActuacion } from "../acciones"
import Semaforo from "@/components/ui/Semaforo"
import Criticidad from "@/components/ui/Criticidad"
import PanelTrabajo, { type ArchivoCaso, type EscritoFila, type Insumo } from "./PanelTrabajo"
import Fallos, { type DecisionFila } from "./componentes/Fallos"
import { CRITICIDADES, ESTADOS_ACTUACION, ETAPAS, TIPOS_PETICION, UNIDADES_TERMINO, fechaHora, isoDesdeLocal, tiempoRestante, tipoEscrito, valorFechaHoraLocal, yaEntregada } from "@/src/lib/formato"

export type Responsable = { id: number, nombre: string }
export type ActuacionDetalle = {
  id: number, etapa: string, estado: string, semaforo: string | null, criticidad: string, criticidadFuente: string | null,
  fechaAsignacion: string, fechaAsignacionEfectiva: string | null, fechaNotificacion: string | null,
  terminoValor: number | null, terminoUnidad: string | null, fechaVencimientoInformada: string | null, fechaVencimiento: string | null, fechaLimiteEntrega: string | null,
  auxiliarId: number | null, revisorId: number | null, requiereInsumos: boolean, loQueSePide: string | null,
  origenImpugnacion: string | null, datosFaltantesPendientes: boolean, decisiones: DecisionFila[], tipoPeticion: string | null,
  auxiliar: Responsable | null, revisor: Responsable | null, equipo: { id: number, nombre: string } | null
  insumos: Insumo[], escritos: EscritoFila[]
}

type Props = {
  casoId: number, actuacion: ActuacionDetalle, gestiona: boolean, coordina: boolean, usuarioId: number,
  auxiliares: Responsable[], revisores: Responsable[], archivos: ArchivoCaso[]
  puedeTrabajar: boolean, puedeRevisar: boolean, puedeCerrar: boolean, motivosCierre: string[], sentidos: Record<string, string[]>, porDerechoPeticion?: boolean
}

const FUENTE_CRITICIDAD: Record<string, string> = { ASUNTO: "la marcó la entidad", CALCULADA: "calculada", MANUAL: "puesta a mano" }

export default function PanelActuacion({ casoId, actuacion: a, gestiona, coordina, usuarioId, auxiliares, revisores, archivos, puedeTrabajar, puedeRevisar, puedeCerrar, motivosCierre, sentidos, porDerechoPeticion }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [editando, setEditando] = useState(false)
  const esResponsable = a.auxiliarId === usuarioId || a.revisorId === usuarioId
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
      fechaVencimientoInformada: isoDesdeLocal(String(datos.get("fechaVencimientoInformada") ?? "")),
      requiereInsumos: datos.get("requiereInsumos") === "on",
      loQueSePide: datos.get("loQueSePide") || null,
      estado: datos.get("estado")
    }
    // Solo se envía si cambió: enviarla la deja "puesta a mano" y el recálculo ya no la toca
    if (datos.get("criticidad") !== a.criticidad) cambios.criticidad = datos.get("criticidad")
    if (coordina) {
      const auxiliarId = Number(datos.get("auxiliarId")) || null
      const revisorId = Number(datos.get("revisorId")) || null
      if (auxiliarId !== a.auxiliarId) cambios.auxiliarId = auxiliarId
      if (revisorId !== a.revisorId) cambios.revisorId = revisorId
    }
    ejecutar(() => actualizarActuacion(casoId, a.id, cambios), "Actuación actualizada")
  }

  return (
    <section className="tarjeta p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">{ETAPAS[a.etapa]}</h3>
          <Criticidad valor={a.criticidad} />
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
          <Dato nombre="Cuenta desde (corte de las 3 p. m.)" valor={fechaHora(a.fechaAsignacionEfectiva)} />
          <Dato nombre="Notificación" valor={fechaHora(a.fechaNotificacion)} />
          <Dato nombre="Término" valor={a.terminoValor ? `${a.terminoValor} ${UNIDADES_TERMINO[a.terminoUnidad ?? ""]?.toLowerCase() ?? ""}` : "—"} />
          <Dato nombre={a.fechaVencimientoInformada ? "Vencimiento (informado por la entidad)" : "Vencimiento judicial"} valor={fechaHora(a.fechaVencimiento)} />
          <Dato nombre="Límite de entrega (ANS)" valor={`${fechaHora(a.fechaLimiteEntrega)}${a.fechaLimiteEntrega && !yaEntregada(a.estado) ? ` · ${tiempoRestante(a.fechaLimiteEntrega)}` : ""}`} destacado />
          <Dato nombre="Auxiliar" valor={a.auxiliar?.nombre ?? "Sin asignar"} />
          <Dato nombre="Revisor" valor={`${a.revisor?.nombre ?? "Sin asignar"}${a.equipo ? ` · ${a.equipo.nombre}` : ""}`} />
          <Dato nombre="Criticidad" valor={`${CRITICIDADES[a.criticidad] ?? a.criticidad}${a.criticidadFuente ? ` (${FUENTE_CRITICIDAD[a.criticidadFuente]})` : ""}`} />
          <Dato nombre="Insumos" valor={a.requiereInsumos ? "Requiere" : "No requiere"} />
          <Dato nombre="Escrito" valor={tipoEscrito(a)} />
          {a.tipoPeticion && <Dato nombre="Tipo de petición" valor={TIPOS_PETICION[a.tipoPeticion] ?? a.tipoPeticion} />}
          {porDerechoPeticion && a.etapa === "ACCION" && (
            <p className="sm:col-span-3 text-xs text-slate-600">Tutela por derecho de petición: la contestación pide al juez hecho superado con la respuesta de la PQRS ligada (pestaña Información).</p>
          )}
          {a.loQueSePide && <div className="sm:col-span-3"><Dato nombre="Lo que se pide al juez" valor={a.loQueSePide} /></div>}
          {a.datosFaltantesPendientes && (
            <p className="sm:col-span-3 text-xs text-amber-700">El ANS está suspendido hasta que lleguen los datos faltantes de la asignación. El término judicial sigue corriendo.</p>
          )}
          {a.requiereInsumos && !a.datosFaltantesPendientes && !a.fechaLimiteEntrega && (
            <p className="sm:col-span-3 text-xs text-amber-700">El ANS está suspendido hasta que lleguen los insumos. El término judicial sigue corriendo.</p>
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
            <label className="etiqueta">Vencimiento informado por la entidad</label>
            <input type="datetime-local" name="fechaVencimientoInformada" defaultValue={valorFechaHoraLocal(a.fechaVencimientoInformada)} className="campo" />
          </div>
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
          {coordina && (
            <>
              <div>
                <label className="etiqueta">Auxiliar</label>
                <select name="auxiliarId" defaultValue={a.auxiliarId ?? ""} className="campo">
                  <option value="">— Sin asignar —</option>
                  {auxiliares.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="etiqueta">Revisor</label>
                <select name="revisorId" defaultValue={a.revisorId ?? ""} className="campo">
                  <option value="">— Sin asignar —</option>
                  {revisores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="flex flex-col justify-end gap-1">
            <label className="flex items-center gap-2"><input type="checkbox" name="requiereInsumos" defaultChecked={a.requiereInsumos} /> Requiere insumos</label>
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

      <PanelTrabajo
        casoId={casoId}
        actuacion={a}
        archivos={archivos}
        puedeTrabajar={puedeTrabajar}
        puedeRevisar={puedeRevisar}
        puedeCerrar={puedeCerrar}
        motivosCierre={motivosCierre}
        tipoEscrito={tipoEscrito(a)}
      />
      {["ACCION", "IMPUGNACION", "DESACATO"].includes(a.etapa) && (
        <div className="mt-5">
          <Fallos casoId={casoId} actuacionId={a.id} decisiones={a.decisiones ?? []} sentidos={sentidos} puedeRegistrar={puedeTrabajar} coordina={coordina} />
        </div>
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
