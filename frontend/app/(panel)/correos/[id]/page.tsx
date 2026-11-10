import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { BUZONES, ETAPAS, PROPOSITOS, fechaHora, radicado } from "@/src/lib/formato"
import Criticidad from "@/components/ui/Criticidad"
import FormRegistro, { type Juzgado } from "./FormRegistro"
import AccionesCorreo from "./AccionesCorreo"
import AtenderRespuesta, { type Contexto } from "./AtenderRespuesta"
import Documento from "@/components/ui/Documento"

type Detalle = {
  correo: {
    id: number, buzon: string | null, remitente: string | null, nombreRemitente: string | null, para: string[], cc: string[], asunto: string | null,
    cuerpoTexto: string | null, fechaCorreo: string, etapaDetectada: string | null, fuenteEtapa: string | null,
    criticidadDetectada: string | null, vencimientoDetectado: string | null, enlaces: string[], radicados: string[], estado: string,
    porRevisar: boolean, proposito: string | null,
    archivos: { id: number, nombre: string, tamano: number | null, proveedor: string | null, webUrl: string | null }[],
    caso: { id: number, radicado: string, numeroInterno: string | null, actuaciones: { id: number, etapa: string, estado: string }[] } | null
  }
  sugerencia: { radicado: string | null, juzgadoId: number | null, etapa: string | null, criticidad: string | null, fechaVencimiento: string | null, tipoSolicitud: string }
  deOtroOperador: boolean
  contexto: Contexto | null
  sugerenciaRespuesta: string | null
}

// Un Excel adjunto puede ser una asignación en paquete
const esExcel = (nombre: string) => /\.(xlsx|csv)$/i.test(nombre)

export default async function CorreoPage({ params }: { params: Promise<{ id: string }> }) {
  await requiereRol("ASISTENTE", "COORDINADOR")
  const { id } = await params
  const [{ correo, sugerencia, deOtroOperador, contexto, sugerenciaRespuesta }, juzgados] = await Promise.all([
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
            <dt className="text-slate-500">Buzón</dt>
            <dd>{correo.buzon ? BUZONES[correo.buzon] : "—"}{correo.proposito ? ` · ${PROPOSITOS[correo.proposito] ?? correo.proposito}` : ""}</dd>
            <dt className="text-slate-500">Llegó</dt>
            <dd className="font-medium">{fechaHora(correo.fechaCorreo)} {correo.buzon === "ASIGNACIONES" && <span className="font-normal text-slate-500">(fecha de asignación)</span>}</dd>
            <dt className="text-slate-500">Etapa</dt>
            <dd>{correo.etapaDetectada ? `${ETAPAS[correo.etapaDetectada]} (${correo.fuenteEtapa === "ASUNTO" ? "del asunto" : "por el texto: confirmar"})` : "No identificada"}</dd>
            <dt className="text-slate-500">Criticidad</dt>
            <dd>{correo.criticidadDetectada ? <Criticidad valor={correo.criticidadDetectada} /> : "No viene en el asunto"}</dd>
            <dt className="text-slate-500">Vence</dt>
            <dd>{correo.vencimientoDetectado ? fechaHora(correo.vencimientoDetectado) : "No viene en el asunto"}</dd>
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
              {correo.archivos.map(a => <li key={a.id}><Documento d={a} /></li>)}
            </ul>
          )}
          {correo.estado === "POR_REGISTRAR" && correo.archivos.filter(a => esExcel(a.nombre)).map(a => (
            <Link key={a.id} href={`/casos/nuevo?archivoId=${a.id}`} className="block rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm hover:bg-slate-100">
              Registrar las asignaciones del Excel <b>{a.nombre}</b> →
            </Link>
          ))}
          {correo.enlaces.length > 0 && (
            <ul className="space-y-1 text-xs">
              {correo.enlaces.map(e => <li key={e} className="truncate"><a href={e} target="_blank" rel="noreferrer" className="enlace">🔗 {e}</a></li>)}
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
            <div className="tarjeta p-5 text-sm space-y-3">
              <p>
                Este correo ya está {correo.estado === "ASOCIADO" ? "asociado" : "descartado"}.
                {correo.caso && <> Ver <Link href={`/casos/${correo.caso.id}`} className="enlace">caso {correo.caso.numeroInterno ?? radicado(correo.caso.radicado)}</Link>.</>}
              </p>
              {correo.porRevisar && correo.caso && (
                contexto
                  ? <AtenderRespuesta correoId={correo.id} casoId={correo.caso.id} proposito={correo.proposito} contexto={contexto} sugerencia={sugerenciaRespuesta} />
                  : null
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
