import Link from "next/link"
import { obtener } from "@/src/lib/api"
import { obtenerSesion } from "@/src/auth/dal"
import { tieneRol } from "@/src/auth/permisos"
import { CRITICIDADES, ESTADOS_ACTUACION, ETAPAS, fechaHora, radicado, tiempoRestante, yaEntregada } from "@/src/lib/formato"
import Semaforo from "@/components/ui/Semaforo"
import Criticidad from "@/components/ui/Criticidad"
import AccionesFila from "./AccionesFila"

type Fila = {
  id: number, etapa: string, estado: string, criticidad: string, fechaAsignacion: string, fechaVencimiento: string | null, fechaLimiteEntrega: string | null, semaforo: string,
  fechaVencimientoInformada: string | null, auxiliarId: number | null, revisorId: number | null,
  caso: { id: number, radicado: string, numeroInterno: string | null, deOtroOperador: boolean, partes: { nombre: string }[], juzgado: { nombre: string } | null },
  auxiliar: { nombre: string } | null, revisor: { nombre: string } | null, equipo: { nombre: string } | null
}
type Equipo = { id: number, nombre: string }
type Usuario = { id: number, nombre: string, activo: boolean, roles: { codigo: string }[] }

export default async function CasosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sesion = await obtenerSesion()
  const filtros = await searchParams
  const query = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][])
  const [{ actuaciones, total, pagina }, equipos, usuarios] = await Promise.all([
    obtener<{ actuaciones: Fila[], total: number, pagina: number }>(`/casos?${query}`),
    obtener<Equipo[]>("/catalogos/equipos"),
    obtener<Usuario[]>("/catalogos/usuarios")
  ])
  const coordina = tieneRol(sesion.roles, ["COORDINADOR"])
  const delRol = (codigo: string) => usuarios.filter(u => u.activo && u.roles.some(r => r.codigo === codigo)).map(u => ({ id: u.id, nombre: u.nombre }))
  const auxiliares = delRol("AUXILIAR")
  const revisores = delRol("REVISOR")
  // Mismas reglas del backend: asistencia y coordinación todo; el auxiliar o el revisor, lo suyo
  const puedeEditar = (a: Fila) => tieneRol(sesion.roles, ["ASISTENTE", "COORDINADOR"]) || a.auxiliarId === sesion.id || a.revisorId === sesion.id
  const veTodo = tieneRol(sesion.roles, ["ASISTENTE", "COORDINADOR"])
  const esRevisor = tieneRol(sesion.roles, ["REVISOR"])
  const paginas = Math.ceil(total / 50)
  const enlacePagina = (p: number) => `/casos?${new URLSearchParams({ ...Object.fromEntries(query), pagina: String(p) })}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Casos</h1>
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
            <tr>
              <th>Semáforo</th><th>Caso</th><th>Etapa</th><th>Criticidad</th><th>Límite ANS</th><th>Responsables</th>
              <th className="sticky right-0 w-px bg-slate-50"></th>
            </tr>
          </thead>
          <tbody>
            {actuaciones.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No hay actuaciones con esos filtros.</td></tr>}
            {actuaciones.map(a => (
              <tr key={a.id} className="group hover:bg-slate-50">
                <td><Semaforo valor={a.semaforo} /></td>
                <td className="min-w-[15rem]">
                  <Link href={`/casos/${a.caso.id}?actuacion=${a.id}`} className="font-semibold text-slate-800 hover:underline">{a.caso.numeroInterno ?? "—"}</Link>
                  <p className="font-mono text-[11px] text-slate-400">{radicado(a.caso.radicado)}</p>
                  <p className="mt-0.5 max-w-[16rem] truncate text-slate-500">{a.caso.partes.map(p => p.nombre).join(", ") || "—"}</p>
                  {a.caso.deOtroOperador && <span className="chip mt-1 border-red-200 bg-red-50 text-red-700">Otro operador</span>}
                </td>
                <td className="whitespace-nowrap">
                  <p className="font-medium text-slate-700">{ETAPAS[a.etapa]}</p>
                  <p className="text-[11px] text-slate-400">{ESTADOS_ACTUACION[a.estado]}</p>
                </td>
                <td><Criticidad valor={a.criticidad} /></td>
                <td className="whitespace-nowrap">
                  <p className="text-slate-700">{fechaHora(a.fechaLimiteEntrega)}</p>
                  <p className="text-[11px] text-slate-400">{a.fechaLimiteEntrega && !yaEntregada(a.estado) ? tiempoRestante(a.fechaLimiteEntrega) : `Asignada ${fechaHora(a.fechaAsignacion)}`}</p>
                </td>
                <td className="whitespace-nowrap">
                  <p>{a.auxiliar?.nombre ?? <span className="text-amber-700">Sin auxiliar</span>}</p>
                  <p className="text-[11px] text-slate-400">{a.revisor?.nombre ?? "Sin revisor"}{a.equipo && ` · ${a.equipo.nombre}`}</p>
                </td>
                <td className="sticky right-0 bg-white py-2 group-hover:bg-slate-50">
                  <AccionesFila a={a} puedeEditar={puedeEditar(a)} coordina={coordina} auxiliares={auxiliares} revisores={revisores} />
                </td>
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
