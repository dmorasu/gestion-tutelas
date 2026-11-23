"use client"

import { useState, useTransition } from "react"
import { toast } from "react-toastify"
import { pasoActuacion } from "../acciones"
import Documento, { type DocumentoFila } from "@/components/ui/Documento"
import SubirArchivos from "./SubirArchivos"
import { FormDatosFaltantes, FormEntrega, FormInsumosMatriz, GRUPO_GENERAL, type ItemMatriz } from "./componentes/Matriz"
import { TIPOS_DEVOLUCION, fechaHora, isoDesdeLocal } from "@/src/lib/formato"
import { FileText, Inbox, Landmark, Siren } from "lucide-react"
import FichaRevision, { type DatosFicha, type ItemFicha } from "./componentes/FichaRevision"

// Cabecera de cada tarjeta del trabajo (escrito, insumos, cierre), como las secciones de Nodex
const CABECERA = "flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5"
const TITULO = "flex items-center gap-2 text-sm font-semibold text-slate-700"

export type Insumo = { id: number, descripcion: string, minimo: boolean, fechaSolicitud: string | null, fechaLimite: string | null, fechaRecepcion: string | null }
export type DevolucionFila = {
  id: number, tipo: string, observacion: string | null, fechaDevolucion: string, fechaLimiteCorreccion: string | null,
  fechaNuevaEntrega: string | null, extemporanea: boolean, motivo: { nombre: string } | null
}
export type EscritoFila = {
  id: number, version: number, estado: string, clase?: "PRINCIPAL" | "EMERGENCIA" | "ALCANCE", observacionRevision: string | null, fechaEnvioRevision: string | null,
  fechaEntregaEntidad: string | null, fechaAcuse: string | null, fechaAprobacion: string | null, enlace: string | null, devoluciones: DevolucionFila[]
}
export type ArchivoCaso = DocumentoFila & { tipo: string, escritoId: number | null, actuacionId: number | null }

type Props = {
  casoId: number
  actuacion: {
    id: number, etapa?: string, estado: string, insumos: Insumo[], escritos: EscritoFila[], datosSolicitados?: { nombre: string, recibido: boolean }[]
    alcancePendiente?: boolean, emergencia?: Emergencia | null
  }
  // Matriz de insumos (catálogo) y documentos de la entrega (modelos de la firma)
  matriz: ItemMatriz[]
  documentosEntrega: Record<string, string>
  documentoSugerido: string | null
  archivos: ArchivoCaso[]
  puedeTrabajar: boolean
  puedeRevisar: boolean
  puedePedirInsumos: boolean
  puedePedirDatos: boolean
  puedeCerrar: boolean
  // Reunión 23-nov: la radicación en el juzgado la registra la asistencia administrativa
  puedeRadicar: boolean
  motivosCierre: string[]
  tipoEscrito: string
  // Lo que el auxiliar completa en la ficha al enviar a revisión (reunión 23-nov)
  ficha: DatosFicha
  derechos: ItemFicha[]
  peticiones: ItemFicha[]
}

// Escrito de emergencia de la etapa (si la admite) y si ya está el modelo de la firma
export type Emergencia = { escrito: string, alcance: string, modelo: boolean }

// Cómo se llama cada escrito según su clase, con la versión dentro de la clase (la emergencia y su
// alcance cuentan cada uno desde V1, como en la ficha y el correo de entrega)
const NOMBRE_CLASE: Record<string, string> = { EMERGENCIA: "Emergencia", ALCANCE: "Alcance" }
const versionesDeClase = (escritos: EscritoFila[]) => {
  const vistas = new Map<number, string>()
  const cuenta: Record<string, number> = {}
  for (const e of [...escritos].sort((x, y) => x.version - y.version)) {
    const clase = e.clase ?? "PRINCIPAL"
    cuenta[clase] = (cuenta[clase] ?? 0) + 1
    vistas.set(e.id, `${NOMBRE_CLASE[clase] ? `${NOMBRE_CLASE[clase]} ` : ""}V${cuenta[clase]}`)
  }
  return vistas
}

// Cómo se nombra cada documento dentro de la versión del escrito
const PREFIJO_DOC: Record<string, string> = { ANEXO: "Anexo · ", RESPUESTA: "Respuesta de la entidad · " }

// El manual (§4) no deja escribirle al juzgado en nombre de la entidad: el expediente se le pide al
// cliente, que es quien lo solicita al despacho
const TEXTO_EXPEDIENTE = "Copia completa del expediente judicial del proceso (escrito de tutela o de la acción, auto admisorio, anexos y actuaciones posteriores), tal como obra en el despacho."

const ESTADOS_ESCRITO: Record<string, string> = {
  BORRADOR: "En elaboración", EN_REVISION: "Con el revisor", AJUSTE_INTERNO: "Ajuste pedido por el revisor",
  ENTREGADO: "Entregado", DEVUELTO: "Devuelto por la entidad", APROBADO: "Aprobado"
}

export default function PanelTrabajo({ casoId, actuacion: a, matriz, documentosEntrega, documentoSugerido, archivos, puedeTrabajar, puedeRevisar, puedePedirInsumos, puedePedirDatos, puedeCerrar, puedeRadicar, motivosCierre, tipoEscrito, ficha, derechos, peticiones }: Props) {
  const [pendiente, iniciar] = useTransition()
  const [abierto, setAbierto] = useState<"" | "insumos" | "datos" | "revision" | "devolverAux" | "entregar" | "respuesta" | "radicacion" | "cierre">("")
  // Texto con el que abre la solicitud de datos faltantes (el del expediente viene ya escrito)
  const [textoDatos, setTextoDatos] = useState("")
  const pedirDatos = (texto: string) => { setTextoDatos(texto); setAbierto(abierto === "datos" && textoDatos === texto ? "" : "datos") }
  const cerrada = a.estado === "CERRADA"
  // La nulidad sin clasificar todavía no tiene escrito: primero se decide en qué etapa queda
  const sinEtapa = a.etapa === "NULIDAD"

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
  const vistas = versionesDeClase(escritos)
  const etiqueta = (e: EscritoFila) => vistas.get(e.id) ?? `V${e.version}`
  const enElaboracion = actual && ["BORRADOR", "AJUSTE_INTERNO"].includes(actual.estado)
  // Tras entregar la emergencia sigue el escrito completo: se sube como un escrito nuevo (alcance)
  const sigueAlcance = !!a.alcancePendiente && actual?.clase === "EMERGENCIA" && ["ENTREGADO", "APROBADO"].includes(actual.estado)
  const puedeSubirEscrito = puedeTrabajar && !cerrada && !sinEtapa && (!actual || sigueAlcance || ["BORRADOR", "AJUSTE_INTERNO", "DEVUELTO"].includes(actual.estado) || (actual.estado === "EN_REVISION" && puedeRevisar))
  // Emergencia: la etapa la admite, ya se pidieron insumos y no hay un escrito de la etapa en curso
  const borradorVacio = actual?.estado === "BORRADOR" && (actual.clase ?? "PRINCIPAL") === "PRINCIPAL" && !archivos.some(x => x.escritoId === actual.id && x.tipo === "ESCRITO")
  const ofreceEmergencia = !!a.emergencia && puedeTrabajar && !cerrada && a.insumos.length > 0 &&
    (!actual || borradorVacio || (actual.clase === "EMERGENCIA" && actual.estado === "DEVUELTO"))
  // Documento que se marca solo en la entrega según la clase del escrito
  const sugeridoEntrega = actual?.clase === "EMERGENCIA" ? "EMERGENCIA" : actual?.clase === "ALCANCE" && a.etapa === "ACCION" ? "ALCANCE" : documentoSugerido
  const deEscrito = (id: number) => archivos.filter(x => x.escritoId === id)
  const insumosRecibidos = archivos.filter(x => !x.escritoId && x.tipo === "INSUMO")
  const sueltos = archivos.filter(x => !x.escritoId && x.tipo !== "INSUMO")
  const pendientesInsumo = a.insumos.filter(i => !i.fechaRecepcion)

  return (
    <>
      {/* ESCRITO */}
      <section className="tarjeta overflow-hidden text-sm">
        <div className={CABECERA}>
          <h3 className={TITULO}><FileText size={15} className="text-slate-400" />{tipoEscrito}</h3>
          <div className="flex flex-wrap gap-2">
            {ofreceEmergencia && (
              <button disabled={pendiente || !a.emergencia!.modelo} className="boton-secundario py-1.5 text-xs"
                title={a.emergencia!.modelo ? undefined : "Falta el modelo de la firma para este escrito"}
                onClick={() => ejecutar("emergencia", {}, `${a.emergencia!.escrito} generado: revíselo en los documentos del escrito`, `¿Generar el ${a.emergencia!.escrito.toLowerCase()}? Después queda pendiente la ${a.emergencia!.alcance.toLowerCase()}.`)}>
                <Siren size={13} />Escrito de emergencia
              </button>
            )}
            {puedeSubirEscrito && <SubirArchivos actuacionId={a.id} tipos={["ESCRITO", "ANEXO"]} />}
            {/* La ficha se genera sola al entregar; este botón es para revisarla antes */}
            {puedeTrabajar && !cerrada && !sinEtapa && (
              <button disabled={pendiente} className="boton-secundario py-1.5 text-xs" onClick={() => ejecutar("ficha", {}, "Ficha técnica generada: quedó en los documentos")}>Generar ficha técnica</button>
            )}
            {puedeTrabajar && enElaboracion && (
              <button disabled={pendiente} className="boton-primario py-1.5 text-xs" onClick={() => setAbierto(abierto === "revision" ? "" : "revision")}>Enviar a revisión</button>
            )}
            {puedeRevisar && actual?.estado === "EN_REVISION" && (
              <>
                <button disabled={pendiente} className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "devolverAux" ? "" : "devolverAux")}>Devolver al auxiliar</button>
                <button disabled={pendiente} className="boton-primario py-1.5 text-xs" onClick={() => setAbierto(abierto === "entregar" ? "" : "entregar")}>
                  Entregar {etiqueta(actual)}
                </button>
              </>
            )}
            {puedeTrabajar && actual?.estado === "ENTREGADO" && (
              <button disabled={pendiente} className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "respuesta" ? "" : "respuesta")}>Registrar respuesta de la entidad</button>
            )}
          </div>
        </div>
        <div className="space-y-3 p-5">
        {a.alcancePendiente && a.emergencia && !cerrada && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Se generó el escrito de emergencia: falta la {a.emergencia.alcance.toLowerCase()} cuando lleguen los insumos.
          </p>
        )}
        {abierto === "revision" && (
          <FichaRevision inicial={ficha} derechos={derechos} peticiones={peticiones} pendiente={pendiente} cancelar={() => setAbierto("")}
            enviar={f => ejecutar("revision", { ficha: f }, "Ficha técnica generada y escrito enviado al revisor")} />
        )}
        {abierto === "devolverAux" && (
          <form action={d => ejecutar("devolver-auxiliar", { observacion: d.get("observacion") }, "Devuelto al auxiliar")} className="flex gap-2">
            <input name="observacion" required placeholder="Qué debe ajustar" className="campo" />
            <button disabled={pendiente} className="boton-primario">Devolver</button>
          </form>
        )}
        {abierto === "entregar" && actual && (
          <FormEntrega version={etiqueta(actual)} documentos={documentosEntrega} sugerido={sugeridoEntrega} pendiente={pendiente}
            anexos={matriz.filter(i => i.clase === "DOCUMENTO" && i.grupo !== GRUPO_GENERAL)}
            enviar={d => ejecutar("entregar", d, `${etiqueta(actual)} entregada a la entidad`, `¿Entregar ${etiqueta(actual)} a la entidad? Se comparte la carpeta del escrito y sale el correo de entrega.`)} />
        )}
        {abierto === "respuesta" && <FormRespuesta pendiente={pendiente} enviar={c => ejecutar("respuesta", c, "Respuesta registrada")} />}

        {escritos.length === 0 && <p className="text-slate-500">Sin escrito todavía.</p>}
        {escritos.map(e => (
          <div key={e.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{etiqueta(e)}</span>
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
      </section>

      {/* INSUMOS Y DATOS FALTANTES */}
      <section className="tarjeta overflow-hidden text-sm">
        <div className={CABECERA}>
          <h3 className={TITULO}><Inbox size={15} className="text-slate-400" />Insumos y datos faltantes</h3>
          {puedeTrabajar && !cerrada && (
            <div className="flex flex-wrap gap-2">
              {/* Reunión 18-nov: datos faltantes y expediente los pide la asistencia administrativa */}
              {puedePedirDatos && <button className="boton-secundario py-1.5 text-xs" onClick={() => pedirDatos("")}>Pedir datos faltantes</button>}
              {puedePedirDatos && <button className="boton-secundario py-1.5 text-xs" onClick={() => pedirDatos(TEXTO_EXPEDIENTE)}>Pedir expediente</button>}
              {puedePedirInsumos && <button className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "insumos" ? "" : "insumos")}>Pedir insumos</button>}
              <SubirArchivos actuacionId={a.id} tipos={["INSUMO", "SOPORTE"]} />
            </div>
          )}
        </div>
        <div className="space-y-3 p-5">
        {abierto === "datos" && puedePedirDatos && (
          <FormDatosFaltantes key={textoDatos} generales={matriz.filter(i => i.grupo === GRUPO_GENERAL && i.clase === "DOCUMENTO")} textoInicial={textoDatos} pendiente={pendiente}
            enviar={(items, otros, adjuntarExpediente) => ejecutar("datos-faltantes", { items, otros, adjuntarExpediente }, "Solicitud de datos faltantes enviada")} />
        )}
        {abierto === "insumos" && puedePedirInsumos && <FormInsumosMatriz matriz={matriz} pendiente={pendiente} enviar={insumos => ejecutar("insumos", { insumos }, "Solicitud de insumos enviada")} />}
        {(a.datosSolicitados ?? []).length > 0 && (
          <div>
            <p className="etiqueta">Datos faltantes pedidos</p>
            <ul className="divide-y divide-slate-100">
              {a.datosSolicitados!.map(x => (
                <li key={x.nombre} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>{x.nombre}</span>
                  <span className={x.recibido ? "text-xs text-emerald-700" : "text-xs text-amber-700"}>{x.recibido ? "Recibido" : "Pendiente"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {a.insumos.length === 0 && <p className="text-slate-500">Sin insumos pedidos.</p>}
        {a.insumos.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {a.insumos.map(i => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span>{i.descripcion}</span>
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
      </section>

      {/* RADICACIÓN Y CIERRE */}
      {!cerrada && (puedeRadicar || puedeCerrar) && (
        <section className="tarjeta overflow-hidden text-sm">
          <div className={CABECERA}>
            <h3 className={TITULO}><Landmark size={15} className="text-slate-400" />Radicación y cierre</h3>
            <div className="flex flex-wrap gap-2">
              {puedeRadicar && ["APROBADO", "ENTREGADO"].includes(a.estado) && (
                <button className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "radicacion" ? "" : "radicacion")}>Registrar radicación</button>
              )}
              {puedeCerrar && <button className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(abierto === "cierre" ? "" : "cierre")}>Cerrar actuación</button>}
            </div>
          </div>
          {(abierto === "radicacion" || abierto === "cierre") && <div className="p-5">
            {abierto === "radicacion" && (
              <form action={d => ejecutar("radicacion", { fecha: isoDesdeLocal(String(d.get("fecha"))) }, "Radicación registrada")} className="flex flex-wrap items-end gap-2">
                <div><label className="etiqueta">Radicada por la entidad el</label><input type="datetime-local" name="fecha" required className="campo" /></div>
                <button disabled={pendiente} className="boton-primario">Guardar</button>
              </form>
            )}
            {abierto === "cierre" && (
              <form action={d => ejecutar("cerrar", { motivo: d.get("motivo") }, "Actuación cerrada", "¿Cerrar la actuación?")} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[16rem] flex-1">
                  <label className="etiqueta">Causal de cierre</label>
                  <select name="motivo" required className="campo">{motivosCierre.map(m => <option key={m}>{m}</option>)}</select>
                </div>
                <button disabled={pendiente} className="boton-peligro">Cerrar</button>
              </form>
            )}
          </div>}
        </section>
      )}
    </>
  )
}

// Respuesta de la entidad sin correo (por teléfono, por otro canal): se registra a mano con su fecha
export function FormRespuesta({ pendiente, enviar, sugerencia, motivos = [], conFecha = true }: {
  pendiente: boolean, enviar: (cuerpo: Record<string, unknown>) => void, sugerencia?: string | null,
  motivos?: { id: number, nombre: string }[], conFecha?: boolean
}) {
  // Reunión 23-nov: no se registra la aprobación (el envío sin devolución se entiende aprobado)
  const [tipo, setTipo] = useState(sugerencia === "DEVOLUCION" ? "DEVOLUCION" : "ACUSE")
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
        {[["ACUSE", "Acuse de recibido"], ["DEVOLUCION", "Devuelto"]].map(([k, v]) => (
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
