import clsx from "clsx"

// Iniciales del nombre en un círculo grafito (los usuarios no tienen foto)
export const iniciales = (nombre: string) =>
  nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join("") || "?"

export default function Avatar({ nombre, tamano = "md", apagado }: { nombre: string, tamano?: "sm" | "md" | "lg", apagado?: boolean }) {
  return (
    <span className={clsx(
      "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide",
      tamano === "sm" && "h-7 w-7 text-[10px]", tamano === "md" && "h-8 w-8 text-[11px]", tamano === "lg" && "h-10 w-10 text-xs",
      apagado ? "bg-slate-100 text-slate-400" : "bg-slate-800 text-white"
    )}>
      {iniciales(nombre)}
    </span>
  )
}
