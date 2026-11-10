import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { obtenerSesion } from "@/src/auth/dal"
import { tieneRol } from "@/src/auth/permisos"
import { CRITICIDADES, ESTADOS_ACTUACION, ETAPAS, fechaHora, radicado, tiempoRestante, yaEntregada } from "@/src/lib/formato"
import Semaforo from "@/components/ui/Semaforo"
import Criticidad from "@/components/ui/Criticidad"

type Fila = {
  id: number, etapa: string, estado: string, criticidad: string, fechaAsignacion: string, fechaVencimiento: string | null, fechaLimiteEntrega: string | null, semaforo: string,
  caso: { id: number, radicado: string, numeroInterno: string | null, deOtroOperador: boolean, partes: { nombre: string }[], juzgado: { nombre: string } | null },
  auxiliar: { nombre: string } | null, revisor: { nombre: string } | null, equipo: { nombre: string } | null
}
type Equipo = { id: number, nombre: string }

export default async function CasosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sesion = await obtenerSesion()
  const filtros = await searchParams
  const query = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][])
  const [{ actuaciones, total, pagina }, equipos] = await Promise.all([
    obtener<{ actuaciones: Fila[], total: number, pagina: number }>(`/casos?${query}`),
    obtener<Equipo[]>("/catalogos/equipos")
  ])
  const veTodo = tieneRol(sesion.roles, ["ASISTENTE", "COORDINADOR"])
  const esRevisor = tieneRol(sesion.roles, ["REVISOR"])
  const paginas = Math.ceil(total / 50)
  const enlacePagina = (p: number) => `/casos?${new URLSearchParams({ ...Object.fromEntries(query), pagina: String(p) })}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Tablero</h1>
          <p className="mt-1 text-xs text-slate-400">{total} actuaciones{veTodo || filtros.todos ? "" : esRevisor ? " de su equipo" : " asignadas a usted"}</p>
        </div>
        {veTodo && <Link href="/casos/nuevo" className="boton-primario">Nueva asignación</Link>}
      </div>

      <form className="tarjeta p-3 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[14rem]">
          <label className="etiqueta">Buscar</label>
          <input name="q" defaultValue={filtros.q} placeholder="Radicado, número interno, accionante o documento" className="campo" />
        </div>
        <div>
          <label className="etiqueta">Etapa</label>
          <select name="etapa" defaultValue={filtros.etapa ?? ""} className="campo">
            <option value="">Todas</option>
            {Object.entries(ETAPAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta">Criticidad</label>
          <select name="criticidad" defaultValue={filtros.criticidad ?? ""} className="campo">
            <option value="">Todas</option>
            {Object.entries(CRITICIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta">Equipo</label>
          <select name="equipoId" defaultValue={filtros.equipoId ?? ""} className="campo">
            <option value="">Todos</option>
            {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="etiqueta">Semáforo</label>
          <select name="semaforo" defaultValue={filtros.semaforo ?? ""} className="campo">
            <option value="">Todos</option>
            <option value="VENCIDO">Vencido</option>
            <option value="ROJO">Urgente</option>
            <option value="AMARILLO">Próximo</option>
            <option value="VERDE">A tiempo</option>
            <option value="SIN_FECHA">Sin fecha</option>
            <option value="ENTREGADO">Entregado</option>
          </select>
        </div>
        <div>
          <label className="etiqueta">Estado</label>
          <select name="estado" defaultValue={filtros.estado ?? ""} className="campo">
            <option value="">Abiertas</option>
            {Object.entries(ESTADOS_ACTUACION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {!veTodo && (
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" name="todos" value="1" defaultChecked={!!filtros.todos} /> Ver todas</label>
        )}
        <button className="boton-secundario">Filtrar</button>
      </form>

      <div className="tarjeta overflow-x-auto">
        <table className="tabla w-full">
          <thead>
            <tr><th>Semáforo</th><th>Límite ANS</th><th>Caso</th><th>Criticidad</th><th>Etapa</th><th>Estado</th><th>Accionante</th><th>Auxiliar</th><th>Revisor</th><th>Asignado</th></tr>
          </thead>
          <tbody>
            {actuaciones.length === 0 && <tr><td colSpan={10} className="text-center text-slate-500 py-8">No hay actuaciones con esos filtros.</td></tr>}
            {actuaciones.map(a => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td><Semaforo valor={a.semaforo} /></td>
                <td className="whitespace-nowrap">
                  {fechaHora(a.fechaLimiteEntrega)}
                  <p className="text-xs text-slate-500">{a.fechaLimiteEntrega && !yaEntregada(a.estado) ? tiempoRestante(a.fechaLimiteEntrega) : ""}</p>
                </td>
                <td className="whitespace-nowrap text-xs">
                  <Link href={`/casos/${a.caso.id}`} className="enlace font-medium">{a.caso.numeroInterno ?? "—"}</Link>
                  <p className="font-mono text-slate-500">{radicado(a.caso.radicado)}</p>
                  {a.caso.deOtroOperador && <p className="text-red-700">Otro operador</p>}
                </td>
                <td><Criticidad valor={a.criticidad} /></td>
                <td>{ETAPAS[a.etapa]}</td>
                <td className="whitespace-nowrap">{ESTADOS_ACTUACION[a.estado]}</td>
                <td className="max-w-[14rem] truncate">{a.caso.partes.map(p => p.nombre).join(", ") || "—"}</td>
                <td>{a.auxiliar?.nombre ?? <span className="text-amber-700">Sin asignar</span>}</td>
                <td>
                  {a.revisor?.nombre ?? <span className="text-amber-700">Sin asignar</span>}
                  {a.equipo && <p className="text-xs text-slate-500">{a.equipo.nombre}</p>}
                </td>
                <td className="whitespace-nowrap text-xs">{fechaHora(a.fechaAsignacion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <div className="flex gap-2 justify-end text-sm">
          {pagina > 1 && <Link href={enlacePagina(pagina - 1)} className="boton-secundario">Anterior</Link>}
          <span className="py-2">Página {pagina} de {paginas}</span>
          {pagina < paginas && <Link href={enlacePagina(pagina + 1)} className="boton-secundario">Siguiente</Link>}
        </div>
      )}
    </div>
  )
}
