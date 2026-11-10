import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { BUZONES } from "@/src/lib/formato"
import EditorPlantilla, { type Plantilla } from "./EditorPlantilla"

export default async function PlantillasPage() {
  await requiereRol("COORDINADOR")
  const [{ plantillas, marcadores }, { envio }] = await Promise.all([
    obtener<{ plantillas: Plantilla[], marcadores: string[] }>("/catalogos/plantillas"),
    obtener<{ envio: string }>("/correos/estado-buzon")
  ])
  const porBuzon = Object.keys(BUZONES).map(b => ({ buzon: b, plantillas: plantillas.filter(p => p.buzon === b) }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="titulo-pagina">Plantillas de correo</h1>
        <p className="mt-1 text-xs text-slate-400">
          {plantillas.filter(p => p.confirmada).length} de {plantillas.length} definitivas
        </p>
      </div>

      <div className="tarjeta p-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-slate-500 mr-1">Marcadores:</span>
        {marcadores.map(m => <code key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">{`{{${m}}}`}</code>)}
      </div>

      {porBuzon.map(({ buzon, plantillas }) => (
        <section key={buzon} className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Buzón de {BUZONES[buzon].toLowerCase()}</h2>
          {plantillas.map(p => <EditorPlantilla key={p.codigo} plantilla={p} envioReal={envio === "REAL"} />)}
        </section>
      ))}
    </div>
  )
}
