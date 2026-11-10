import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import FormAsistencia, { type DiaAsistencia } from "./FormAsistencia"

// D27, ANS-11: asistencia diaria del equipo frente al mínimo por rol
export default async function AsistenciaPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  await requiereRol("COORDINADOR", "ASISTENTE")
  const { fecha } = await searchParams
  const dia = await obtener<DiaAsistencia>(`/seguimiento/asistencia${fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `?fecha=${fecha}` : ""}`)
  return (
    <div className="space-y-6">
      <h1 className="titulo-pagina">Asistencia del equipo</h1>
      <FormAsistencia key={dia.fecha} dia={dia} />
    </div>
  )
}
