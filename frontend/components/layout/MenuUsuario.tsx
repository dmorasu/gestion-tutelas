"use client"

import Link from "next/link"
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react"
import { CircleUser, KeyRound, LogOut } from "lucide-react"
import { NOMBRES_ROLES, type CodigoRol } from "@/src/auth/permisos"

type Props = { nombre: string, correo: string, roles: string[] }

export default function MenuUsuario({ nombre, correo, roles }: Props) {
  return (
    <Popover className="relative">
      <PopoverButton className="flex items-center gap-2 h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200">
        <CircleUser size={18} className="text-slate-700" />
        <span className="hidden sm:inline max-w-[160px] truncate">{nombre}</span>
      </PopoverButton>

      <PopoverPanel anchor="bottom end" className="z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="px-4 py-4 border-b border-slate-200 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700 truncate">{nombre}</p>
          <p className="text-xs text-slate-400 truncate">{correo}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {roles.length > 0
              ? roles.map(rol => (
                <span key={rol} className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700">
                  {NOMBRES_ROLES[rol as CodigoRol] ?? rol}
                </span>
              ))
              : <span className="text-[10px] text-slate-400">Sin perfiles asignados</span>}
          </div>
        </div>

        <div className="p-2 pb-0">
          <Link href="/auth/cambiar-contrasena" className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-50">
            <KeyRound size={15} className="text-slate-600" />
            Cambiar contraseña
          </Link>
        </div>

        <form action="/auth/salir" method="post" className="p-2">
          <button type="submit" className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-red-600 hover:bg-red-50">
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </form>
      </PopoverPanel>
    </Popover>
  )
}
