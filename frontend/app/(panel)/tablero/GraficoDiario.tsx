"use client"

import { useEffect, useRef, useState } from "react"

export type DiaTablero = { dia: string, asignadas: number, entregadas: number, a_tiempo: number }

// Dos series del mismo tipo (conteos por día) en un solo eje. Colores validados para daltonismo
// (paleta categorical, posiciones 1 y 2); la identidad también va en la leyenda y en la etiqueta
// del final de cada línea, nunca solo en el color
const SERIES = [
  { clave: "asignadas", nombre: "Asignadas", color: "#2a78d6" },
  { clave: "entregadas", nombre: "Primeras entregas", color: "#eb6834" }
] as const

// El SVG se dibuja al ancho real del contenedor: así el texto queda siempre a su tamaño
const ALTO = 240
const M = { arriba: 12, derecha: 118, abajo: 26, izquierda: 34 }

const corto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

// Escala "bonita" para el eje: 4 divisiones con pasos redondos
const escala = (max: number) => {
  // Conteos: el paso mínimo es 1 (nunca medio caso)
  const crudo = Math.max(1, max) / 4
  const potencia = 10 ** Math.floor(Math.log10(crudo))
  const paso = Math.max(1, [1, 2, 5, 10].map(f => f * potencia).find(p => p >= crudo) ?? crudo)
  return { paso, tope: paso * 4 }
}

export default function GraficoDiario({ dias }: { dias: DiaTablero[] }) {
  const [activo, setActivo] = useState<number | null>(null)
  const [tabla, setTabla] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const [ANCHO, setAncho] = useState(720)
  useEffect(() => {
    if (!caja.current) return
    const observador = new ResizeObserver(([e]) => setAncho(Math.max(320, Math.round(e.contentRect.width))))
    observador.observe(caja.current)
    return () => observador.disconnect()
  }, [tabla])
  if (!dias.length) return null

  const { paso, tope } = escala(Math.max(...dias.flatMap(d => [d.asignadas, d.entregadas])))
  const anchoPlot = ANCHO - M.izquierda - M.derecha
  const altoPlot = ALTO - M.arriba - M.abajo
  const x = (i: number) => M.izquierda + (dias.length === 1 ? anchoPlot / 2 : (i / (dias.length - 1)) * anchoPlot)
  const y = (v: number) => M.arriba + altoPlot - (v / tope) * altoPlot
  const linea = (clave: "asignadas" | "entregadas") => dias.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[clave]).toFixed(1)}`).join(" ")
  const ultimo = dias[dias.length - 1]
  // Etiquetas del final: si quedan muy cerca se separan para que no se monten
  const finales = SERIES.map(s => ({ ...s, y: y(ultimo[s.clave]) }))
  if (Math.abs(finales[0].y - finales[1].y) < 14) {
    const medio = (finales[0].y + finales[1].y) / 2
    const arriba = ultimo.asignadas >= ultimo.entregadas ? 0 : 1
    finales[arriba].y = medio - 7
    finales[1 - arriba].y = medio + 7
  }
  const d = activo === null ? null : dias[activo]

  // El área sensible es toda la columna del día, no solo el punto
  const alMover = (e: React.MouseEvent<SVGRectElement>) => {
    const caja = e.currentTarget.getBoundingClientRect()
    const relativo = ((e.clientX - caja.left) / caja.width) * anchoPlot
    setActivo(Math.max(0, Math.min(dias.length - 1, Math.round((relativo / anchoPlot) * (dias.length - 1)))))
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-4 text-xs text-slate-600">
          {SERIES.map(s => (
            <li key={s.clave} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />{s.nombre}
            </li>
          ))}
        </ul>
        <button type="button" className="text-xs enlace" onClick={() => setTabla(!tabla)}>{tabla ? "Ver gráfica" : "Ver tabla"}</button>
      </div>

      {tabla ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="tabla w-full">
            <thead><tr><th>Día</th><th className="text-right">Asignadas</th><th className="text-right">Primeras entregas</th><th className="text-right">A tiempo</th></tr></thead>
            <tbody>
              {[...dias].reverse().map(f => (
                <tr key={f.dia}><td>{corto(f.dia)}</td><td className="text-right">{f.asignadas}</td><td className="text-right">{f.entregadas}</td><td className="text-right">{f.a_tiempo}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={caja} className="relative">
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} width={ANCHO} height={ALTO} className="block max-w-full" role="img" aria-label="Asignadas y primeras entregas por día, últimos 30 días">
            {/* Rejilla y eje recesivos */}
            {[0, 1, 2, 3, 4].map(k => (
              <g key={k}>
                <line x1={M.izquierda} x2={M.izquierda + anchoPlot} y1={y(k * paso)} y2={y(k * paso)} stroke={k ? "#eef0f3" : "#cbd5e1"} strokeWidth={1} />
                <text x={M.izquierda - 6} y={y(k * paso) + 3.5} textAnchor="end" className="fill-slate-400" fontSize={10}>{k * paso}</text>
              </g>
            ))}
            {dias.map((f, i) => (i % (ANCHO < 600 ? 10 : 5) === 0 || i === dias.length - 1) && (
              <text key={f.dia} x={x(i)} y={ALTO - 8} textAnchor="middle" className="fill-slate-400" fontSize={10}>{corto(f.dia)}</text>
            ))}

            {d && activo !== null && <line x1={x(activo)} x2={x(activo)} y1={M.arriba} y2={M.arriba + altoPlot} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />}

            {SERIES.map(s => <path key={s.clave} d={linea(s.clave)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}

            {/* Punto activo con anillo del color de la superficie */}
            {d && activo !== null && SERIES.map(s => (
              <circle key={s.clave} cx={x(activo)} cy={y(d[s.clave])} r={4.5} fill={s.color} stroke="#ffffff" strokeWidth={2} />
            ))}

            {/* Etiqueta directa al final de cada línea (texto en tinta, no en el color de la serie) */}
            {finales.map(s => (
              <g key={s.clave}>
                <circle cx={x(dias.length - 1)} cy={y(ultimo[s.clave])} r={3} fill={s.color} />
                <text x={x(dias.length - 1) + 8} y={s.y + 3.5} fontSize={11} className="fill-slate-600">{s.nombre} · {ultimo[s.clave]}</text>
              </g>
            ))}

            <rect x={M.izquierda} y={M.arriba} width={anchoPlot} height={altoPlot} fill="transparent" onMouseMove={alMover} onMouseLeave={() => setActivo(null)} />
          </svg>

          {d && activo !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
              style={{ left: `${(x(activo) / ANCHO) * 100}%`, transform: activo > dias.length / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
            >
              <p className="font-semibold text-slate-800">{corto(d.dia)}</p>
              {SERIES.map(s => (
                <p key={s.clave} className="flex items-center gap-1.5 text-slate-600">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.nombre}: <b className="text-slate-900">{d[s.clave]}</b>
                </p>
              ))}
              {d.entregadas > 0 && <p className="text-slate-500">{d.a_tiempo} de {d.entregadas} a tiempo</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
