"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "react-toastify"
import { registrarCorreo } from "../acciones"
import { ETAPAS, TIPOS_SOLICITUD, UNIDADES_TERMINO, isoDesdeLocal, radicado as formatoRadicado } from "@/src/lib/formato"

export type Juzgado = { id: number, nombre: string }
type Parte = { tipoDocumento: string, numeroDocumento: string, nombre: string }

type Props = {
  correoId: number
  sugerencia: { radicado: string | null, juzgadoId: number | null, etapa: string | null, tipoSolicitud: string }
  juzgados: Juzgado[]
  casoExistente: { id: number, radicado: string } | null
}

export default function FormRegistro({ correoId, sugerencia, juzgados, casoExistente }: Props) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()
  const [errores, setErrores] = useState<string[]>([])
  // El alias de cumplimiento agrupa cumplimiento, requerimiento previo y desacato: se precisa aquí
  const [etapa, setEtapa] = useState(sugerencia.etapa ?? "ACCION")
  const [partes, setPartes] = useState<Parte[]>([{ tipoDocumento: "CC", numeroDocumento: "", nombre: "" }])

  const cambiarParte = (i: number, campo: keyof Parte, valor: string) =>
    setPartes(p => p.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))

  const enviar = (datos: FormData) => {
    const terminoValor = Number(datos.get("terminoValor")) || null
    const cuerpo = {
      radicado: String(datos.get("radicado") ?? ""),
      tipoSolicitud: datos.get("tipoSolicitud"),
      etapa,
      juzgadoId: Number(datos.get("juzgadoId")) || null,
      calidadEntidad: datos.get("calidadEntidad"),
      partes: casoExistente ? [] : partes.filter(p => p.nombre.trim()),
      derechosInvolucrados: datos.get("derechosInvolucrados") || null,
      fechaNotificacion: isoDesdeLocal(String(datos.get("fechaNotificacion") ?? "")),
      terminoValor,
      terminoUnidad: terminoValor ? datos.get("terminoUnidad") : null,
      requiereInsumos: datos.get("requiereInsumos") === "on",
      requiereRevisionAbogado: datos.get("requiereRevisionAbogado") === "on",
      origenImpugnacion: etapa === "IMPUGNACION" ? datos.get("origenImpugnacion") : null,
      observaciones: datos.get("observaciones") || null
    }
    iniciar(async () => {
      const r = await registrarCorreo(correoId, cuerpo)
      if (!r.ok) return setErrores(r.errores)
      const { casoId, deOtroOperador } = r.datos as { casoId: number, deOtroOperador: boolean }
      toast.success("Asignación registrada")
      if (deOtroOperador) toast.warn("El radicado figura en el archivo maestro de otro operador")
      router.push(`/casos/${casoId}`)
    })
  }

  return (
    <form action={enviar} className="tarjeta p-5 space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">{casoExistente ? `Nueva etapa del caso ${formatoRadicado(casoExistente.radicado)}` : "Registrar asignación"}</h2>

      <div>
        <label className="etiqueta">Radicado (23 dígitos)</label>
        <input name="radicado" required defaultValue={casoExistente?.radicado ?? sugerencia.radicado ?? ""} readOnly={!!casoExistente} className="campo font-mono" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta">Tipo</label>
          <select name="tipoSolicitud" defaultValue={sugerencia.tipoSolicitud} className="campo" disabled={!!casoExistente}>
            {Object.entries(TIPOS_SOLICITUD).filter(([k]) => k !== "PQRS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {casoExistente && <input type="hidden" name="tipoSolicitud" value={sugerencia.tipoSolicitud} />}
        </div>
        <div>
          <label className="etiqueta">Etapa</label>
          <select value={etapa} onChange={e => setEtapa(e.target.value)} className="campo">
            {Object.entries(ETAPAS).filter(([k]) => k !== "PQRS").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {!casoExistente && (
        <>
          <div>
            <label className="etiqueta">Juzgado</label>
            <select name="juzgadoId" defaultValue={sugerencia.juzgadoId ?? ""} className="campo">
              <option value="">— Sin identificar —</option>
              {juzgados.map(j => <option key={j.id} value={j.id}>{j.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="etiqueta">Calidad de la entidad</label>
            <select name="calidadEntidad" defaultValue="ACCIONADO" className="campo">
              <option value="ACCIONADO">Accionado</option>
              <option value="VINCULADO">Vinculado</option>
              <option value="DEMANDADO">Demandado</option>
            </select>
          </div>
          <fieldset className="space-y-2">
            <legend className="etiqueta">Accionantes</legend>
            {partes.map((p, i) => (
              <div key={i} className="grid grid-cols-[4.5rem,1fr] gap-2">
                <select value={p.tipoDocumento} onChange={e => cambiarParte(i, "tipoDocumento", e.target.value)} className="campo px-2">
                  {["CC", "CE", "NIT", "PPT", "TI", "PAS"].map(t => <option key={t}>{t}</option>)}
                </select>
                <input value={p.numeroDocumento} onChange={e => cambiarParte(i, "numeroDocumento", e.target.value)} placeholder="Número" className="campo" />
                <input value={p.nombre} onChange={e => cambiarParte(i, "nombre", e.target.value)} placeholder="Nombre completo" className="campo col-span-2" />
              </div>
            ))}
            <button type="button" onClick={() => setPartes(p => [...p, { tipoDocumento: "CC", numeroDocumento: "", nombre: "" }])} className="text-xs enlace">
              + Otro accionante
            </button>
          </fieldset>
          <div>
            <label className="etiqueta">Derechos involucrados / cumplimiento exigido</label>
            <input name="derechosInvolucrados" className="campo" />
          </div>
        </>
      )}
      {casoExistente && <input type="hidden" name="calidadEntidad" value="ACCIONADO" />}

      {etapa === "IMPUGNACION" && (
        <div>
          <label className="etiqueta">Impugna</label>
          <select name="origenImpugnacion" defaultValue="ACCIONADO" className="campo">
            <option value="ACCIONADO">La entidad (accionado)</option>
            <option value="ACCIONANTE">El accionante</option>
          </select>
        </div>
      )}

      <div>
        <label className="etiqueta">Notificación ({etapa === "IMPUGNACION" ? "del fallo" : etapa === "DESACATO" ? "de la apertura" : "de la acción o requerimiento"})</label>
        <input type="datetime-local" name="fechaNotificacion" className="campo" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="etiqueta">Término del juez</label>
          <input type="number" min={1} name="terminoValor" className="campo" placeholder={etapa === "IMPUGNACION" ? "3 por defecto" : ""} />
        </div>
        <div>
          <label className="etiqueta">Unidad</label>
          <select name="terminoUnidad" defaultValue="DIAS_HABILES" className="campo">
            {Object.entries(UNIDADES_TERMINO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="requiereInsumos" /> Requiere insumos de la entidad</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="requiereRevisionAbogado" /> Requiere revisión de abogado</label>
        <p className="text-xs text-slate-500">Impugnación y desacato siempre van a revisión (parámetro D16).</p>
      </div>

      <div>
        <label className="etiqueta">Observaciones</label>
        <textarea name="observaciones" rows={2} className="campo" />
      </div>

      {errores.length > 0 && (
        <ul className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 list-disc list-inside">
          {errores.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
      <button disabled={pendiente} className="boton-primario w-full">{pendiente ? "Registrando…" : "Registrar y repartir"}</button>
    </form>
  )
}
