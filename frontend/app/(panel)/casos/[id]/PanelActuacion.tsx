"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { actualizarActuacion, asumirActuacion } from "../acciones"
import clsx from "clsx"
import { MessageSquareText, Pencil, Scale, Timer } from "lucide-react"
import Semaforo from "@/components/ui/Semaforo"
import Seccion from "@/components/ui/Seccion"
import Dato from "@/components/ui/Dato"
import Criticidad from "@/components/ui/Criticidad"
import PanelTrabajo, { type ArchivoCaso, type Emergencia, type EscritoFila, type Insumo } from "./PanelTrabajo"
import type { ItemFicha } from "./componentes/FichaRevision"
import Fallos, { type DecisionFila } from "./componentes/Fallos"
import RutaActuacion from "./componentes/RutaActuacion"
import ClasificarNulidad from "./componentes/ClasificarNulidad"
import type { ItemMatriz } from "./componentes/Matriz"
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
  fechaAsumida?: string | null, fechaCierre?: string | null, radicaciones?: { fechaRadicacion: string }[]
  tipoRespuestaId?: number | null, datosSolicitados?: { nombre: string, recibido: boolean }[]
  origenNulidad?: boolean, fechaClasificacion?: string | null
  peticionIds?: number[], alcancePendiente?: boolean, emergencia?: Emergencia | null
}

type Props = {
  casoId: number, actuacion: ActuacionDetalle, gestiona: boolean, coordina: boolean, usuarioId: number, reasigna: "TODO" | "EQUIPO" | null,
  auxiliares: Responsable[], revisores: Responsable[], archivos: ArchivoCaso[]
  puedeTrabajar: boolean, puedeRevisar: boolean, puedePedirInsumos: boolean, puedeCerrar: boolean, motivosCierre: string[], sentidos: Record<string, string[]>, porDerechoPeticion?: boolean
  // Catálogos (reunión 18-nov): tipos de respuesta, matriz de insumos y documentos de la entrega
  tiposRespuesta: { id: number, nombre: string, activo?: boolean }[], matriz: ItemMatriz[], documentosEntrega: Record<string, string>, documentoDeEscrito: Record<string, string>
  // Ficha técnica (reunión 23-nov): hechos y derechos del caso y peticiones de la etapa
  caso: { resumenHechos: string | null, derechosIds: number[] }, derechos: ItemFicha[], peticiones: ItemFicha[], puedeRadicar: boolean
}

const FUENTE_CRITICIDAD: Record<string, string> = { ASUNTO: "la marcó la entidad", CALCULADA: "calculada", MANUAL: "puesta a mano" }

export default function PanelActuacion({ casoId, actuacion: a, gestiona, coordina, usuarioId, reasigna, auxiliares, revisores, archivos, puedeTrabajar, puedeRevisar, puedePedirInsumos, puedeCerrar, motivosCierre, sentidos, porDerechoPeticion, tiposRespuesta, matriz, documentosEntrega, documentoDeEscrito, caso, derechos, peticiones, puedeRadicar }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [editando, setEditando] = useState(false)
  const esResponsable = a.auxiliarId === usuarioId || a.revisorId === usuarioId
  const puedeEditar = gestiona || esResponsable || !!reasigna

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
      tipoRespuestaId: Number(datos.get("tipoRespuestaId")) || null,
      estado: datos.get("estado")
    }
    // Solo se envía si cambió: enviarla la deja "puesta a mano" y el recálculo ya no la toca
    if (datos.get("criticidad") !== a.criticidad) cambios.criticidad = datos.get("criticidad")
    if (reasigna) {
      const auxiliarId = Number(datos.get("auxiliarId")) || null
      if (auxiliarId !== a.auxiliarId) cambios.auxiliarId = auxiliarId
    }
    if (reasigna === "TODO") {
      const revisorId = Number(datos.get("revisorId")) || null
      if (revisorId !== a.revisorId) cambios.revisorId = revisorId
    }
    ejecutar(() => actualizarActuacion(casoId, a.id, cambios), "Actuación actualizada")
  }

  const limite = a.fechaLimiteEntrega
  const entregada = yaEntregada(a.estado)
  const tipoRespuesta = tiposRespuesta.find(t => t.id === a.tipoRespuestaId)?.nombre ?? null
  const peticionesElegidas = peticiones.filter(p => (a.peticionIds ?? []).includes(p.id)).map(p => p.nombre)
  const suspendido = a.datosFaltantesPendientes
    ? "El ANS está suspendido hasta que lleguen los datos faltantes de la asignación. El término judicial sigue corriendo."
    : a.requiereInsumos && !limite ? "El ANS está suspendido hasta que lleguen los insumos. El término judicial sigue corriendo." : null

  return (
    <div className="space-y-6">
      {/* ENCABEZADO: etapa, estado, lo que más importa (plazos y tipo de respuesta) y la ruta de pasos */}
      <section className="tarjeta overflow-hidden">
        <div className={clsx("h-1", BARRA_SEMAFORO[a.semaforo ?? "SIN_FECHA"] ?? "bg-slate-200")} />
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Actuación</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{ETAPAS[a.etapa]}</h3>
                <Criticidad valor={a.criticidad} />
                {a.semaforo && <Semaforo valor={a.semaforo} />}
                {a.origenNulidad && <span className="chip border-slate-300 bg-slate-100 text-slate-700">Llegó como nulidad</span>}
              </div>
              <p className="mt-1 text-sm text-slate-500">{ESTADOS_ACTUACION[a.estado]} · {tipoEscrito(a)}</p>
            </div>
            <div className="flex gap-2">
              {a.estado === "POR_ASUMIR" && (esResponsable || gestiona) && (
                <button disabled={pendiente} className="boton-primario py-1.5" onClick={() => ejecutar(() => asumirActuacion(casoId, a.id), "Actuación asumida")}>Asumir</button>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Indicador icono={<Timer size={15} />} titulo="Entrega a la entidad (ANS)" destacado
              valor={limite ? fechaHora(limite) : a.requiereInsumos ? "Suspendido" : "Sin fecha"}
              pie={limite ? (entregada ? "Ya se entregó" : tiempoRestante(limite)) : a.requiereInsumos ? "Esperando insumos" : null} />
            <Indicador icono={<Scale size={15} />} titulo="Vencimiento judicial" valor={a.fechaVencimiento ? fechaHora(a.fechaVencimiento) : "Sin fecha"}
              pie={a.fechaVencimiento ? (a.fechaVencimientoInformada ? "Informado por la entidad" : "Calculado con el término") : null} />
            <Indicador icono={<MessageSquareText size={15} />} titulo="Tipo de respuesta" valor={tipoRespuesta ?? "Sin definir"}
              pie={a.requiereInsumos ? "Requiere insumos" : "Sin insumos"} apagado={!tipoRespuesta} />
          </div>

          {suspendido && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{suspendido}</p>}
          {a.etapa === "NULIDAD" && a.estado !== "CERRADA" && <ClasificarNulidad casoId={casoId} actuacionId={a.id} puede={puedeTrabajar} />}

          <div className="mt-2 border-t border-slate-100 pt-1">
            <RutaActuacion actuacion={a} archivos={archivos} />
          </div>
        </div>
      </section>

      {/* DATOS DE LA ACTUACIÓN (y su edición en el mismo lugar) */}
      <Seccion titulo="Datos de la actuación"
        acciones={puedeEditar && !editando ? <button className="boton-secundario py-1.5 text-xs" onClick={() => setEditando(true)}><Pencil size={13} />Editar</button> : null}>
        {!editando ? (
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
            <Dato etiqueta="Asignada (correo)" valor={fechaHora(a.fechaAsignacion)} />
            <Dato etiqueta="Cuenta desde (corte 3 p. m.)" valor={fechaHora(a.fechaAsignacionEfectiva)} />
            <Dato etiqueta="Notificación" valor={a.fechaNotificacion ? fechaHora(a.fechaNotificacion) : null} />
            <Dato etiqueta="Término" valor={a.terminoValor ? `${a.terminoValor} ${UNIDADES_TERMINO[a.terminoUnidad ?? ""]?.toLowerCase() ?? ""}` : null} />
            <Dato etiqueta="Criticidad" valor={`${CRITICIDADES[a.criticidad] ?? a.criticidad}${a.criticidadFuente ? ` · ${FUENTE_CRITICIDAD[a.criticidadFuente]}` : ""}`} />
            <Dato etiqueta="Escrito" valor={tipoEscrito(a)} />
            {a.tipoPeticion && <Dato etiqueta="Tipo de petición" valor={TIPOS_PETICION[a.tipoPeticion] ?? a.tipoPeticion} />}
            {a.origenNulidad && <Dato etiqueta="Nulidad clasificada" valor={fechaHora(a.fechaClasificacion)} />}
            {(peticionesElegidas.length > 0 || a.loQueSePide) && (
              <Dato etiqueta="Petición al despacho" className="sm:col-span-3"
                valor={<span className="whitespace-pre-line">{[...peticionesElegidas, a.loQueSePide].filter(Boolean).join("\n")}</span>} />
            )}
            {porDerechoPeticion && a.etapa === "ACCION" && (
              <p className="text-xs text-slate-600 sm:col-span-3">Tutela por derecho de petición: la contestación pide al juez hecho superado con la respuesta de la PQRS ligada (pestaña Información).</p>
            )}
          </dl>
        ) : (
        <form action={guardar} className="grid gap-3 text-sm sm:grid-cols-3">
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
          {reasigna && (
            <div>
              <label className="etiqueta">Auxiliar</label>
              <select name="auxiliarId" defaultValue={a.auxiliarId ?? ""} className="campo">
                {(reasigna === "TODO" || !a.auxiliarId) && <option value="">— Sin asignar —</option>}
                {auxiliares.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
          )}
          {reasigna === "TODO" && (
            <div>
              <label className="etiqueta">Revisor</label>
              <select name="revisorId" defaultValue={a.revisorId ?? ""} className="campo">
                <option value="">— Sin asignar —</option>
                {revisores.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="etiqueta">Tipo de respuesta</label>
            <select name="tipoRespuestaId" defaultValue={a.tipoRespuestaId ?? ""} className="campo">
              <option value="">— Sin definir —</option>
              {tiposRespuesta.filter(t => t.activo !== false || t.id === a.tipoRespuestaId).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="flex flex-col justify-end gap-1">
            <label className="flex items-center gap-2"><input type="checkbox" name="requiereInsumos" defaultChecked={a.requiereInsumos} /> Requiere insumos</label>
          </div>
          <div className="sm:col-span-3">
            <label className="etiqueta">Petición al despacho (precisión u otra)</label>
            <textarea name="loQueSePide" rows={2} defaultValue={a.loQueSePide ?? ""} className="campo" />
          </div>
          <div className="sm:col-span-3 flex gap-2 justify-end">
            <button type="button" className="boton-secundario" onClick={() => setEditando(false)}>Cancelar</button>
            <button disabled={pendiente} className="boton-primario">Guardar</button>
          </div>
        </form>
        )}
      </Seccion>

      <PanelTrabajo
        casoId={casoId}
        actuacion={a}
        archivos={archivos}
        puedeTrabajar={puedeTrabajar}
        puedeRevisar={puedeRevisar}
        puedePedirInsumos={puedePedirInsumos}
        puedePedirDatos={gestiona}
        matriz={matriz}
        documentosEntrega={documentosEntrega}
        documentoSugerido={documentoDeEscrito[a.etapa === "IMPUGNACION" && a.origenImpugnacion === "ACCIONANTE" ? "DESCORRE" : a.etapa] ?? null}
        puedeCerrar={puedeCerrar}
        puedeRadicar={puedeRadicar}
        motivosCierre={motivosCierre}
        tipoEscrito={tipoEscrito(a)}
        ficha={{ resumenHechos: caso.resumenHechos, derechosIds: caso.derechosIds, peticionIds: a.peticionIds ?? [], loQueSePide: a.loQueSePide }}
        derechos={derechos}
        peticiones={peticiones}
      />
      {["ACCION", "IMPUGNACION", "DESACATO"].includes(a.etapa) && (
        <Fallos casoId={casoId} actuacionId={a.id} decisiones={a.decisiones ?? []} sentidos={sentidos} puedeRegistrar={puedeTrabajar} coordina={coordina} />
      )}
    </div>
  )
}

// Color de la franja superior según el semáforo: se ve de lejos cómo va la actuación
const BARRA_SEMAFORO: Record<string, string> = {
  VENCIDO: "bg-red-700", ROJO: "bg-red-500", AMARILLO: "bg-amber-400", VERDE: "bg-emerald-500", SIN_FECHA: "bg-slate-200", ENTREGADO: "bg-slate-400"
}

// Un indicador grande del encabezado (plazo o dato clave) con una línea de contexto
function Indicador({ icono, titulo, valor, pie, destacado, apagado }: { icono: React.ReactNode, titulo: string, valor: string, pie?: string | null, destacado?: boolean, apagado?: boolean }) {
  return (
    <div className={clsx("rounded-lg border px-4 py-3", destacado ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-slate-50/60")}>
      <p className={clsx("flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide", destacado ? "text-slate-300" : "text-slate-400")}>{icono}{titulo}</p>
      <p className={clsx("mt-1.5 text-sm font-semibold", destacado ? "text-white" : apagado ? "text-slate-400" : "text-slate-800")}>{valor}</p>
      {pie && <p className={clsx("mt-0.5 text-xs", destacado ? "text-slate-300" : "text-slate-500")}>{pie}</p>}
    </div>
  )
}
