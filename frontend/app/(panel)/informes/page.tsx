import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { tieneRol } from "@/src/auth/permisos"
import { fechaHora } from "@/src/lib/formato"
import Documento from "@/components/ui/Documento"
import GenerarInforme from "./GenerarInforme"

type InformeFila = {
  id: number, tipo: string, desde: string, hasta: string, fechaLimite: string | null, createdAt: string,
  usuario: { nombre: string } | null, archivo: { id: number, nombre: string, proveedor: string | null, webUrl: string | null } | null
  resumen: { asignadas: number, entregasV1: number, abiertasAlCierre: number, ans: { codigo: string, cumple: boolean | null }[] } | null
}

export default async function InformesPage() {
  const sesion = await requiereRol("COORDINADOR", "REVISOR", "ASISTENTE")
  const { informes, sugerido } = await obtener<{ informes: InformeFila[], sugerido: Record<string, string> }>("/seguimiento/informes")

  return (
    <div className="space-y-4">
      <div>
        <h1 className="titulo-pagina">Informes</h1>
        <p className="mt-1 text-xs text-slate-400">Semanal el segundo día hábil · mensual en los cinco primeros días hábiles</p>
      </div>
      {tieneRol(sesion.roles, ["COORDINADOR"]) && <GenerarInforme sugerido={sugerido} />}
      <div className="tarjeta overflow-x-auto">
        <table className="tabla w-full">
          <thead><tr><th>Informe</th><th>Periodo</th><th className="text-right">Asignadas</th><th className="text-right">Entregas V1</th><th className="text-right">Abiertos</th><th>ANS que no cumplen</th><th>Generado</th><th>Archivo</th></tr></thead>
          <tbody>
            {informes.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-slate-500">Aún no hay informes.</td></tr>}
            {informes.map(i => {
              const tarde = i.fechaLimite && new Date(i.createdAt) > new Date(i.fechaLimite)
              const fallan = i.resumen?.ans.filter(a => a.cumple === false).map(a => a.codigo) ?? []
              return (
                <tr key={i.id}>
                  <td>{i.tipo === "SEMANAL" ? "Semanal" : "Mensual"}</td>
                  <td className="whitespace-nowrap text-xs">{i.desde} a {i.hasta}</td>
                  <td className="text-right">{i.resumen?.asignadas ?? "—"}</td>
                  <td className="text-right">{i.resumen?.entregasV1 ?? "—"}</td>
                  <td className="text-right">{i.resumen?.abiertasAlCierre ?? "—"}</td>
                  <td className={fallan.length ? "text-red-700 text-xs" : "text-xs text-slate-500"}>{fallan.length ? fallan.join(", ") : "Ninguno"}</td>
                  <td className="whitespace-nowrap text-xs">
                    {fechaHora(i.createdAt)}{i.usuario && ` · ${i.usuario.nombre}`}
                    {tarde && <span className="block text-red-700">Después del plazo ({fechaHora(i.fechaLimite)})</span>}
                  </td>
                  <td>{i.archivo && <Documento d={i.archivo} />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
