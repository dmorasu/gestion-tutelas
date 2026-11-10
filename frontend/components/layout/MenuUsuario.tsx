"use client"

import Link from "next/link"
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react"
import { ChevronDown, KeyRound, LogOut } from "lucide-react"
import Avatar from "@/components/ui/Avatar"
import { NOMBRES_ROLES, type CodigoRol } from "@/src/auth/permisos"

type Props = { nombre: string, correo: string, roles: string[] }

export default function MenuUsuario({ nombre, correo, roles }: Props) {
  const principal = roles.length ? NOMBRES_ROLES[roles[0] as CodigoRol] ?? roles[0] : "Sin perfil"
  return (
    <Popover className="relative">
      <PopoverButton className="group flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 data-[open]:bg-slate-100">
        <Avatar nombre={nombre} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[160px] truncate text-xs font-semibold text-slate-700">{nombre}</span>
          <span className="block max-w-[160px] truncate text-[10px] text-slate-400">{principal}</span>
        </span>
        <ChevronDown size={14} className="hidden text-slate-400 transition group-data-[open]:rotate-180 sm:block" />
      </PopoverButton>

      <PopoverPanel anchor="bottom end" transition className="z-50 mt-2 w-72 origin-top-right rounded-xl border border-slate-200 bg-white shadow-xl transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0">
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar nombre={nombre} tamano="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">{nombre}</p>
            <p className="truncate text-xs text-slate-400">{correo}</p>
          </div>
        </div>
        {roles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pb-4">
            {roles.map(rol => <span key={rol} className="chip border-slate-200 bg-slate-50 text-slate-600">{NOMBRES_ROLES[rol as CodigoRol] ?? rol}</span>)}
          </div>
        )}
        <div className="border-t border-slate-100 p-1.5">
          <Link href="/auth/cambiar-contrasena" className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <KeyRound size={15} className="text-slate-400" />
            Cambiar contraseña
          </Link>
          <form action="/auth/salir" method="post">
            <button type="submit" className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
              <LogOut size={15} />
              Cerrar sesión
            </button>
          </form>
        </div>
      </PopoverPanel>
    </Popover>
  )
}
