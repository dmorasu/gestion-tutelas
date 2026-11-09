import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { ETAPAS, fechaHora, radicado } from "@/src/lib/formato"
import FormRegistro, { type Juzgado } from "./FormRegistro"
import AccionesCorreo from "./AccionesCorreo"

type Detalle = {
  correo: {
    id: number, remitente: string | null, nombreRemitente: string | null, para: string[], cc: string[], asunto: string | null,
    cuerpoTexto: string | null, fechaCorreo: string, etapaDetectada: string | null, fuenteEtapa: string | null, radicados: string[], estado: string,
    archivos: { id: number, nombre: string, tamano: number | null }[],
    caso: { id: number, radicado: string, actuaciones: { id: number, etapa: string, estado: string }[] } | null
  }
  sugerencia: { radicado: string | null, juzgadoId: number | null, etapa: string | null, tipoSolicitud: string }
  deOtroOperador: boolean
}

export default async function CorreoPage({ params }: { params: Promise<{ id: string }> }) {
  await requiereRol("ASISTENTE", "COORDINADOR")
  const { id } = await params
  const [{ correo, sugerencia, deOtroOperador }, juzgados] = await Promise.all([
    obtener<Detalle>(`/correos/${id}`),
    obtener<Juzgado[]>("/catalogos/juzgados")
  ])

  return (
    <div className="space-y-4">
      <Link href="/correos" className="text-xs enlace">← Correos por registrar</Link>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* El correo tal como llegó */}
        <section className="tarjeta p-5 lg:col-span-3 space-y-3 min-w-0">
          <h1 className="text-base font-semibold text-slate-800 break-words">{correo.asunto || "(sin asunto)"}</h1>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-slate-500">De</dt><dd className="break-all">{correo.nombreRemitente} &lt;{correo.remitente}&gt;</dd>
            <dt className="text-slate-500">Para</dt><dd className="break-all">{[...correo.para, ...correo.cc].join(", ")}</dd>
            <dt className="text-slate-500">Llegó</dt><dd className="font-medium">{fechaHora(correo.fechaCorreo)} <span className="font-normal text-slate-500">(fecha de asignación)</span></dd>
            <dt className="text-slate-500">Etapa</dt>
            <dd>{correo.etapaDetectada ? `${ETAPAS[correo.etapaDetectada]} (por ${correo.fuenteEtapa === "ENCABEZADO" ? "regla de Exchange" : "alias"})` : "No identificada"}</dd>
            <dt className="text-slate-500">Radicados</dt>
            <dd>{correo.radicados.length ? correo.radicados.map(radicado).join(", ") : "No se encontró ninguno"}</dd>
          </dl>
          {deOtroOperador && (
            <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              El archivo maestro asigna este radicado a otro operador (ANS-13). No proyecte escritos sin confirmarlo con la entidad.
            </p>
          )}
          {correo.archivos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {correo.archivos.map(a => (
                <li key={a.id}>
                  <a href={`/archivos/${a.id}`} target="_blank" className="inline-block rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">📎 {a.nombre}</a>
                </li>
              ))}
            </ul>
          )}
          <pre className="whitespace-pre-wrap break-words text-sm text-slate-700 bg-slate-50 rounded p-3 max-h-[32rem] overflow-y-auto font-sans">{correo.cuerpoTexto}</pre>
        </section>

        {/* Formulario precargado */}
        <section className="lg:col-span-2 space-y-4">
          {correo.estado === "POR_REGISTRAR" ? (
            <>
              <FormRegistro correoId={correo.id} sugerencia={sugerencia} juzgados={juzgados} casoExistente={correo.caso ? { id: correo.caso.id, radicado: correo.caso.radicado } : null} />
              <AccionesCorreo correoId={correo.id} actuaciones={correo.caso?.actuaciones.filter(a => a.estado !== "CERRADA") ?? []} />
            </>
          ) : (
            <div className="tarjeta p-5 text-sm">
              Este correo ya está {correo.estado === "ASOCIADO" ? "asociado" : "descartado"}.
              {correo.caso && <> Ver <Link href={`/casos/${correo.caso.id}`} className="enlace">caso {radicado(correo.caso.radicado)}</Link>.</>}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
