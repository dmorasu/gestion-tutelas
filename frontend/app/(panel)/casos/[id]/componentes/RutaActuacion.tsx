import { Check } from "lucide-react"
import Documento from "@/components/ui/Documento"
import { fechaHora, tiempoRestante } from "@/src/lib/formato"
import type { ArchivoCaso, EscritoFila, Insumo } from "../PanelTrabajo"

// =====================================
// RUTA DE LA ACTUACIÓN
// Los pasos del flujo en una línea: qué se hizo (con fecha y quién), en qué paso va y qué falta,
// (reunión 23-nov: no hay paso de aprobación; el envío sin devolución se entiende aprobado)
// con el responsable y el plazo. Sale de los mismos datos del flujo: no guarda nada aparte.
// =====================================

type Persona = { nombre: string } | null
type Actuacion = {
  estado: string, fechaAsignacion: string, fechaAsumida?: string | null, fechaCierre?: string | null, fechaLimiteEntrega: string | null
  requiereInsumos: boolean, datosFaltantesPendientes: boolean, auxiliar: Persona, revisor: Persona
  insumos: Insumo[], escritos: EscritoFila[], radicaciones?: { fechaRadicacion: string }[], alcancePendiente?: boolean
}
type Paso = { nombre: string, fecha?: string | null, quien?: string | null, nota?: string | null }

// En qué paso está cada estado (índices de PASOS)
const PASO_DEL_ESTADO: Record<string, number> = {
  POR_ASUMIR: 1, EN_INSUMOS: 2, EN_ANALISIS: 3, EN_PROYECCION: 3, AJUSTE_INTERNO: 3, DEVUELTO: 3,
  EN_REVISION: 4, ENTREGADO: 5, APROBADO: 5, RADICADO: 6, CERRADA: 7
}

export default function RutaActuacion({ actuacion: a, archivos }: { actuacion: Actuacion, archivos: ArchivoCaso[] }) {
  const escritos = [...a.escritos].sort((x, y) => y.version - x.version)
  const escrito = escritos[0] ?? null
  const auxiliar = a.auxiliar?.nombre ?? "Sin auxiliar"
  const revisor = a.revisor?.nombre ?? "Sin revisor"
  const pendientes = a.insumos.filter(i => !i.fechaRecepcion)
  const conInsumos = a.requiereInsumos || a.insumos.length > 0
  const ultimoInsumo = a.insumos.map(i => i.fechaRecepcion).filter(Boolean).sort().at(-1) ?? null
  const radicacion = a.radicaciones?.[0]?.fechaRadicacion ?? null
  const actual = PASO_DEL_ESTADO[a.estado] ?? 0

  const pasos: Paso[] = [
    { nombre: "Asignada", fecha: a.fechaAsignacion },
    { nombre: "Tomada", fecha: a.fechaAsumida, quien: a.fechaAsumida ? auxiliar : null },
    { nombre: "Insumos", fecha: conInsumos && !pendientes.length ? ultimoInsumo : null, nota: conInsumos ? `${a.insumos.length - pendientes.length} de ${a.insumos.length}` : "No aplica" },
    { nombre: escrito ? `Escrito V${escrito.version}` : "Escrito", quien: escrito ? auxiliar : null },
    { nombre: "Revisión", fecha: escrito?.fechaEnvioRevision, quien: escrito?.fechaEnvioRevision ? revisor : null, nota: a.estado === "AJUSTE_INTERNO" ? "Devuelta por el revisor" : null },
    { nombre: "Entrega", fecha: escrito?.fechaEntregaEntidad },
    { nombre: "Radicación", fecha: radicacion },
    { nombre: "Cierre", fecha: a.fechaCierre }
  ]

  // Lo que falta ahora, quién lo hace y hasta cuándo
  const plazo = a.fechaLimiteEntrega ? `${fechaHora(a.fechaLimiteEntrega)} · ${tiempoRestante(a.fechaLimiteEntrega)}` : null
  const devolucion = escritos.find(e => e.estado === "DEVUELTO")?.devoluciones.at(-1)
  const siguiente: { accion: string, quien: string, hasta?: string | null, detalle?: string | null } | null = (() => {
    switch (a.estado) {
      case "POR_ASUMIR": return { accion: "Tomar el caso y revisar el expediente", quien: auxiliar, hasta: plazo }
      case "EN_INSUMOS": return {
        accion: `Esperar ${pendientes.length} insumo${pendientes.length === 1 ? "" : "s"} de la entidad y marcarlos al llegar`, quien: auxiliar,
        hasta: pendientes[0]?.fechaLimite ? `la entidad tiene hasta ${fechaHora(pendientes[0].fechaLimite)}` : null,
        detalle: pendientes.map(i => i.descripcion).join(" · ")
      }
      case "EN_ANALISIS":
      case "EN_PROYECCION": return { accion: escrito ? `Terminar la V${escrito.version} y enviarla a revisión` : "Proyectar el escrito, subirlo y enviarlo a revisión", quien: auxiliar, hasta: plazo }
      case "AJUSTE_INTERNO": return { accion: `Ajustar la V${escrito?.version ?? 1} y volverla a enviar a revisión`, quien: auxiliar, hasta: plazo, detalle: escrito?.observacionRevision ? `Revisor: ${escrito.observacionRevision}` : null }
      case "DEVUELTO": return {
        accion: `Corregir la devolución de la entidad y preparar la V${(escrito?.version ?? 1) + 1}`, quien: auxiliar,
        hasta: devolucion?.fechaLimiteCorreccion ? fechaHora(devolucion.fechaLimiteCorreccion) : plazo, detalle: devolucion?.observacion ?? null
      }
      case "EN_REVISION": return { accion: `Revisar la V${escrito?.version ?? 1}: entregarla a la entidad o devolverla al auxiliar`, quien: revisor, hasta: plazo }
      // Sin devolución se entiende aprobado: lo que sigue es la radicación en el juzgado
      case "ENTREGADO":
      case "APROBADO": return a.alcancePendiente
        ? { accion: "Proyectar el escrito completo que sigue al de emergencia cuando lleguen los insumos", quien: auxiliar }
        : { accion: "Registrar una devolución si la entidad la envía; si no, registrar la radicación en el juzgado", quien: "Asistencia administrativa" }
      case "RADICADO": return { accion: "Cerrar con el fallo favorable de contestación o impugnación", quien: `${revisor} o coordinación` }
      default: return null
    }
  })()

  // Lo que se mandó en el último paso hecho: el paquete con el revisor o el que se entregó
  const enviado = escrito && ["EN_REVISION", "ENTREGADO", "APROBADO"].includes(escrito.estado)
    ? { titulo: escrito.estado === "EN_REVISION" ? `${auxiliar} envió la V${escrito.version} a revisión el ${fechaHora(escrito.fechaEnvioRevision)}` : `V${escrito.version} entregada a la entidad el ${fechaHora(escrito.fechaEntregaEntidad)}`, docs: archivos.filter(d => d.escritoId === escrito.id && d.tipo !== "RESPUESTA") }
    : null

  return (
    <div className="mt-4 space-y-3">
      <ol className="flex overflow-x-auto pb-1">
        {pasos.map((p, i) => {
          const hecho = i < actual && !(i === 2 && !conInsumos)
          const enCurso = i === actual
          const noAplica = i === 2 && !conInsumos
          return (
            <li key={p.nombre} className="relative flex min-w-[4.5rem] flex-1 flex-col items-center text-center">
              {i > 0 && <span className={`absolute left-0 right-1/2 top-3 h-0.5 ${i <= actual ? "bg-slate-600" : "bg-slate-200"}`} />}
              {i < pasos.length - 1 && <span className={`absolute left-1/2 right-0 top-3 h-0.5 ${i < actual ? "bg-slate-600" : "bg-slate-200"}`} />}
              <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                hecho ? "bg-slate-700 text-white" : enCurso ? "bg-white text-slate-900 ring-2 ring-slate-900" : "bg-white text-slate-400 ring-1 ring-slate-300"}`}>
                {hecho ? <Check size={13} /> : i + 1}
              </span>
              <span className={`mt-1.5 text-[11px] leading-tight ${enCurso ? "font-semibold text-slate-900" : noAplica ? "text-slate-300" : "text-slate-600"}`}>{p.nombre}</span>
              {hecho && p.fecha && <span className="text-[10px] leading-tight text-slate-400">{fechaHora(p.fecha)}</span>}
              {(hecho || enCurso) && p.quien && <span className="text-[10px] leading-tight text-slate-400">{p.quien}</span>}
              {p.nota && <span className="text-[10px] leading-tight text-slate-400">{p.nota}</span>}
            </li>
          )
        })}
      </ol>

      {(siguiente || enviado) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {siguiente && (
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pendiente ahora</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">{siguiente.accion}</p>
              <p className="mt-0.5 text-xs text-slate-600">
                {siguiente.quien}{siguiente.hasta && <> · {siguiente.hasta}</>}
              </p>
              {siguiente.detalle && <p className="mt-1 text-xs text-slate-600">{siguiente.detalle}</p>}
              {a.datosFaltantesPendientes && <p className="mt-1 text-xs text-amber-700">Esperando los datos faltantes de la asignación: el ANS está suspendido.</p>}
            </div>
          )}
          {enviado && (
            <div className="rounded-lg border border-slate-200 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Último envío</p>
              <p className="mt-0.5 text-sm text-slate-800">{enviado.titulo}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {enviado.docs.length ? enviado.docs.map(d => <Documento key={d.id} d={d} />) : <span className="text-xs text-slate-500">Sin documentos</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
