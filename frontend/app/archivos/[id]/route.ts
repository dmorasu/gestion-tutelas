import { fetchApi } from "@/src/lib/api"

// Descarga de documentos a través del frontend: el token va en la cookie httpOnly y el navegador
// no puede mandarlo directo al backend. ?descargar=1 lo baja en vez de abrirlo
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const descargar = new URL(request.url).searchParams.get("descargar") === "1"
  const r = await fetchApi(`/archivos/${Number(id)}${descargar ? "?descargar=1" : ""}`)
  if (!r.ok || !r.body) return new Response("Archivo no disponible", { status: r.status || 404 })
  return new Response(r.body, {
    headers: {
      "Content-Type": r.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": r.headers.get("Content-Disposition") ?? "inline"
    }
  })
}
