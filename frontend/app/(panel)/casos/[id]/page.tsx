import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { obtenerSesion } from "@/src/auth/dal"
import { tieneRol } from "@/src/auth/permisos"
import { BUZONES, ETAPAS, PROPOSITOS, TIPOS_SOLICITUD, fechaHora, radicado } from "@/src/lib/formato"
import PanelActuacion, { type ActuacionDetalle, type Responsable } from "./PanelActuacion"
import type { ArchivoCaso } from "./PanelTrabajo"

type Detalle = {
  caso: {
    id: number, radicado: string, numeroInterno: string | null, tipoSolicitud: string, calidadEntidad: string, etapaInicial: string, etapaActual: string, estado: string,
    derechosInvolucrados: string | null, observaciones: string | null, deOtroOperador: boolean, createdAt: string,
    juzgado: { nombre: string } | null, registradoPor: { nombre: string } | null,
    partes: { id: number, rol: string, tipoDocumento: string | null, numeroDocumento: string | null, nombre: string }[]
    actuaciones: ActuacionDetalle[]
  }
  correos: {
    id: number, direccion: string, buzon: string | null, remitente: string | null, para: string[], asunto: string | null, fechaCorreo: string,
    proposito: string | null, estado: string, porRevisar: boolean, error: string | null
  }[]
  archivos: ArchivoCaso[]
  motivosCierre: string[]
  envio: string
  almacen: string
}
type EventoHistorial = { id: number, seccion: string, accion: string, cambios: { campo: string, antes: string | null, despues: string | null }[], nombreUsuario: string | null, origen: string | null, createdAt: string }
type Usuario = { id: number, nombre: string, activo: boolean, roles: { codigo: string }[] }

export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sesion = await obtenerSesion()
  const gestiona = tieneRol(sesion.roles, ["ASISTENTE", "COORDINADOR"])
  const coordina = tieneRol(sesion.roles, ["COORDINADOR"])
  const [{ caso, correos, archivos, motivosCierre, envio, almacen }, historial, usuarios] = await Promise.all([
    obtener<Detalle>(`/casos/${id}`),
    obtener<EventoHistorial[]>(`/casos/${id}/historial`),
    obtener<Usuario[]>("/catalogos/usuarios")
  ])
  const esRevisor = tieneRol(sesion.roles, ["REVISOR"])
  // Mismas reglas que el backend (services/permisosActuacion): el botón solo aparece si el paso se puede
  const revisa = (a: ActuacionDetalle) => coordina || (esRevisor && (a.revisorId === sesion.id || (!!a.equipo && a.equipo.id === sesion.equipoId)))
  const trabaja = (a: ActuacionDetalle) => gestiona || a.auxiliarId === sesion.id || revisa(a)
  const delRol = (codigo: string): Responsable[] => usuarios.filter(u => u.activo && u.roles.some(r => r.codigo === codigo)).map(u => ({ id: u.id, nombre: u.nombre }))

  return (
    <div className="space-y-5">
      <Link href="/casos" className="text-xs enlace">← Tablero</Link>

      <section className="tarjeta p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="titulo-pagina">{caso.numeroInterno ?? "Sin número interno"}</h1>
            <p className="font-mono text-sm text-slate-700">{radicado(caso.radicado)}</p>
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

      {(envio === "SIMULADO" || almacen === "LOCAL") && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {envio === "SIMULADO" && "Envío de correos simulado: se registran pero no salen. "}
          {almacen === "LOCAL" && "SharePoint sin configurar: los documentos quedan en la carpeta local de desarrollo."}
        </p>
      )}

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Actuaciones</h2>
        {caso.actuaciones.map(a => (
          <PanelActuacion
            key={a.id}
            casoId={caso.id}
            actuacion={a}
            gestiona={gestiona}
            coordina={coordina}
            usuarioId={sesion.id}
            auxiliares={delRol("AUXILIAR")}
            revisores={delRol("REVISOR")}
            archivos={archivos.filter(x => x.actuacionId === a.id)}
            puedeTrabajar={trabaja(a)}
            puedeRevisar={revisa(a)}
            puedeCerrar={gestiona || revisa(a)}
            motivosCierre={motivosCierre}
          />
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="tarjeta p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Correos</h2>
          <ul className="space-y-2 text-sm">
            {correos.length === 0 && <li className="text-slate-500">Sin correos.</li>}
            {correos.map(c => (
              <li key={c.id} className="flex gap-3">
                <span className="text-xs text-slate-500 whitespace-nowrap w-28 shrink-0">{fechaHora(c.fechaCorreo)}</span>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">
                    {c.direccion === "SALIENTE" ? "Enviado" : "Recibido"}{c.buzon ? ` · ${BUZONES[c.buzon]}` : ""}{c.proposito ? ` · ${PROPOSITOS[c.proposito] ?? c.proposito}` : ""}
                    {c.estado === "SIMULADO" && <span className="text-amber-700"> · Simulado (no salió)</span>}
                    {c.estado === "ERROR" && <span className="text-red-700"> · No se envió</span>}
                    {c.porRevisar && <span className="text-amber-700"> · Por revisar</span>}
                  </p>
                  {c.direccion === "SALIENTE"
                    ? <p className="break-words" title={c.para.join(", ")}>{c.asunto || "(sin asunto)"}</p>
                    : <Link href={`/correos/${c.id}`} className="hover:underline break-words">{c.asunto || "(sin asunto)"}</Link>}
                  {c.error && <p className="text-xs text-red-700 break-words">{c.error}</p>}
                </div>
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
