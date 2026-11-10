"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { pasoActuacion } from "../acciones"
import Documento, { type DocumentoFila } from "@/components/ui/Documento"
import SubirArchivos from "./SubirArchivos"
import { TIPOS_DEVOLUCION, fechaHora, isoDesdeLocal } from "@/src/lib/formato"

export type Insumo = { id: number, descripcion: string, minimo: boolean, fechaSolicitud: string | null, fechaLimite: string | null, fechaRecepcion: string | null }
export type DevolucionFila = {
  id: number, tipo: string, observacion: string | null, fechaDevolucion: string, fechaLimiteCorreccion: string | null,
  fechaNuevaEntrega: string | null, extemporanea: boolean, motivo: { nombre: string } | null
}
export type EscritoFila = {
  id: number, version: number, estado: string, observacionRevision: string | null, fechaEnvioRevision: string | null,
  fechaEntregaEntidad: string | null, fechaAcuse: string | null, fechaAprobacion: string | null, enlace: string | null, devoluciones: DevolucionFila[]
}
export type ArchivoCaso = DocumentoFila & { tipo: string, escritoId: number | null, actuacionId: number | null }

type Props = {
  casoId: number
  actuacion: { id: number, estado: string, insumos: Insumo[], escritos: EscritoFila[] }
  archivos: ArchivoCaso[]
  puedeTrabajar: boolean
  puedeRevisar: boolean
  puedeCerrar: boolean
  motivosCierre: string[]
}

// Cómo se nombra cada documento dentro de la versión del escrito
const PREFIJO_DOC: Record<string, string> = { ANEXO: "Anexo · ", RESPUESTA: "Respuesta de la entidad · " }

const TEXTO_EXPEDIENTE = "Copia completa del expediente judicial del proceso (escrito de tutela o de la acción, auto admisorio, anexos y actuaciones posteriores), tal como obra en el despacho."

const ESTADOS_ESCRITO: Record<string, string> = {
  BORRADOR: "En elaboración", EN_REVISION: "Con el revisor", AJUSTE_INTERNO: "Ajuste pedido por el revisor",
  ENTREGADO: "Entregado", DEVUELTO: "Devuelto por la entidad", APROBADO: "Aprobado"
}

export default function PanelTrabajo({ casoId, actuacion: a, archivos, puedeTrabajar, puedeRevisar, puedeCerrar, motivosCierre }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [abierto, setAbierto] = useState<"" | "insumos" | "datos" | "devolverAux" | "respuesta" | "radicacion" | "cierre">("")
  // Texto con el que abre la solicitud de datos faltantes (el del expediente viene ya escrito)
  const [textoDatos, setTextoDatos] = useState("")
  const pedirDatos = (texto: string) => { setTextoDatos(texto); setAbierto(abierto === "datos" && textoDatos === texto ? "" : "datos") }
  const cerrada = a.estado === "CERRADA"

  const ejecutar = (paso: string, cuerpo: Record<string, unknown>, mensaje: string, confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return
    iniciar(async () => {
      const r = await pasoActuacion(casoId, a.id, paso, cuerpo)
      if (!r.ok) return void toast.error(r.errores.join(". "))
      toast.success(mensaje)
      setAbierto("")
    })
  }

  const escritos = [...a.escritos].sort((x, y) => y.version - x.version)
  const actual = escritos[0] ?? null
  const enElaboracion = actual && ["BORRADOR", "AJUSTE_INTERNO"].includes(actual.estado)
  const puedeSubirEscrito = puedeTrabajar && !cerrada && (!actual || ["BORRADOR", "AJUSTE_INTERNO", "DEVUELTO"].includes(actual.estado) || (actual.estado === "EN_REVISION" && puedeRevisar))
  const deEscrito = (id: number) => archivos.filter(x => x.escritoId === id)
  const insumosRecibidos = archivos.filter(x => !x.escritoId && x.tipo === "INSUMO")
  const sueltos = archivos.filter(x => !x.escritoId && x.tipo !== "INSUMO")
  const pendientesInsumo = a.insumos.filter(i => !i.fechaRecepcion)

  return (
    <div className="mt-5 space-y-5 border-t border-slate-100 pt-4 text-sm">
      {/* ESCRITO */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Escrito</h4>
          <div className="flex flex-wrap gap-2">
            {puedeSubirEscrito && <SubirArchivos actuacionId={a.id} tipos={["ESCRITO", "ANEXO"]} />}
            {puedeTrabajar && enElaboracion && (
              <button disabled={pendiente} className="boton-primario py-1.5 text-xs" onClick={() => ejecutar("revision", {}, "Enviado al revisor")}>Enviar a revisión</button>
            )}
            {puedeRevisar && actual?.estado === "EN_REVISION" && (
              <>
                <button disabled={pendiente} className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "devolverAux" ? "" : "devolverAux")}>Devolver al auxiliar</button>
                <button disabled={pendiente} className="boton-primario py-1.5 text-xs"
                  onClick={() => ejecutar("entregar", {}, `V${actual.version} entregada a la entidad`, `¿Entregar la V${actual.version} a la entidad? Se comparte la carpeta del escrito y sale el correo de entrega.`)}>
                  Entregar V{actual.version}
                </button>
              </>
            )}
            {puedeTrabajar && actual?.estado === "ENTREGADO" && (
              <button disabled={pendiente} className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "respuesta" ? "" : "respuesta")}>Registrar respuesta de la entidad</button>
            )}
          </div>
        </div>

        {abierto === "devolverAux" && (
          <form action={d => ejecutar("devolver-auxiliar", { observacion: d.get("observacion") }, "Devuelto al auxiliar")} className="flex gap-2">
            <input name="observacion" required placeholder="Qué debe ajustar" className="campo" />
            <button disabled={pendiente} className="boton-primario">Devolver</button>
          </form>
        )}
        {abierto === "respuesta" && <FormRespuesta pendiente={pendiente} enviar={c => ejecutar("respuesta", c, "Respuesta registrada")} />}

        {escritos.length === 0 && <p className="text-slate-500">Sin escrito todavía.</p>}
        {escritos.map(e => (
          <div key={e.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">V{e.version}</span>
              <span className="text-slate-600">{ESTADOS_ESCRITO[e.estado] ?? e.estado}</span>
              {e.fechaEnvioRevision && <span className="text-xs text-slate-500">A revisión {fechaHora(e.fechaEnvioRevision)}</span>}
              {e.fechaEntregaEntidad && <span className="text-xs text-slate-500">Entregado {fechaHora(e.fechaEntregaEntidad)}</span>}
              {e.fechaAcuse && <span className="text-xs text-slate-500">Acuse {fechaHora(e.fechaAcuse)}</span>}
              {e.fechaAprobacion && <span className="text-xs text-emerald-700">Aprobado {fechaHora(e.fechaAprobacion)}</span>}
            </div>
            {e.observacionRevision && e.estado === "AJUSTE_INTERNO" && (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">Revisor: {e.observacionRevision}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {deEscrito(e.id).length === 0 && <span className="text-xs text-slate-500">Sin documentos</span>}
              {deEscrito(e.id).map(d => <Documento key={d.id} d={{ ...d, nombre: `${PREFIJO_DOC[d.tipo] ?? ""}${d.nombre}` }} />)}
            </div>
            {e.devoluciones.map(dv => (
              <div key={dv.id} className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-900">
                Devolución {TIPOS_DEVOLUCION[dv.tipo]?.toLowerCase() ?? dv.tipo} del {fechaHora(dv.fechaDevolucion)}
                {dv.motivo && ` · ${dv.motivo.nombre}`}{dv.observacion && ` · ${dv.observacion}`}
                {dv.extemporanea && " · extemporánea"}
                <span className="block">
                  {dv.fechaNuevaEntrega ? `Corregida ${fechaHora(dv.fechaNuevaEntrega)}` : `Corregir a más tardar ${fechaHora(dv.fechaLimiteCorreccion)}`}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* INSUMOS Y DATOS FALTANTES */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Insumos y datos faltantes</h4>
          {puedeTrabajar && !cerrada && (
            <div className="flex flex-wrap gap-2">
              <button className="boton-secundario py-1.5 text-xs" onClick={() => pedirDatos("")}>Pedir datos faltantes</button>
              {/* El manual (§4) no deja escribirle al juzgado en nombre de la entidad: el expediente se le pide al cliente */}
              <button className="boton-secundario py-1.5 text-xs" onClick={() => pedirDatos(TEXTO_EXPEDIENTE)}>Pedir expediente del juzgado</button>
              <button className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "insumos" ? "" : "insumos")}>Pedir insumos</button>
              <SubirArchivos actuacionId={a.id} tipos={["INSUMO", "SOPORTE"]} />
            </div>
          )}
        </div>
        {abierto === "datos" && (
          <form action={d => ejecutar("datos-faltantes", { detalle: d.get("detalle") }, "Solicitud de datos faltantes enviada")} className="space-y-2">
            <textarea key={textoDatos} name="detalle" required rows={4} defaultValue={textoDatos} placeholder="Qué información falta (sale en el hilo de la asignación)" className="campo" />
            <button disabled={pendiente} className="boton-primario">Enviar solicitud</button>
          </form>
        )}
        {abierto === "insumos" && <FormInsumos pendiente={pendiente} enviar={insumos => ejecutar("insumos", { insumos }, "Solicitud de insumos enviada")} />}
        {a.insumos.length === 0 && <p className="text-slate-500">Sin insumos pedidos.</p>}
        {a.insumos.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {a.insumos.map(i => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>{i.descripcion}{!i.minimo && <span className="text-xs text-slate-500"> (complementario)</span>}</span>
                <span className="text-xs">
                  {i.fechaRecepcion
                    ? <span className="text-emerald-700">Recibido {fechaHora(i.fechaRecepcion)}</span>
                    : <span className="text-amber-700">Pedido {fechaHora(i.fechaSolicitud)} · el cliente tiene hasta {fechaHora(i.fechaLimite)}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {puedeTrabajar && pendientesInsumo.length > 0 && (
          <button disabled={pendiente} className="text-xs enlace"
            onClick={() => ejecutar("insumos/recibidos", { insumoIds: pendientesInsumo.map(i => i.id), enviarAcuse: false }, "Insumos marcados como recibidos", "¿Marcar todos los insumos pendientes como recibidos ahora? Si llegaron por correo, confírmelos desde ese correo para conservar la hora de llegada.")}>
            Marcar los pendientes como recibidos (sin correo)
          </button>
        )}
        {insumosRecibidos.length > 0 && (
          <div className="pt-1">
            <p className="etiqueta">Insumos recibidos</p>
            <div className="flex flex-wrap gap-1.5">{insumosRecibidos.map(d => <Documento key={d.id} d={d} />)}</div>
          </div>
        )}
        {sueltos.length > 0 && (
          <div className="pt-1">
            <p className="etiqueta">Asignación y soportes</p>
            <div className="flex flex-wrap gap-1.5">{sueltos.map(d => <Documento key={d.id} d={d} />)}</div>
          </div>
        )}
      </div>

      {/* RADICACIÓN Y CIERRE */}
      {!cerrada && (puedeTrabajar || puedeCerrar) && (
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {puedeTrabajar && ["APROBADO", "ENTREGADO"].includes(a.estado) && (
            <button className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "radicacion" ? "" : "radicacion")}>Registrar radicación</button>
          )}
          {puedeCerrar && <button className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "cierre" ? "" : "cierre")}>Cerrar actuación</button>}
        </div>
      )}
      {abierto === "radicacion" && (
        <form action={d => ejecutar("radicacion", { fecha: isoDesdeLocal(String(d.get("fecha"))) }, "Radicación registrada")} className="flex flex-wrap gap-2 items-end">
          <div><label className="etiqueta">Radicada por la entidad el</label><input type="datetime-local" name="fecha" required className="campo" /></div>
          <button disabled={pendiente} className="boton-primario">Guardar</button>
        </form>
      )}
      {abierto === "cierre" && (
        <form action={d => ejecutar("cerrar", { motivo: d.get("motivo") }, "Actuación cerrada", "¿Cerrar la actuación?")} className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[16rem]">
            <label className="etiqueta">Causal de cierre</label>
            <select name="motivo" required className="campo">{motivosCierre.map(m => <option key={m}>{m}</option>)}</select>
          </div>
          <button disabled={pendiente} className="boton-peligro">Cerrar</button>
        </form>
      )}
    </div>
  )
}

function FormInsumos({ pendiente, enviar }: { pendiente: boolean, enviar: (insumos: { descripcion: string, minimo: boolean }[]) => void }) {
  const [filas, setFilas] = useState([{ descripcion: "", minimo: true }])
  const cambiar = (i: number, cambio: Partial<{ descripcion: string, minimo: boolean }>) => setFilas(f => f.map((x, j) => (j === i ? { ...x, ...cambio } : x)))
  return (
    <div className="space-y-2">
      {filas.map((f, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input value={f.descripcion} onChange={e => cambiar(i, { descripcion: e.target.value })} placeholder={`Insumo ${i + 1}`} className="campo" />
          <label className="flex items-center gap-1 text-xs whitespace-nowrap" title="Sin los insumos mínimos no empieza a contar el ANS">
            <input type="checkbox" checked={f.minimo} onChange={e => cambiar(i, { minimo: e.target.checked })} /> Mínimo
          </label>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" className="text-xs enlace" onClick={() => setFilas(f => [...f, { descripcion: "", minimo: true }])}>+ Otro insumo</button>
        <button disabled={pendiente || !filas.some(f => f.descripcion.trim())} className="boton-primario ml-auto" onClick={() => enviar(filas.filter(f => f.descripcion.trim()))}>Enviar solicitud</button>
      </div>
    </div>
  )
}

// Respuesta de la entidad sin correo (por teléfono, por otro canal): se registra a mano con su fecha
export function FormRespuesta({ pendiente, enviar, sugerencia, motivos = [], conFecha = true }: {
  pendiente: boolean, enviar: (cuerpo: Record<string, unknown>) => void, sugerencia?: string | null,
  motivos?: { id: number, nombre: string }[], conFecha?: boolean
}) {
  const [tipo, setTipo] = useState(sugerencia ?? "ACUSE")
  return (
    <form
      action={d => enviar({
        tipo,
        fecha: conFecha ? isoDesdeLocal(String(d.get("fecha") ?? "")) : null,
        devolucion: tipo === "DEVOLUCION" ? { tipo: d.get("tipoDevolucion"), motivoId: Number(d.get("motivoId")) || null, observacion: d.get("observacion") } : undefined
      })}
      className="space-y-2 rounded-lg border border-slate-200 p-3"
    >
      <div className="flex flex-wrap gap-4">
        {[["ACUSE", "Acuse de recibido"], ["APROBACION", "Aprobado"], ["DEVOLUCION", "Devuelto"]].map(([k, v]) => (
          <label key={k} className="flex items-center gap-1.5"><input type="radio" checked={tipo === k} onChange={() => setTipo(k)} /> {v}</label>
        ))}
      </div>
      {tipo === "DEVOLUCION" && (
        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <label className="etiqueta">Tipo de devolución</label>
            <select name="tipoDevolucion" className="campo">{Object.entries(TIPOS_DEVOLUCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          {motivos.length > 0 && (
            <div>
              <label className="etiqueta">Motivo</label>
              <select name="motivoId" className="campo"><option value="">—</option>{motivos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select>
            </div>
          )}
          <div className="sm:col-span-2"><label className="etiqueta">Observación de la entidad</label><input name="observacion" className="campo" /></div>
        </div>
      )}
      {conFecha && <div><label className="etiqueta">Fecha y hora</label><input type="datetime-local" name="fecha" className="campo w-auto" /></div>}
      <button disabled={pendiente} className="boton-primario">Registrar</button>
    </form>
  )
}
