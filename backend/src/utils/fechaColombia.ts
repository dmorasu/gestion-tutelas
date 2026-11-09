// =====================================
// HORA DE COLOMBIA
// Colombia no tiene horario de verano: siempre UTC-5. Se trabaja con instantes (Date en UTC) y
// se convierte a "día y hora de Bogotá" solo para aplicar las reglas de horario.
// =====================================

const DESFASE_MS = 5 * 60 * 60 * 1000
export const DIA_MS = 24 * 60 * 60 * 1000

// Partes de la fecha en Bogotá
export const enBogota = (instante: Date) => {
  const local = new Date(instante.getTime() - DESFASE_MS)
  return {
    dia: local.toISOString().slice(0, 10), // YYYY-MM-DD
    minutos: local.getUTCHours() * 60 + local.getUTCMinutes()
  }
}

// "17:00" → 1020
export const minutosDeHora = (hora: string) => {
  const [h, m] = hora.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Instante de un día de Bogotá a una hora ("2026-11-17", "08:00")
export const instanteBogota = (dia: string, hora: string) => {
  const [h, m] = hora.split(':').map(Number)
  return new Date(Date.parse(`${dia}T00:00:00Z`) + ((h || 0) * 60 + (m || 0)) * 60_000 + DESFASE_MS)
}

export const sumarDias = (dia: string, dias: number) =>
  new Date(Date.parse(`${dia}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10)

export const textoFechaHora = (instante: Date | string | null | undefined) => {
  if (!instante) return ''
  const d = new Date(instante)
  if (isNaN(d.getTime())) return ''
  const { dia, minutos } = enBogota(d)
  const [a, m, dd] = dia.split('-')
  return `${dd}/${m}/${a} ${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
}
