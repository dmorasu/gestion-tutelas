import clsx from "clsx"

const ESTILOS: Record<string, { clase: string, texto: string }> = {
  VENCIDO: { clase: "bg-red-700 text-white", texto: "Vencido" },
  // "Urgente" y no "Crítico": crítico es el nivel de riesgo del caso (otra cosa)
  ROJO: { clase: "bg-red-100 text-red-800 ring-1 ring-red-300", texto: "Urgente" },
  AMARILLO: { clase: "bg-amber-100 text-amber-800 ring-1 ring-amber-300", texto: "Próximo" },
  VERDE: { clase: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200", texto: "A tiempo" },
  SIN_FECHA: { clase: "bg-slate-100 text-slate-600 ring-1 ring-slate-200", texto: "Sin fecha" }
}

export default function Semaforo({ valor }: { valor?: string | null }) {
  const e = ESTILOS[valor ?? "SIN_FECHA"] ?? ESTILOS.SIN_FECHA
  return <span className={clsx("inline-block rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap", e.clase)}>{e.texto}</span>
}
