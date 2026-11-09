import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { obtenerSesion } from "@/src/auth/dal"
import { tieneRol } from "@/src/auth/permisos"
import { ETAPAS, TIPOS_SOLICITUD, fechaHora, radicado } from "@/src/lib/formato"
import PanelActuacion, { type ActuacionDetalle, type Responsable } from "./PanelActuacion"

type Detalle = {
  caso: {
    id: number, radicado: string, tipoSolicitud: string, calidadEntidad: string, etapaInicial: string, etapaActual: string, estado: string,
    derechosInvolucrados: string | null, observaciones: string | null, deOtroOperador: boolean, createdAt: string,
    juzgado: { nombre: string } | null, registradoPor: { nombre: string } | null,
    partes: { id: number, rol: string, tipoDocumento: string | null, numeroDocumento: string | null, nombre: string }[]
    actuaciones: ActuacionDetalle[]
  }
  correos: { id: number, direccion: string, remitente: string | null, asunto: string | null, fechaCorreo: string, proposito: string | null }[]
  archivos: { id: number, nombre: string, actuacionId: number | null }[]
}
type EventoHistorial = { id: number, seccion: string, accion: string, cambios: { campo: string, antes: string | null, despues: string | null }[], nombreUsuario: string | null, origen: string | null, createdAt: string }
type Usuario = { id: number, nombre: string, activo: boolean, roles: { codigo: string }[] }

export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sesion = await obtenerSesion()
  const gestiona = tieneRol(sesion.roles, ["ASISTENTE", "COORDINADOR"])
  const [{ caso, correos, archivos }, historial, usuarios] = await Promise.all([
    obtener<Detalle>(`/casos/${id}`),
    obtener<EventoHistorial[]>(`/casos/${id}/historial`),
    obtener<Usuario[]>("/catalogos/usuarios")
  ])
  const delRol = (codigo: string): Responsable[] => usuarios.filter(u => u.activo && u.roles.some(r => r.codigo === codigo)).map(u => ({ id: u.id, nombre: u.nombre }))

  return (
    <div className="space-y-5">
      <Link href="/casos" className="text-xs enlace">← Tablero</Link>

      <section className="tarjeta p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="titulo-pagina font-mono">{radicado(caso.radicado)}</h1>
            <p className="text-sm text-slate-600">
              {TIPOS_SOLICITUD[caso.tipoSolicitud]} · {caso.juzgado?.nombre ?? "Juzgado sin identificar"} · Entidad {caso.calidadEntidad.toLowerCase()}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className={caso.estado === "ABIERTO" ? "text-emerald-700 font-medium" : "text-slate-500"}>{caso.estado === "ABIERTO" ? "Abierto" : "Cerrado"}</p>
            <p className="text-xs text-slate-500">Llegó en {ETAPAS[caso.etapaInicial]} · hoy en {ETAPAS[caso.etapaActual]}</p>
          </div>
        </div>
        {caso.deOtroOperador && (
          <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">El archivo maestro asigna este radicado a otro operador (ANS-13).</p>
        )}
        <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="etiqueta">Accionantes</p>
            {caso.partes.length === 0 && <p className="text-slate-500">Sin registrar</p>}
            <ul>{caso.partes.map(p => <li key={p.id}>{p.nombre} <span className="text-slate-500">{p.tipoDocumento} {p.numeroDocumento}</span></li>)}</ul>
          </div>
          <div>
            <p className="etiqueta">Derechos involucrados</p>
            <p>{caso.derechosInvolucrados || "—"}</p>
            {caso.observaciones && <p className="mt-2 text-slate-600">{caso.observaciones}</p>}
          </div>
        </div>
      </section>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Actuaciones</h2>
        {caso.actuaciones.map(a => (
          <PanelActuacion
            key={a.id}
            casoId={caso.id}
            actuacion={a}
            gestiona={gestiona}
            usuarioId={sesion.id}
            auxiliares={delRol("AUXILIAR")}
            abogados={delRol("ABOGADO")}
            archivos={archivos.filter(x => x.actuacionId === a.id)}
          />
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="tarjeta p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Correos</h2>
          <ul className="space-y-2 text-sm">
            {correos.map(c => (
              <li key={c.id} className="flex gap-3">
                <span className="text-xs text-slate-500 whitespace-nowrap w-28 shrink-0">{fechaHora(c.fechaCorreo)}</span>
                <span className={c.direccion === "SALIENTE" ? "text-slate-900" : ""}>
                  {c.direccion === "SALIENTE" ? "→ " : "← "}
                  <Link href={`/correos/${c.id}`} className="hover:underline">{c.asunto || "(sin asunto)"}</Link>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="tarjeta p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Historial</h2>
          <ol className="space-y-3 text-sm max-h-[28rem] overflow-y-auto">
            <li className="text-xs text-slate-500">{fechaHora(caso.createdAt)} · Registró el caso {caso.registradoPor?.nombre ?? ""}</li>
            {historial.map(h => (
              <li key={h.id}>
                <p className="text-xs text-slate-500">{fechaHora(h.createdAt)} · {h.nombreUsuario ?? "Sistema"}{h.origen && h.origen !== "WEB" ? ` (${h.origen.toLowerCase()})` : ""}</p>
                <p className="font-medium">{h.accion === "CREADO" ? "Creó" : h.accion === "ELIMINADO" ? "Eliminó" : "Cambió"} {h.seccion.toLowerCase()}</p>
                <ul className="text-xs text-slate-600">
                  {h.cambios.map((c, i) => <li key={i}>{c.campo}: {c.antes ?? "—"} → <span className="text-slate-900">{c.despues ?? "—"}</span></li>)}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
