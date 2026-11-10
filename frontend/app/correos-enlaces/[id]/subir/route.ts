import { fetchApi } from "@/src/lib/api"

// Subida a mano de lo que trae un enlace (cuando la app no puede descargarlo): route handler y no
// server action, por el tamaño de los archivos
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await fetchApi(`/correos/enlaces/${Number(id)}/subir`, { method: "POST", body: await request.formData() })
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } })
}
