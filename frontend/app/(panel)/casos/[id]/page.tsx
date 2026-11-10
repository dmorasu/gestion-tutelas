import Link from "next/link"
import clsx from "clsx"
import { ArrowLeft, Briefcase, Clock, FileText, Info, Mail, type LucideIcon } from "lucide-react"
import { obtener } from "@/src/lib/api"
import { obtenerSesion } from "@/src/auth/dal"
import { tieneRol } from "@/src/auth/permisos"
import { ESTADOS_ACTUACION, ETAPAS, TIPOS_SOLICITUD, fechaHora, radicado, tiempoRestante } from "@/src/lib/formato"
import Seccion from "@/components/ui/Seccion"
import Dato from "@/components/ui/Dato"
import Criticidad from "@/components/ui/Criticidad"
import Semaforo from "@/components/ui/Semaforo"
import PanelActuacion, { type ActuacionDetalle, type Responsable } from "./PanelActuacion"
import type { ArchivoCaso } from "./PanelTrabajo"
import HistorialCaso, { type EventoCaso } from "./componentes/HistorialCaso"
import DocumentosCaso, { type DocumentoCaso } from "./componentes/DocumentosCaso"
import CorreosCaso, { type CorreoCaso } from "./componentes/CorreosCaso"

type Detalle = {
  caso: {
    id: number, radicado: string, numeroInterno: string | null, tipoSolicitud: string, calidadEntidad: string, etapaInicial: string, etapaActual: string, estado: string,
    derechosInvolucrados: string | null, observaciones: string | null, deOtroOperador: boolean, createdAt: string, motivoCierre: string | null,
    juzgado: { nombre: string } | null, registradoPor: { nombre: string } | null,
    partes: { id: number, rol: string, tipoDocumento: string | null, numeroDocumento: string | null, nombre: string }[]
    actuaciones: ActuacionDetalle[]
  }
  correos: CorreoCaso[]
  archivos: (ArchivoCaso & DocumentoCaso)[]
  motivosCierre: string[]
  sentidos: Record<string, string[]>
  envio: string
  almacen: string
}
type Usuario = { id: number, nombre: string, activo: boolean, roles: { codigo: string }[] }

type Pestana = "actuacion" | "informacion" | "documentos" | "correos" | "historial"

export default async function CasoPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ tab?: string, actuacion?: string }> }) {
  const { id } = await params
  const filtros = await searchParams
  const sesion = await obtenerSesion()
  const gestiona = tieneRol(sesion.roles, ["ASISTENTE", "COORDINADOR"])
  const coordina = tieneRol(sesion.roles, ["COORDINADOR"])
  const tab = (["actuacion", "informacion", "documentos", "correos", "historial"].includes(filtros.tab ?? "") ? filtros.tab : "actuacion") as Pestana
  const [{ caso, correos, archivos, motivosCierre, sentidos, envio, almacen }, historial, usuarios] = await Promise.all([
    obtener<Detalle>(`/casos/${id}`),
    tab === "historial" ? obtener<EventoCaso[]>(`/casos/${id}/historial`).catch(() => null) : Promise.resolve(null),
    obtener<Usuario[]>("/catalogos/usuarios")
  ])
  const esRevisor = tieneRol(sesion.roles, ["REVISOR"])
  // Mismas reglas que el backend (services/permisosActuacion): el botón solo aparece si el paso se puede
  const revisa = (a: ActuacionDetalle) => coordina || (esRevisor && (a.revisorId === sesion.id || (!!a.equipo && a.equipo.id === sesion.equipoId)))
  const trabaja = (a: ActuacionDetalle) => gestiona || a.auxiliarId === sesion.id || revisa(a)
  const delRol = (codigo: string): Responsable[] => usuarios.filter(u => u.activo && u.roles.some(r => r.codigo === codigo)).map(u => ({ id: u.id, nombre: u.nombre }))

  // La actuación que se mira: la elegida o la abierta más reciente
  const actuaciones = caso.actuaciones
  const abiertas = actuaciones.filter(a => a.estado !== "CERRADA")
  const actual = actuaciones.find(a => a.id === Number(filtros.actuacion)) ?? abiertas[abiertas.length - 1] ?? actuaciones[actuaciones.length - 1]
  const enlace = (cambios: { tab?: Pestana, actuacion?: number }) =>
    `/casos/${caso.id}?${new URLSearchParams({ tab: cambios.tab ?? tab, ...(cambios.actuacion ?? actual?.id ? { actuacion: String(cambios.actuacion ?? actual?.id) } : {}) })}`

  const pestanas: { clave: Pestana, nombre: string, Icono: LucideIcon, insignia?: number | string | false }[] = [
    { clave: "actuacion", nombre: "Actuación", Icono: Briefcase },
    { clave: "informacion", nombre: "Información", Icono: Info },
    { clave: "documentos", nombre: "Documentos", Icono: FileText, insignia: archivos.length > 0 && archivos.length },
    { clave: "correos", nombre: "Correos", Icono: Mail, insignia: correos.some(c => c.porRevisar) ? "Por revisar" : correos.length > 0 && correos.length },
    { clave: "historial", nombre: "Historial", Icono: Clock }
  ]
  const accionantes = caso.partes.filter(p => p.rol === "ACCIONANTE")

  return (
    <div className="space-y-6 pt-2">
      {/* ENCABEZADO */}
      <div>
        <Link href="/casos" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"><ArrowLeft size={14} /> Volver a casos</Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-800">Caso {caso.numeroInterno ?? "sin número"}</h1>
              <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-semibold", caso.estado === "ABIERTO" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-600")}>
                {caso.estado === "ABIERTO" ? "Abierto" : "Cerrado"}
              </span>
              {actual && <Criticidad valor={actual.criticidad} />}
            </div>
            <p className="mt-1 font-mono text-sm text-slate-600">{radicado(caso.radicado)}</p>
            <p className="mt-1 text-sm text-slate-500">
              {TIPOS_SOLICITUD[caso.tipoSolicitud]} · {caso.juzgado?.nombre ?? "Juzgado sin identificar"}
              {accionantes.length > 0 && ` · ${accionantes.map(p => p.nombre).join(", ")}`}
            </p>
            <p className="mt-1 text-xs text-slate-400">Registrado por {caso.registradoPor?.nombre ?? "—"} el {fechaHora(caso.createdAt)}</p>
          </div>
        </div>
      </div>

      {caso.deOtroOperador && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">El archivo maestro asigna este radicado a otro operador (ANS-13). Suspenda la elaboración hasta que el supervisor defina el operador.</p>
      )}
      {(envio === "SIMULADO" || almacen === "LOCAL") && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {envio === "SIMULADO" && "Envío de correos simulado: se registran pero no salen. "}
          {almacen === "LOCAL" && "SharePoint sin configurar: los documentos quedan en la carpeta local de desarrollo."}
        </p>
      )}

      {/* ACTUACIONES DEL CASO (si hay más de una) */}
      {actuaciones.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {actuaciones.map(a => (
            <Link key={a.id} href={enlace({ actuacion: a.id })}
              className={clsx("rounded-lg border px-3 py-2 text-xs transition", a.id === actual?.id ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
              <span className="font-semibold">{ETAPAS[a.etapa]}</span> · {ESTADOS_ACTUACION[a.estado]}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* COLUMNA PRINCIPAL */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Secciones del caso">
            {pestanas.map(({ clave, nombre, Icono, insignia }) => (
              <Link key={clave} href={enlace({ tab: clave })} aria-current={tab === clave ? "page" : undefined}
                className={clsx("inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition",
                  tab === clave ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700")}>
                <Icono size={15} />
                {nombre}
                {insignia ? (
                  <span className={clsx("rounded-full px-1.5 py-px text-[10px]", insignia === "Por revisar" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600")}>{insignia}</span>
                ) : null}
              </Link>
            ))}
          </nav>

          {tab === "actuacion" && actual && (
            <PanelActuacion
              key={actual.id}
              casoId={caso.id}
              actuacion={actual}
              gestiona={gestiona}
              coordina={coordina}
              usuarioId={sesion.id}
              auxiliares={delRol("AUXILIAR")}
              revisores={delRol("REVISOR")}
              archivos={archivos.filter(x => x.actuacionId === actual.id)}
              puedeTrabajar={trabaja(actual)}
              puedeRevisar={revisa(actual)}
              puedeCerrar={gestiona || revisa(actual)}
              motivosCierre={motivosCierre}
              sentidos={sentidos}
            />
          )}

          {tab === "informacion" && (
            <>
              <Seccion titulo="Datos del caso">
                <dl className="grid gap-5 sm:grid-cols-3">
                  <Dato etiqueta="Número interno" valor={caso.numeroInterno} />
                  <Dato etiqueta="Radicado" valor={<span className="font-mono">{radicado(caso.radicado)}</span>} />
                  <Dato etiqueta="Tipo" valor={TIPOS_SOLICITUD[caso.tipoSolicitud]} />
                  <Dato etiqueta="Juzgado" valor={caso.juzgado?.nombre} />
                  <Dato etiqueta="Calidad de la entidad" valor={caso.calidadEntidad.charAt(0) + caso.calidadEntidad.slice(1).toLowerCase()} />
                  <Dato etiqueta="Llegó en" valor={`${ETAPAS[caso.etapaInicial]} · hoy en ${ETAPAS[caso.etapaActual]}`} />
                  <Dato etiqueta="Derechos involucrados" valor={caso.derechosInvolucrados} className="sm:col-span-3" />
                  {caso.observaciones && <Dato etiqueta="Observaciones" valor={<span className="whitespace-pre-line">{caso.observaciones}</span>} className="sm:col-span-3" />}
                  {caso.motivoCierre && <Dato etiqueta="Causal de cierre" valor={caso.motivoCierre} className="sm:col-span-3" />}
                </dl>
              </Seccion>
              <Seccion titulo="Partes">
                {caso.partes.length === 0 ? <p className="text-xs text-slate-500">Sin partes registradas.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {caso.partes.map(p => (
                      <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                        <span className="font-medium text-slate-800">{p.nombre}</span>
                        <span className="text-xs text-slate-500">{p.rol.charAt(0) + p.rol.slice(1).toLowerCase()} · {p.tipoDocumento} {p.numeroDocumento}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Seccion>
            </>
          )}

          {tab === "documentos" && (
            <Seccion titulo="Documentos del expediente">
              <DocumentosCaso
                actuaciones={actuaciones.map(a => ({ id: a.id, etapa: a.etapa, escritos: a.escritos.map(e => ({ id: e.id, version: e.version })) }))}
                documentos={archivos}
                puedeSubir={idActuacion => { const a = actuaciones.find(x => x.id === idActuacion); return !!a && a.estado !== "CERRADA" && trabaja(a) }}
              />
            </Seccion>
          )}

          {tab === "correos" && (
            <Seccion titulo="Correos del caso">
              <CorreosCaso
                casoId={caso.id}
                correos={correos}
                actuaciones={abiertas.filter(trabaja).map(a => ({ id: a.id, etapa: a.etapa, nombre: ETAPAS[a.etapa] }))}
                puedeEscribir={abiertas.some(trabaja)}
              />
            </Seccion>
          )}

          {tab === "historial" && (
            <Seccion titulo="Historial">
              <HistorialCaso eventos={historial} />
            </Seccion>
          )}
        </div>

        {/* COLUMNA LATERAL: plazos y responsables de la actuación que se mira */}
        {actual && (
          <aside className="space-y-6">
            <Seccion titulo={`Plazos · ${ETAPAS[actual.etapa]}`}>
              <dl className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-600">{ESTADOS_ACTUACION[actual.estado]}</span>
                  {actual.semaforo && <Semaforo valor={actual.semaforo} />}
                </div>
                <Dato etiqueta="Límite de entrega (ANS)" valor={actual.fechaLimiteEntrega
                  ? <><b className="text-slate-900">{fechaHora(actual.fechaLimiteEntrega)}</b>{actual.estado !== "CERRADA" && <span className="block text-slate-500">{tiempoRestante(actual.fechaLimiteEntrega)}</span>}</>
                  : actual.requiereInsumos ? "Suspendido mientras llegan los insumos" : null} />
                <Dato etiqueta={actual.fechaVencimientoInformada ? "Vence (informado por la entidad)" : "Vencimiento judicial"} valor={fechaHora(actual.fechaVencimiento)} />
                <Dato etiqueta="Asignada" valor={fechaHora(actual.fechaAsignacion)} />
                <Dato etiqueta="Cuenta desde" valor={fechaHora(actual.fechaAsignacionEfectiva)} />
              </dl>
            </Seccion>
            <Seccion titulo="Responsables">
              <dl className="space-y-4">
                <Dato etiqueta="Auxiliar" valor={actual.auxiliar?.nombre ?? <span className="text-amber-700">Sin asignar</span>} />
                <Dato etiqueta="Revisor" valor={actual.revisor?.nombre ?? <span className="text-amber-700">Sin asignar</span>} />
                <Dato etiqueta="Equipo" valor={actual.equipo?.nombre} />
              </dl>
            </Seccion>
          </aside>
        )}
      </div>
    </div>
  )
}
