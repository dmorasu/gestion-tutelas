import { fetchApi } from "@/src/lib/api"

// Lectura del Excel de asignaciones (archivo subido o adjunto de un correo)
export async function POST(request: Request) {
  const r = await fetchApi("/cargues/analizar", { method: "POST", body: await request.formData() })
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } })
}
