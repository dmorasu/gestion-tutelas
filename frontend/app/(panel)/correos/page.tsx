import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { ETAPAS, fechaHora, radicado, tiempoRestante } from "@/src/lib/formato"
import BotonLeerBuzon from "./BotonLeerBuzon"

type CorreoFila = {
  id: number, remitente: string | null, nombreRemitente: string | null, asunto: string | null, fechaCorreo: string,
  etapaDetectada: string | null, radicados: string[], caso: { id: number, radicado: string } | null,
  archivos: { id: number }[], deOtroOperador: boolean
}

export default async function CorreosPage({ searchParams }: { searchParams: Promise<{ etapa?: string, estado?: string, pagina?: string }> }) {
  await requiereRol("ASISTENTE", "COORDINADOR")
  const filtros = await searchParams
  const query = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][])
  const { correos, total } = await obtener<{ correos: CorreoFila[], total: number }>(`/correos?${query}`)
  const estado = filtros.estado ?? "POR_REGISTRAR"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Correos {estado === "POR_REGISTRAR" ? "por registrar" : estado === "ASOCIADO" ? "asociados" : "descartados"}</h1>
          <p className="mt-1 text-xs text-slate-400">{total} correos</p>
        </div>
        <div className="flex gap-2 items-center">
          <form className="flex gap-2">
            <select name="estado" defaultValue={estado} className="campo w-auto">
              <option value="POR_REGISTRAR">Por registrar</option>
              <option value="ASOCIADO">Asociados</option>
              <option value="DESCARTADO">Descartados</option>
            </select>
            <select name="etapa" defaultValue={filtros.etapa ?? ""} className="campo w-auto">
              <option value="">Todas las etapas</option>
              {["ACCION", "IMPUGNACION", "CUMPLIMIENTO"].map(e => <option key={e} value={e}>{ETAPAS[e]}</option>)}
            </select>
            <button className="boton-secundario">Filtrar</button>
          </form>
          <BotonLeerBuzon />
        </div>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla w-full">
          <thead>
            <tr><th>Llegó</th><th>Espera</th><th>Etapa</th><th>Remitente</th><th>Asunto</th><th>Radicado</th><th>Adj.</th></tr>
          </thead>
          <tbody>
            {correos.length === 0 && <tr><td colSpan={7} className="text-center text-slate-500 py-8">No hay correos.</td></tr>}
            {correos.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap">{fechaHora(c.fechaCorreo)}</td>
                <td className="whitespace-nowrap text-xs text-slate-500">{tiempoRestante(c.fechaCorreo).replace("Vencido hace ", "")}</td>
                <td>{c.etapaDetectada ? ETAPAS[c.etapaDetectada] : <span className="text-amber-700">Sin etapa</span>}</td>
                <td className="max-w-[12rem] truncate" title={c.remitente ?? ""}>{c.nombreRemitente || c.remitente}</td>
                <td className="max-w-[22rem]">
                  <Link href={`/correos/${c.id}`} className="enlace line-clamp-2">{c.asunto || "(sin asunto)"}</Link>
                </td>
                <td className="whitespace-nowrap text-xs">
                  {c.radicados.length ? radicado(c.radicados[0]) : <span className="text-amber-700">No encontrado</span>}
                  {c.radicados.length > 1 && <span className="text-slate-500"> +{c.radicados.length - 1}</span>}
                  {c.caso && <p className="text-emerald-700">Caso existente</p>}
                  {c.deOtroOperador && <p className="text-red-700 font-medium">De otro operador</p>}
                </td>
                <td>{c.archivos.length || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
