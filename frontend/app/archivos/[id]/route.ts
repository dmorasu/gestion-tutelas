import { fetchApi } from "@/src/lib/api"

// Descarga de adjuntos a través del frontend: el token va en la cookie httpOnly y el navegador
// no puede mandarlo directo al backend
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await fetchApi(`/archivos/${Number(id)}`)
  if (!r.ok || !r.body) return new Response("Archivo no disponible", { status: r.status || 404 })
  return new Response(r.body, {
    headers: {
      "Content-Type": r.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": r.headers.get("Content-Disposition") ?? "inline"
    }
  })
}
