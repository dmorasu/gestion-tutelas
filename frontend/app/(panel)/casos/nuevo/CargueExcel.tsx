"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "react-toastify"
import { acusarPaquete, registrarTanda } from "../acciones"
import { ETAPAS, TIPOS_SOLICITUD, fechaHora, isoDesdeLocal, valorFechaHoraLocal } from "@/src/lib/formato"

// Datos que se buscan en el Excel (mismo orden que backend/src/services/cargueExcel.ts)
const CAMPOS: { clave: string, nombre: string }[] = [
  { clave: "radicado", nombre: "Radicado" },
  { clave: "etapa", nombre: "Etapa / actuación" },
  { clave: "criticidad", nombre: "Criticidad" },
  { clave: "vencimiento", nombre: "Vencimiento" },
  { clave: "notificacion", nombre: "Notificación" },
  { clave: "accionante", nombre: "Accionante" },
  { clave: "documento", nombre: "Documento" },
  { clave: "juzgado", nombre: "Juzgado" },
  { clave: "derechos", nombre: "Derechos / asunto" },
  { clave: "observaciones", nombre: "Observaciones" }
]
const TANDA = 10

export type Analisis = {
  hoja: string, encabezados: string[], filas: string[][], mapeo: Record<string, number | null>,
  archivo: { id: number, nombre: string }, correo: { id: number, asunto: string | null, remitente: string | null, fechaCorreo: string } | null
}
type Resultado = { numero: number, ok: boolean, radicado: string | null, numeroInterno?: string | null, casoId?: number, error?: string }

const radicadoValido = (t?: string) => (t ?? "").replace(/\D/g, "").length === 23

// inicial: el Excel adjunto de un correo, ya leído en el servidor
export default function CargueExcel({ inicial }: { inicial: Analisis | null }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [cargando, setCargando] = useState(false)
  const [analisis, setAnalisis] = useState<Analisis | null>(inicial)
  const [mapeo, setMapeo] = useState<Record<string, number | null>>(inicial?.mapeo ?? {})
  // Si vino en un correo, la asignación es la hora de llegada del correo (protege el ANS)
  const [fechaAsignacion, setFechaAsignacion] = useState(inicial ? valorFechaHoraLocal(inicial.correo?.fechaCorreo ?? new Date().toISOString()) : "")
  const [etapaPorDefecto, setEtapaPorDefecto] = useState("")
  const [tipoSolicitud, setTipoSolicitud] = useState("TUTELA")
  const [enviarAcuse, setEnviarAcuse] = useState(true)
  const [avance, setAvance] = useState<number | null>(null)
  const [resultados, setResultados] = useState<Resultado[]>([])

  const analizar = async (datos: FormData) => {
    setCargando(true)
    setResultados([])
    try {
      const r = await fetch("/cargues/analizar", { method: "POST", body: datos })
      const json = await r.json().catch(() => null)
      if (!r.ok) return void toast.error(json?.error ?? "No se pudo leer el archivo")
      const a = json as Analisis
      setAnalisis(a)
      setMapeo(a.mapeo)
      setFechaAsignacion(valorFechaHoraLocal(a.correo?.fechaCorreo ?? new Date().toISOString()))
    } finally {
      setCargando(false)
    }
  }

  // Cada fila del Excel con los datos según el emparejamiento de columnas
  const filas = useMemo(() => (analisis?.filas ?? []).map((f, i) => ({
    numero: i + 1,
    ...Object.fromEntries(CAMPOS.map(c => [c.clave, mapeo[c.clave] !== null && mapeo[c.clave] !== undefined ? f[mapeo[c.clave] as number] ?? "" : ""]))
  })) as ({ numero: number } & Record<string, string>)[], [analisis, mapeo])
  const validas = filas.filter(f => radicadoValido(f.radicado))
  const sinEtapa = mapeo.etapa === null || mapeo.etapa === undefined

  const registrar = async () => {
    if (!analisis) return
    if (!fechaAsignacion) return void toast.error("Indique la fecha y hora de asignación")
    if (sinEtapa && !etapaPorDefecto) return void toast.error("Elija la columna de la etapa o una etapa para todas las filas")
    if (!confirm(`¿Registrar ${validas.length} asignaciones? Cada una queda con su número interno y se reparte a su equipo.`)) return
    const todos: Resultado[] = []
    setAvance(0)
    for (let i = 0; i < validas.length; i += TANDA) {
      const r = await registrarTanda({
        filas: validas.slice(i, i + TANDA), fechaAsignacion: isoDesdeLocal(fechaAsignacion), etapaPorDefecto: etapaPorDefecto || null,
        tipoSolicitud, archivoId: analisis.archivo.id
      })
      if (!r.ok) { toast.error(r.errores.join(". ")); break }
      todos.push(...(r.datos as Resultado[]))
      setResultados([...todos])
      setAvance(Math.min(validas.length, i + TANDA))
    }
    setAvance(null)
    const registrados = todos.filter(x => x.ok && x.radicado && x.numeroInterno).map(x => ({ radicado: x.radicado!, numeroInterno: x.numeroInterno! }))
    toast.success(`${registrados.length} de ${validas.length} asignaciones registradas`)
    if (analisis.correo) {
      // Una sola confirmación con todo el paquete (o solo marcar el correo como atendido)
      const r = await acusarPaquete(analisis.correo.id, enviarAcuse ? registrados : [])
      if (!r.ok) toast.error(r.errores.join(". "))
    }
  }

  if (!analisis) {
    return (
      <div className="tarjeta p-6 space-y-3 max-w-xl">
        <input ref={entrada} type="file" accept=".xlsx,.csv" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { const d = new FormData(); d.set("archivo", f); void analizar(d) } }} />
        <button disabled={cargando} onClick={() => entrada.current?.click()} className="boton-primario">{cargando ? "Leyendo…" : "Elegir Excel"}</button>
        <p className="text-xs text-slate-500">.xlsx o .csv · primera hoja</p>
      </div>
    )
  }

  const hechos = new Map(resultados.map(r => [r.numero, r]))

  return (
    <div className="space-y-4">
      <div className="tarjeta p-4 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <p><b>{analisis.archivo.nombre}</b> · hoja {analisis.hoja} · {filas.length} filas · <span className={validas.length < filas.length ? "text-amber-700" : ""}>{validas.length} con radicado válido</span></p>
          {analisis.correo && <p className="text-xs text-slate-500">Llegó en el correo de {analisis.correo.remitente} el {fechaHora(analisis.correo.fechaCorreo)}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CAMPOS.map(c => (
            <div key={c.clave}>
              <label className="etiqueta">{c.nombre}</label>
              <select value={mapeo[c.clave] ?? ""} onChange={e => setMapeo(m => ({ ...m, [c.clave]: e.target.value === "" ? null : Number(e.target.value) }))}
                className={`campo ${c.clave === "radicado" && mapeo.radicado == null ? "border-red-400" : ""}`}>
                <option value="">— No viene —</option>
                {analisis.encabezados.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-t border-slate-100 pt-3">
          <div>
            <label className="etiqueta">Fecha y hora de asignación</label>
            <input type="datetime-local" value={fechaAsignacion} onChange={e => setFechaAsignacion(e.target.value)} className="campo" />
          </div>
          <div>
            <label className="etiqueta">Etapa {sinEtapa ? "de todas las filas" : "si la celda está vacía"}</label>
            <select value={etapaPorDefecto} onChange={e => setEtapaPorDefecto(e.target.value)} className="campo">
              <option value="">—</option>
              {Object.entries(ETAPAS).filter(([k]) => k !== "PQRS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="etiqueta">Tipo</label>
            <select value={tipoSolicitud} onChange={e => setTipoSolicitud(e.target.value)} className="campo">
              {Object.entries(TIPOS_SOLICITUD).filter(([k]) => k !== "PQRS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex flex-col justify-end gap-2">
            {analisis.correo && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enviarAcuse} onChange={e => setEnviarAcuse(e.target.checked)} /> Confirmar el recibido del paquete</label>
            )}
            <button disabled={avance !== null || !validas.length || mapeo.radicado == null} onClick={registrar} className="boton-primario">
              {avance !== null ? `Registrando ${avance} de ${validas.length}…` : `Registrar ${validas.length} asignaciones`}
            </button>
          </div>
        </div>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla w-full text-xs">
          <thead>
            <tr><th>#</th>{CAMPOS.filter(c => mapeo[c.clave] != null).map(c => <th key={c.clave}>{c.nombre}</th>)}<th>Resultado</th></tr>
          </thead>
          <tbody>
            {filas.slice(0, 300).map(f => {
              const r = hechos.get(f.numero)
              return (
                <tr key={f.numero} className={!radicadoValido(f.radicado) ? "bg-red-50" : ""}>
                  <td>{f.numero}</td>
                  {CAMPOS.filter(c => mapeo[c.clave] != null).map(c => <td key={c.clave} className="max-w-[14rem] truncate" title={f[c.clave]}>{f[c.clave]}</td>)}
                  <td className="whitespace-nowrap">
                    {!radicadoValido(f.radicado) && <span className="text-red-700">Radicado no válido: no se registra</span>}
                    {r?.ok && <Link href={`/casos/${r.casoId}`} className="enlace">{r.numeroInterno}</Link>}
                    {r && !r.ok && <span className="text-red-700">{r.error}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filas.length > 300 && <p className="p-3 text-xs text-slate-500">Se muestran 300 de {filas.length} filas; se registran todas.</p>}
      </div>
    </div>
  )
}
