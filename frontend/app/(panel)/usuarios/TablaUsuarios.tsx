"use client"

import { useMemo, useState, useTransition } from "react"
import { toast } from "react-toastify"
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react"
import { Check, Copy, KeyRound, LockOpen, MoreHorizontal, Save, Search, UserPlus } from "lucide-react"
import clsx from "clsx"
import { crearUsuario, desbloquearUsuario, guardarUsuario, restablecerContrasena } from "./acciones"
import { NOMBRES_ROLES, type CodigoRol } from "@/src/auth/permisos"
import Avatar from "@/components/ui/Avatar"
import Modal from "@/components/ui/Modal"

export type UsuarioFila = {
  id: number, nombre: string, correo: string, activo: boolean, capacidadDiaria: number | null, ultimoIngreso: string,
  roles: string[], debeCambiarContrasena: boolean, minutosBloqueo?: number, equipoId: number | null
}
type Equipo = { id: number, nombre: string }

// Columnas cortas para la matriz de perfiles (el nombre completo va en el título)
const PERFILES: { codigo: CodigoRol, corto: string }[] = [
  { codigo: "ADMIN", corto: "Admin." }, { codigo: "COORDINADOR", corto: "Coord." }, { codigo: "ASISTENTE", corto: "Asistente" },
  { codigo: "AUXILIAR", corto: "Auxiliar" }, { codigo: "REVISOR", corto: "Revisor" }, { codigo: "CONSULTA", corto: "Cliente" }
]

// La contraseña temporal se muestra una sola vez, para copiarla y entregarla
function Temporal({ correo, contrasena }: { correo: string, contrasena: string }) {
  const [copiada, setCopiada] = useState(false)
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Contraseña temporal de <b className="text-slate-700">{correo}</b>. Al entrar se le pedirá cambiarla; no se volverá a mostrar.</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-base font-semibold tracking-wider text-slate-800">{contrasena}</code>
        <button type="button" className="boton-secundario" onClick={() => { navigator.clipboard?.writeText(contrasena); setCopiada(true) }}>
          {copiada ? <Check size={15} /> : <Copy size={15} />}{copiada ? "Copiada" : "Copiar"}
        </button>
      </div>
    </div>
  )
}

function Fila({ u, esUsted, equipos, alTemporal }: { u: UsuarioFila, esUsted: boolean, equipos: Equipo[], alTemporal: (t: { correo: string, contrasena: string }) => void }) {
  const [pendiente, iniciar] = useTransition()
  const [roles, setRoles] = useState(u.roles)
  const [activo, setActivo] = useState(u.activo)
  const [capacidad, setCapacidad] = useState(u.capacidadDiaria ? String(u.capacidadDiaria) : "")
  const [equipo, setEquipo] = useState(u.equipoId ? String(u.equipoId) : "")
  const cambiado = [...roles].sort().join() !== [...u.roles].sort().join() || activo !== u.activo
    || capacidad !== (u.capacidadDiaria ? String(u.capacidadDiaria) : "") || equipo !== (u.equipoId ? String(u.equipoId) : "")

  const guardar = () => iniciar(async () => {
    const r = await guardarUsuario(u.id, { roles, activo, capacidadDiaria: capacidad ? Number(capacidad) : null, equipoId: equipo ? Number(equipo) : null })
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success(esUsted ? "Guardado. Vuelva a entrar para ver sus perfiles nuevos." : `${u.nombre}: cambios guardados`)
  })
  const restablecer = () => {
    if (!confirm(`¿Dar una contraseña temporal nueva a ${u.nombre}? Se cerrarán sus sesiones abiertas.`)) return
    iniciar(async () => {
      const r = await restablecerContrasena(u.id)
      if (!r.ok) return void toast.error(r.errores.join(". "))
      alTemporal({ correo: u.correo, contrasena: (r.datos as { contrasenaTemporal: string }).contrasenaTemporal })
    })
  }
  const desbloquear = () => iniciar(async () => {
    const r = await desbloquearUsuario(u.id)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    toast.success("Cuenta desbloqueada")
  })
  const alternar = (codigo: string) => setRoles(x => (x.includes(codigo) ? x.filter(y => y !== codigo) : [...x, codigo]))

  return (
    <tr className={clsx("border-t border-slate-100 transition", cambiado ? "bg-amber-50/40" : "hover:bg-slate-50/60")}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar nombre={u.nombre} apagado={!activo} />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-700">{u.nombre}{esUsted && <span className="font-normal text-slate-400"> · usted</span>}</p>
            <p className="truncate text-[11px] text-slate-400">{u.correo}</p>
            {(u.debeCambiarContrasena || !!u.minutosBloqueo || !activo) && (
              <div className="mt-1 flex flex-wrap gap-1">
                {!activo && <span className="chip border-slate-200 bg-slate-100 text-slate-500">Inactivo</span>}
                {u.debeCambiarContrasena && <span className="chip border-amber-200 bg-amber-50 text-amber-700">Contraseña temporal</span>}
                {!!u.minutosBloqueo && <span className="chip border-red-200 bg-red-50 text-red-700">Bloqueada {u.minutosBloqueo} min</span>}
              </div>
            )}
          </div>
        </div>
      </td>
      {PERFILES.map(p => (
        <td key={p.codigo} className="px-2 py-3 text-center">
          <input type="checkbox" aria-label={`${NOMBRES_ROLES[p.codigo]} para ${u.nombre}`} checked={roles.includes(p.codigo)} onChange={() => alternar(p.codigo)} />
        </td>
      ))}
      <td className="px-3 py-3">
        <select value={equipo} onChange={e => setEquipo(e.target.value)} className="campo h-8 w-40 px-2">
          <option value="">Sin equipo</option>
          {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </td>
      <td className="px-3 py-3">
        <input type="number" min={1} value={capacidad} onChange={e => setCapacidad(e.target.value)} placeholder="—" title="Casos nuevos por día (vacío: sin límite)" className="campo h-8 w-16 px-2 text-center" />
      </td>
      <td className="px-3 py-3 text-center">
        <button type="button" role="switch" aria-checked={activo} disabled={esUsted} onClick={() => setActivo(!activo)} title={esUsted ? "No puede desactivarse a sí mismo" : activo ? "Activo" : "Inactivo"}
          className={clsx("relative inline-flex h-5 w-9 items-center rounded-full transition disabled:opacity-40", activo ? "bg-slate-800" : "bg-slate-200")}>
          <span className={clsx("inline-block h-4 w-4 rounded-full bg-white shadow transition", activo ? "translate-x-[18px]" : "translate-x-0.5")} />
        </button>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-[11px] text-slate-400">{u.ultimoIngreso}</td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-0.5">
          <button type="button" onClick={guardar} disabled={!cambiado || pendiente} title="Guardar cambios" aria-label={`Guardar ${u.nombre}`}
            className={clsx("boton-icono", cambiado && "bg-slate-800 text-white hover:bg-slate-900 hover:text-white")}>
            <Save size={15} />
          </button>
          <Menu>
            <MenuButton className="boton-icono" aria-label={`Más opciones de ${u.nombre}`}><MoreHorizontal size={16} /></MenuButton>
            <MenuItems anchor="bottom end" className="z-40 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl focus:outline-none">
              <MenuItem>
                <button type="button" onClick={restablecer} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-slate-600 data-[focus]:bg-slate-50">
                  <KeyRound size={15} className="text-slate-400" />Restablecer contraseña
                </button>
              </MenuItem>
              {!!u.minutosBloqueo && (
                <MenuItem>
                  <button type="button" onClick={desbloquear} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-slate-600 data-[focus]:bg-slate-50">
                    <LockOpen size={15} className="text-slate-400" />Desbloquear cuenta
                  </button>
                </MenuItem>
              )}
            </MenuItems>
          </Menu>
        </div>
      </td>
    </tr>
  )
}

function NuevoUsuario({ alCrear }: { alCrear: (t: { correo: string, contrasena: string }) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const [roles, setRoles] = useState<string[]>([])
  const crear = (d: FormData) => iniciar(async () => {
    const correo = String(d.get("correo"))
    const r = await crearUsuario(String(d.get("nombre")), correo, roles)
    if (!r.ok) return void toast.error(r.errores.join(". "))
    setAbierto(false)
    setRoles([])
    alCrear({ correo, contrasena: (r.datos as { contrasenaTemporal: string }).contrasenaTemporal })
  })
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="boton-primario"><UserPlus size={15} />Nuevo usuario</button>
      <Modal abierto={abierto} alCerrar={() => !pendiente && setAbierto(false)} titulo="Nuevo usuario">
        <form action={crear} className="space-y-4">
          <div><label className="etiqueta">Nombre</label><input name="nombre" required autoFocus className="campo" /></div>
          <div><label className="etiqueta">Correo</label><input name="correo" type="email" required className="campo" /></div>
          <div>
            <label className="etiqueta">Perfiles</label>
            <div className="flex flex-wrap gap-1.5">
              {PERFILES.map(p => (
                <button key={p.codigo} type="button" className="opcion" aria-pressed={roles.includes(p.codigo)}
                  onClick={() => setRoles(x => (x.includes(p.codigo) ? x.filter(y => y !== p.codigo) : [...x, p.codigo]))}>
                  {NOMBRES_ROLES[p.codigo]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setAbierto(false)} className="boton-secundario">Cancelar</button>
            <button disabled={pendiente} className="boton-primario">Crear usuario</button>
          </div>
        </form>
      </Modal>
    </>
  )
}

export default function TablaUsuarios({ usuarios, equipos, usuarioId }: { usuarios: UsuarioFila[], equipos: Equipo[], usuarioId: number }) {
  const [busqueda, setBusqueda] = useState("")
  const [temporal, setTemporal] = useState<{ correo: string, contrasena: string } | null>(null)
  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    return t ? usuarios.filter(u => u.nombre.toLowerCase().includes(t) || u.correo.toLowerCase().includes(t)) : usuarios
  }, [usuarios, busqueda])
  const activos = usuarios.filter(u => u.activo).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Usuarios</h1>
          <p className="mt-1 text-xs text-slate-400">{activos} activos de {usuarios.length}</p>
        </div>
        <NuevoUsuario alCrear={setTemporal} />
      </div>

      <div className="tarjeta">
        <div className="border-b border-slate-200 p-4">
          <div className="relative max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre o correo" className="campo h-9 pl-9" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Usuario</th>
                {PERFILES.map(p => <th key={p.codigo} className="px-2 py-3 text-center" title={NOMBRES_ROLES[p.codigo]}>{p.corto}</th>)}
                <th className="px-3 py-3">Equipo</th>
                <th className="px-3 py-3 text-center" title="Casos nuevos por día">Cupo</th>
                <th className="px-3 py-3 text-center">Activo</th>
                <th className="px-3 py-3">Último ingreso</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(u => <Fila key={u.id} u={u} esUsted={u.id === usuarioId} equipos={equipos} alTemporal={setTemporal} />)}
            </tbody>
          </table>
          {filtrados.length === 0 && <p className="py-10 text-center text-xs text-slate-400">No hay usuarios que coincidan con la búsqueda.</p>}
        </div>
      </div>

      <Modal abierto={!!temporal} alCerrar={() => setTemporal(null)} titulo="Contraseña temporal">
        {temporal && <Temporal correo={temporal.correo} contrasena={temporal.contrasena} />}
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => setTemporal(null)} className="boton-primario">Listo</button></div>
      </Modal>
    </div>
  )
}
