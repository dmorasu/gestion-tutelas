import Link from "next/link"
import { requiereRol } from "@/src/auth/dal"
import { modulosPermitidos } from "@/src/auth/permisos"
import LogoEncabezado from "@/components/ui/LogoEncabezado"
import Navegacion from "@/components/layout/Navegacion"
import MenuUsuario from "@/components/layout/MenuUsuario"
import MenuMovil from "@/components/layout/MenuMovil"

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const sesion = await requiereRol()
  const modulos = modulosPermitidos(sesion.roles).map(({ href, nombre }) => ({ href, nombre }))

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto h-16 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
          <Link href="/inicio" className="flex items-center shrink-0 hover:opacity-80 transition-opacity">
            <LogoEncabezado />
          </Link>

          <div className="hidden md:flex flex-1 items-center justify-center gap-3 px-8">
            <div className="h-8 w-px bg-slate-200" />
            <p className="text-sm font-semibold text-slate-700">Gestión de Tutelas</p>
          </div>

          <div className="flex items-center gap-2">
            <MenuUsuario nombre={sesion.nombre} correo={sesion.correo} roles={sesion.roles} />
            <MenuMovil modulos={modulos} />
          </div>
        </div>

        {/* En el celular el menú va en el botón ☰ (MenuMovil) */}
        <div className="hidden md:block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-2">
          <Navegacion modulos={modulos} />
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10">{children}</main>

      <footer className="border-t border-slate-200 bg-white py-5">
        <p className="text-center text-xs text-slate-400">Nodex Tutelas · GPA Legal · {new Date().getFullYear()}</p>
      </footer>
    </div>
  )
}
