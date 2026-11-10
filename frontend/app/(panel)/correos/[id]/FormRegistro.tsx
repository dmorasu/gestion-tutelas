"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import clsx from "clsx"
import { toast } from "react-toastify"
import { AlertTriangle, CheckCircle2, ChevronDown, Plus, Trash2 } from "lucide-react"
import { registrarCorreo } from "../acciones"
import { registrarManual, buscarPorRadicado } from "../../casos/acciones"
import { CRITICIDADES, ETAPAS, ESTADOS_ACTUACION, UNIDADES_TERMINO, isoDesdeLocal, radicado as formatoRadicado, valorFechaHoraLocal } from "@/src/lib/formato"

export type Juzgado = { id: number, nombre: string }
type Parte = { tipoDocumento: string, numeroDocumento: string, nombre: string }
type CasoEncontrado = { id: number, numeroInterno: string | null, estado: string, actuaciones: { id: number, etapa: string, estado: string }[], radicadoBuscado: string }

type Props = {
  // Sin correo: registro manual (la asignación llegó por otro medio) y la fecha la indica el asistente
  correoId?: number
  sugerencia: { radicado: string | null, juzgadoId: number | null, etapa: string | null, criticidad: string | null, fechaVencimiento: string | null, tipoSolicitud: string }
  juzgados: Juzgado[]
  casoExistente: { id: number, radicado: string } | null
  // amplio: pantalla de asignación manual, con el resumen al lado. Angosto: al lado del correo
  amplio?: boolean
}

// Qué es cada etapa, en una línea, para elegir sin dudar
const ETAPAS_FORM: { clave: string, ayuda: string }[] = [
  { clave: "ACCION", ayuda: "Contestar la tutela o la acción" },
  { clave: "IMPUGNACION", ayuda: "Impugnar el fallo de primera instancia" },
  { clave: "CUMPLIMIENTO", ayuda: "Acreditar el cumplimiento del fallo" },
  { clave: "REQUERIMIENTO_PREVIO", ayuda: "Responder el requerimiento antes del desacato" },
  { clave: "DESACATO", ayuda: "Pronunciarse en el incidente de desacato" }
]

const COLOR_CRITICIDAD: Record<string, string> = {
  CRITICO: "border-red-300 bg-red-50 text-red-800", ALTO: "border-amber-300 bg-amber-50 text-amber-800", ORDINARIO: "border-slate-300 bg-slate-100 text-slate-800"
}

function Tarjeta({ numero, titulo, children }: { numero: number, titulo: string, children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <h3 className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-700">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">{numero}</span>
        {titulo}
      </h3>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  )
}

function Opciones({ valor, onCambio, opciones }: { valor: string, onCambio: (v: string) => void, opciones: { clave: string, nombre: string, clase?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map(o => (
        <button key={o.clave} type="button" onClick={() => onCambio(o.clave)} aria-pressed={valor === o.clave}
          className={clsx("rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
            valor === o.clave ? (o.clase ?? "border-slate-800 bg-slate-800 text-white") : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
          {o.nombre}
        </button>
      ))}
    </div>
  )
}

export default function FormRegistro({ correoId, sugerencia, juzgados, casoExistente, amplio }: Props) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [errores, setErrores] = useState<string[]>([])
  const [radicado, setRadicado] = useState(casoExistente?.radicado ?? sugerencia.radicado ?? "")
  const [hallazgo, setHallazgo] = useState<CasoEncontrado | null>(null)
  const [tipo, setTipo] = useState(sugerencia.tipoSolicitud === "ACCION_CUMPLIMIENTO" ? "ACCION_CUMPLIMIENTO" : "TUTELA")
  // La etapa viene del asunto normalizado; si se adivinó por el texto, el asistente la confirma aquí
  const [etapa, setEtapa] = useState(sugerencia.etapa && sugerencia.etapa !== "PQRS" ? sugerencia.etapa : "ACCION")
  const [criticidad, setCriticidad] = useState(sugerencia.criticidad ?? "")
  const [vence, setVence] = useState(valorFechaHoraLocal(sugerencia.fechaVencimiento))
  const [conTermino, setConTermino] = useState(false)
  const [insumos, setInsumos] = useState(false)
  const [partes, setPartes] = useState<Parte[]>([{ tipoDocumento: "CC", numeroDocumento: "", nombre: "" }])

  const digitos = radicado.replace(/\D/g, "")
  const completo = digitos.length === 23
  // Solo vale si es del radicado que está escrito ahora (si se corrige, el aviso viejo desaparece)
  const encontrado = completo && hallazgo?.radicadoBuscado === digitos ? hallazgo : null
  // El caso nuevo que en realidad ya existe: se abre otra etapa sobre él, sin pedir de nuevo juzgado y partes
  const existente = casoExistente ?? (encontrado ? { id: encontrado.id, radicado: digitos } : null)
  const etapaAbierta = encontrado?.actuaciones.find(a => a.etapa === etapa && a.estado !== "CERRADA")

  // Al completar los 23 dígitos se consulta si el radicado ya es un caso
  useEffect(() => {
    if (casoExistente || !completo) return
    let vigente = true
    buscarPorRadicado(digitos).then(r => { if (vigente) setHallazgo(r) })
    return () => { vigente = false }
  }, [digitos, completo, casoExistente])

  const cambiarParte = (i: number, campo: keyof Parte, valor: string) => setPartes(p => p.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))

  const enviar = (datos: FormData) => {
    setErrores([])
    const terminoValor = conTermino ? Number(datos.get("terminoValor")) || null : null
    const cuerpo = {
      ...(!correoId && { fechaAsignacion: isoDesdeLocal(String(datos.get("fechaAsignacion") ?? "")) }),
      radicado: digitos,
      tipoSolicitud: tipo,
      etapa,
      juzgadoId: Number(datos.get("juzgadoId")) || null,
      calidadEntidad: datos.get("calidadEntidad") ?? "ACCIONADO",
      partes: existente ? [] : partes.filter(p => p.nombre.trim()),
      derechosInvolucrados: datos.get("derechosInvolucrados") || null,
      fechaNotificacion: conTermino ? isoDesdeLocal(String(datos.get("fechaNotificacion") ?? "")) : null,
      terminoValor,
      terminoUnidad: terminoValor ? datos.get("terminoUnidad") : null,
      fechaVencimiento: isoDesdeLocal(vence),
      criticidad: criticidad || null,
      requiereInsumos: insumos,
      origenImpugnacion: etapa === "IMPUGNACION" ? datos.get("origenImpugnacion") : null,
      observaciones: datos.get("observaciones") || null
    }
    iniciar(async () => {
      const r = correoId ? await registrarCorreo(correoId, cuerpo) : await registrarManual(cuerpo)
      if (!r.ok) return setErrores(r.errores)
      const { casoId, deOtroOperador, numeroInterno, acuse } = r.datos as {
        casoId: number, deOtroOperador: boolean, numeroInterno: string, acuse: { estado: string, error: string | null } | null
      }
      toast.success(`Asignación registrada: caso ${numeroInterno}`)
      if (acuse?.estado === "SIMULADO") toast.info("Confirmación de recibido simulada (el envío real no está activo)")
      if (acuse?.estado === "ERROR") toast.error(`No se envió la confirmación de recibido: ${acuse.error ?? ""}`)
      if (deOtroOperador) toast.warn("El radicado figura en el archivo maestro de otro operador")
      router.push(`/casos/${casoId}`)
    })
  }

  const formulario = (
    <div className="space-y-5">
      <Tarjeta numero={1} titulo="Asignación">
        <div className={clsx("grid gap-4", amplio && "sm:grid-cols-[1fr,16rem]")}>
          <div>
            <label className="etiqueta">Radicado del proceso</label>
            <input value={radicado} onChange={e => setRadicado(e.target.value)} readOnly={!!casoExistente} required autoFocus={amplio}
              placeholder="76001-31-03-001-2026-00123-00" className={clsx("campo font-mono text-base", completo && "border-emerald-400")} />
            <p className={clsx("mt-1.5 flex items-center gap-1.5 text-xs", completo ? "text-emerald-700" : "text-slate-500")}>
              {completo ? <><CheckCircle2 size={13} /> {formatoRadicado(digitos)}</> : `${digitos.length} de 23 dígitos`}
            </p>
          </div>
          {!correoId && (
            <div>
              <label className="etiqueta">Llegó el</label>
              <input type="datetime-local" name="fechaAsignacion" required className="campo" />
            </div>
          )}
        </div>
        {encontrado && !casoExistente && (
          <div className={clsx("flex items-start gap-2 rounded-lg border px-3 py-2 text-xs", etapaAbierta ? "border-red-200 bg-red-50 text-red-800" : "border-sky-200 bg-sky-50 text-sky-900")}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Este radicado ya es el caso <Link href={`/casos/${encontrado.id}`} className="font-semibold underline">{encontrado.numeroInterno}</Link>
              {" "}({encontrado.actuaciones.map(a => `${ETAPAS[a.etapa]}: ${ESTADOS_ACTUACION[a.estado]?.toLowerCase()}`).join("; ")}).
              {etapaAbierta ? " Ya tiene esa etapa abierta: elija otra o asocie el correo a la actuación." : " Se abrirá una etapa nueva sobre ese caso."}
            </span>
          </div>
        )}
      </Tarjeta>

      <Tarjeta numero={2} titulo="Qué hay que hacer">
        {!existente && (
          <div>
            <label className="etiqueta">Tipo de acción</label>
            <Opciones valor={tipo} onCambio={setTipo} opciones={[{ clave: "TUTELA", nombre: "Tutela" }, { clave: "ACCION_CUMPLIMIENTO", nombre: "Acción de cumplimiento" }]} />
          </div>
        )}
        <div>
          <label className="etiqueta">Etapa</label>
          <div className={clsx("grid gap-2", amplio ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-2")}>
            {ETAPAS_FORM.map(e => (
              <button key={e.clave} type="button" onClick={() => setEtapa(e.clave)} aria-pressed={etapa === e.clave}
                className={clsx("rounded-lg border px-3 py-2.5 text-left transition",
                  etapa === e.clave ? "border-slate-800 bg-slate-800 text-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")}>
                <span className="block text-xs font-semibold">{ETAPAS[e.clave]}</span>
                <span className={clsx("mt-0.5 block text-[11px] leading-4", etapa === e.clave ? "text-slate-300" : "text-slate-500")}>{e.ayuda}</span>
              </button>
            ))}
          </div>
        </div>
        {etapa === "IMPUGNACION" && (
          <div>
            <label className="etiqueta">Quién impugna</label>
            <select name="origenImpugnacion" defaultValue="ACCIONADO" className="campo sm:w-72">
              <option value="ACCIONADO">La entidad (accionada)</option>
              <option value="ACCIONANTE">El accionante</option>
            </select>
          </div>
        )}
        <div className={clsx("grid gap-4", amplio && "sm:grid-cols-2")}>
          <div>
            <label className="etiqueta">Vence</label>
            <input type="datetime-local" value={vence} onChange={e => setVence(e.target.value)} className="campo" />
            {!vence && !conTermino && <p className="mt-1 text-xs text-amber-700">Sin vencimiento no hay fecha límite ni semáforo.</p>}
          </div>
          <div>
            <label className="etiqueta">Criticidad que indicó la entidad</label>
            <Opciones valor={criticidad} onCambio={setCriticidad} opciones={[
              ...Object.entries(CRITICIDADES).map(([k, v]) => ({ clave: k, nombre: v, clase: COLOR_CRITICIDAD[k] })),
              { clave: "", nombre: "No la indicó" }
            ]} />
          </div>
        </div>
        <div>
          <button type="button" onClick={() => setConTermino(x => !x)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
            <ChevronDown size={14} className={clsx("transition", conTermino && "rotate-180")} /> Calcular el vencimiento con la notificación y el término del juez
          </button>
          {conTermino && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label className="etiqueta">Notificación</label>
                <input type="datetime-local" name="fechaNotificacion" className="campo" />
              </div>
              <div>
                <label className="etiqueta">Término</label>
                <input type="number" min={1} name="terminoValor" className="campo" placeholder={etapa === "IMPUGNACION" ? "3 por defecto" : ""} />
              </div>
              <div>
                <label className="etiqueta">Unidad</label>
                <select name="terminoUnidad" defaultValue="DIAS_HABILES" className="campo">
                  {Object.entries(UNIDADES_TERMINO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </Tarjeta>

      {!existente && (
        <Tarjeta numero={3} titulo="Juzgado y accionantes">
          <div className={clsx("grid gap-4", amplio && "sm:grid-cols-[2fr,1fr]")}>
            <div>
              <label className="etiqueta">Juzgado</label>
              <select name="juzgadoId" defaultValue={sugerencia.juzgadoId ?? ""} className="campo">
                <option value="">Sin identificar</option>
                {juzgados.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="etiqueta">La entidad es</label>
              <select name="calidadEntidad" defaultValue="ACCIONADO" className="campo">
                <option value="ACCIONADO">Accionada</option>
                <option value="VINCULADO">Vinculada</option>
                <option value="DEMANDADO">Demandada</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="etiqueta">Accionantes</label>
            {partes.map((p, i) => (
              <div key={i} className={clsx("grid gap-2", amplio ? "sm:grid-cols-[5rem,10rem,1fr,auto]" : "grid-cols-[5rem,1fr,auto]")}>
                <select value={p.tipoDocumento} onChange={e => cambiarParte(i, "tipoDocumento", e.target.value)} className="campo px-2">
                  {["CC", "CE", "NIT", "PPT", "TI", "PAS"].map(t => <option key={t}>{t}</option>)}
                </select>
                <input value={p.numeroDocumento} onChange={e => cambiarParte(i, "numeroDocumento", e.target.value)} placeholder="Número" className="campo" />
                <input value={p.nombre} onChange={e => cambiarParte(i, "nombre", e.target.value)} placeholder="Nombre completo" className={clsx("campo", !amplio && "col-span-2 row-start-2")} />
                <button type="button" disabled={partes.length === 1} onClick={() => setPartes(x => x.filter((_, j) => j !== i))} title="Quitar"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-30"><Trash2 size={15} /></button>
              </div>
            ))}
            <button type="button" onClick={() => setPartes(p => [...p, { tipoDocumento: "CC", numeroDocumento: "", nombre: "" }])} className="inline-flex items-center gap-1 text-xs font-medium enlace">
              <Plus size={13} /> Otro accionante
            </button>
          </div>
          <div>
            <label className="etiqueta">Derechos involucrados o cumplimiento exigido</label>
            <input name="derechosInvolucrados" className="campo" placeholder="Petición, debido proceso…" />
          </div>
        </Tarjeta>
      )}

      <Tarjeta numero={existente ? 3 : 4} titulo="Detalles">
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
          <input type="checkbox" checked={insumos} onChange={e => setInsumos(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="block text-xs font-semibold text-slate-700">Se van a necesitar insumos del cliente</span>
            <span className="block text-[11px] text-slate-500">El ANS queda suspendido hasta que lleguen; el auxiliar los pide desde el caso.</span>
          </span>
        </label>
        <div>
          <label className="etiqueta">Observaciones</label>
          <textarea name="observaciones" rows={2} className="campo" />
        </div>
      </Tarjeta>
    </div>
  )

  const boton = (
    <>
      {errores.length > 0 && (
        <ul className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 list-disc list-inside">
          {errores.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
      <button disabled={pendiente || !completo || !!etapaAbierta} className="boton-primario w-full py-2.5">
        {pendiente ? "Registrando…" : correoId ? "Registrar, repartir y confirmar recibido" : "Registrar y repartir"}
      </button>
    </>
  )

  if (!amplio) return <form action={enviar} className="space-y-4">{formulario}{boton}</form>

  return (
    <form action={enviar} className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">{formulario}</div>
      {/* Lo que se va a crear, a la vista mientras se llena */}
      <aside className="lg:sticky lg:top-6 h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700">Resumen</h3>
        <dl className="space-y-3 text-xs">
          <div><dt className="text-slate-400 uppercase tracking-wide text-[11px]">Radicado</dt><dd className="mt-0.5 font-mono text-slate-800">{completo ? formatoRadicado(digitos) : "—"}</dd></div>
          <div><dt className="text-slate-400 uppercase tracking-wide text-[11px]">Caso</dt><dd className="mt-0.5 text-slate-800">{encontrado ? `${encontrado.numeroInterno} (existente)` : "Nuevo: el número interno sale al registrar"}</dd></div>
          <div><dt className="text-slate-400 uppercase tracking-wide text-[11px]">Etapa</dt><dd className="mt-0.5 text-slate-800">{ETAPAS[etapa]}</dd></div>
          <div><dt className="text-slate-400 uppercase tracking-wide text-[11px]">Vence</dt><dd className="mt-0.5 text-slate-800">{vence ? vence.replace("T", " ") : conTermino ? "Se calcula con el término" : "Sin fecha"}</dd></div>
          <div><dt className="text-slate-400 uppercase tracking-wide text-[11px]">Criticidad</dt><dd className="mt-0.5 text-slate-800">{criticidad ? CRITICIDADES[criticidad] : "La calcula la app"}</dd></div>
        </dl>
        <p className="border-t border-slate-100 pt-3 text-[11px] leading-4 text-slate-500">Se reparte al auxiliar con menos carga del equipo que atiende la etapa, con el revisor de su equipo.</p>
        {boton}
      </aside>
    </form>
  )
}
