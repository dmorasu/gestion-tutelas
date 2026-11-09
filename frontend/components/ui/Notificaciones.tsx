"use client"

import { Slide, ToastContainer, type CloseButtonProps, type TypeOptions } from "react-toastify"
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, type LucideIcon } from "lucide-react"
import "react-toastify/ReactToastify.css"

// Avisos con el estilo de Nodex (.aviso-nodex en globals.css)
const ASPECTO: Record<TypeOptions, { Icono: LucideIcon, circulo: string }> = {
  success: { Icono: CheckCircle2, circulo: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  error: { Icono: XCircle, circulo: "bg-red-50 text-red-600 ring-red-100" },
  warning: { Icono: AlertTriangle, circulo: "bg-amber-50 text-amber-600 ring-amber-100" },
  info: { Icono: Info, circulo: "bg-sky-50 text-sky-600 ring-sky-100" },
  default: { Icono: Info, circulo: "bg-slate-100 text-slate-500 ring-slate-200" }
}

function Icono({ type, isLoading }: { type: TypeOptions, isLoading?: boolean }) {
  if (isLoading) {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-4 ring-slate-50">
        <Loader2 size={16} className="animate-spin" />
      </span>
    )
  }
  const { Icono: Simbolo, circulo } = ASPECTO[type] ?? ASPECTO.default
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-full ring-4 ${circulo}`}>
      <Simbolo size={17} strokeWidth={2.25} />
    </span>
  )
}

function Cerrar({ closeToast }: CloseButtonProps) {
  return (
    <button type="button" onClick={closeToast} className="ml-auto shrink-0 self-start rounded-md p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-500" aria-label="Cerrar aviso">
      <X size={14} />
    </button>
  )
}

export default function Notificaciones() {
  return (
    <ToastContainer
      position="top-right"
      autoClose={2500}
      newestOnTop
      limit={4}
      transition={Slide}
      pauseOnFocusLoss={false}
      icon={({ type, isLoading }) => <Icono type={type} isLoading={isLoading} />}
      closeButton={Cerrar}
      toastClassName={contexto => `${contexto?.defaultClassName ?? ""} aviso-nodex aviso-nodex--${contexto?.type ?? "default"}`}
    />
  )
}
