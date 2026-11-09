import Image from "next/image"

// Igual que el login de Nodex: panel de color con el logo a la izquierda y el formulario a la derecha
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2 bg-slate-50">
      <div className="relative hidden lg:flex min-h-screen overflow-hidden bg-gradient-to-br from-slate-600 via-slate-800 to-slate-950">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-[450px] h-[450px] rounded-full bg-slate-300/10 blur-3xl" />
        <div className="relative z-10 w-full flex flex-col items-center justify-center px-12">
          <div className="mb-10 p-8 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 shadow-2xl">
            <Image src="/nodex.png" alt="Nodex" width={400} height={100} className="h-auto w-[400px]" priority />
          </div>
          <h2 className="text-xl font-semibold text-white">Gestión de Tutelas</h2>
        </div>
      </div>

      <div className="min-h-screen flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-10 lg:hidden">
            <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
              <Image src="/logo-nodex-tutelas.png" alt="Nodex Tutelas" width={240} height={88} priority />
            </div>
          </div>
          {children}
          <p className="mt-10 text-center text-[10px] text-slate-400">Nodex Tutelas · GPA Legal</p>
        </div>
      </div>
    </div>
  )
}
