import clsx from "clsx"
import { CRITICIDADES } from "@/src/lib/formato"

// Nivel de riesgo del caso (manual §13). Rojo para crítico; el ámbar de "alto" es advertencia
const ESTILOS: Record<string, string> = {
  CRITICO: "bg-red-700 text-white",
  ALTO: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
  ORDINARIO: "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
}

export default function Criticidad({ valor }: { valor?: string | null }) {
  if (!valor) return null
  return <span className={clsx("inline-block rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap", ESTILOS[valor] ?? ESTILOS.ORDINARIO)}>{CRITICIDADES[valor] ?? valor}</span>
}
