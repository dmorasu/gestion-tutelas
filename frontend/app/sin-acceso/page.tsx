import Image from "next/image"
import { ShieldAlert } from "lucide-react"

export default function SinAcceso() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="tarjeta w-full max-w-md p-8 text-center">
        <Image src="/logo-nodex-tutelas.png" alt="Nodex Tutelas" width={180} height={66} className="mx-auto mb-6 h-auto w-[160px]" />
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-slate-800 text-white shadow-lg shadow-slate-500/30">
          <ShieldAlert size={22} />
        </span>
        <h1 className="mt-4 text-base font-semibold text-slate-800">Aún no tiene un perfil asignado</h1>
        <p className="mt-2 text-xs text-slate-500">Pida al administrador que le asigne un perfil y vuelva a entrar.</p>
        <form action="/auth/salir" method="post" className="mt-6">
          <button className="boton-secundario">Cerrar sesión</button>
        </form>
      </div>
    </main>
  )
}
