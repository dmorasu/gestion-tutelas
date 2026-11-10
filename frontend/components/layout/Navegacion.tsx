"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import clsx from "clsx"
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react"
import { Home, Inbox, LayoutList, SlidersHorizontal, Users, UsersRound, Mail, Settings2, ChevronDown, Gauge, Target, Bell, FileSpreadsheet, ListChecks, ChartColumn, type LucideIcon } from "lucide-react"

type Enlace = { href: string, nombre: string }

// Los íconos van aquí porque un componente no se puede pasar del servidor al cliente como prop
export const ICONOS: Record<string, LucideIcon> = {
  "/inicio": Home,
  "/correos": Inbox,
  "/casos": LayoutList,
  "/seguimiento": Gauge,
  "/tablero": ChartColumn,
  "/indicadores": Target,
  "/alertas": Bell,
  "/informes": FileSpreadsheet,
  "/archivo-maestro": ListChecks,
  "/equipos": UsersRound,
  "/plantillas": Mail,
  "/parametros": SlidersHorizontal,
  "/usuarios": Users
}

// Agrupados en menús desplegables (igual que Nodex). Un grupo con un solo módulo permitido va como enlace
const GRUPOS: { nombre: string, Icono: LucideIcon, modulos: string[] }[] = [
  { nombre: "Seguimiento", Icono: Gauge, modulos: ["/tablero", "/seguimiento", "/indicadores", "/alertas", "/informes"] },
  { nombre: "Configuración", Icono: Settings2, modulos: ["/equipos", "/plantillas", "/archivo-maestro", "/parametros", "/usuarios"] }
]

const claseEnlace = (activo: boolean) => clsx(
  "flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-medium whitespace-nowrap transition",
  activo ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
)

export default function Navegacion({ modulos, conInicio = true }: { modulos: Enlace[], conInicio?: boolean }) {
  const pathname = usePathname()
  const estaEn = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  const enlace = ({ href, nombre }: Enlace) => {
    const Icono = ICONOS[href]
    return (
      <Link key={href} href={href} aria-current={estaEn(href) ? "page" : undefined} className={claseEnlace(estaEn(href))}>
        {Icono && <Icono size={15} />}
        {nombre}
      </Link>
    )
  }

  const elementos: React.ReactNode[] = conInicio ? [enlace({ href: "/inicio", nombre: "Inicio" })] : []
  const usados = new Set<string>()

  for (const modulo of modulos) {
    if (usados.has(modulo.href)) continue
    const grupo = GRUPOS.find(g => g.modulos.includes(modulo.href))
    const delGrupo = grupo ? modulos.filter(m => grupo.modulos.includes(m.href)) : [modulo]
    delGrupo.forEach(m => usados.add(m.href))

    if (!grupo || delGrupo.length === 1) {
      elementos.push(enlace(delGrupo[0]))
      continue
    }

    const activo = delGrupo.some(m => estaEn(m.href))
    elementos.push(
      <Menu key={grupo.nombre}>
        <MenuButton className={clsx(claseEnlace(activo), "data-[open]:bg-slate-100 data-[open]:text-slate-700")}>
          <grupo.Icono size={15} />
          {grupo.nombre}
          <ChevronDown size={13} className="opacity-60" />
        </MenuButton>
        <MenuItems anchor="bottom start" className="z-40 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl focus:outline-none">
          {delGrupo.map(m => {
            const Icono = ICONOS[m.href]
            return (
              <MenuItem key={m.href}>
                <Link href={m.href} className={clsx("flex items-center gap-3 rounded-lg px-3 py-2.5 data-[focus]:bg-slate-50", estaEn(m.href) && "bg-slate-100/70")}>
                  {Icono && <Icono size={16} className={clsx("shrink-0", estaEn(m.href) ? "text-slate-700" : "text-slate-400")} />}
                  <span className={clsx("text-xs font-semibold", estaEn(m.href) ? "text-slate-900" : "text-slate-700")}>{m.nombre}</span>
                </Link>
              </MenuItem>
            )
          })}
        </MenuItems>
      </Menu>
    )
  }

  return <nav className="flex flex-wrap gap-1">{elementos}</nav>
}
