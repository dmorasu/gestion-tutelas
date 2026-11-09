import { obtener } from "@/src/lib/api"
import { requiereRol } from "@/src/auth/dal"
import { fecha } from "@/src/lib/formato"
import EditorParametro, { type ParametroFila } from "./EditorParametro"
import DiasNoHabiles from "./DiasNoHabiles"

export default async function ParametrosPage() {
  await requiereRol("COORDINADOR")
  const [parametros, dias] = await Promise.all([
    obtener<ParametroFila[]>("/catalogos/parametros"),
    obtener<{ id: number, fecha: string, descripcion: string | null, etapas: string[] }[]>("/catalogos/dias-no-habiles")
  ])
  const pendientes = parametros.filter(p => !p.confirmado).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="titulo-pagina">Parámetros</h1>
        <p className="mt-1 text-xs text-slate-400">{pendientes} supuestos sin confirmar</p>
      </div>

      <div className="tarjeta divide-y divide-slate-100">
        {parametros.map(p => <EditorParametro key={p.clave} parametro={p} />)}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Días no hábiles (D3)</h2>
        </div>
        <DiasNoHabiles dias={dias.map(d => ({ ...d, texto: fecha(`${d.fecha}T12:00:00-05:00`) }))} />
      </section>
    </div>
  )
}
