import { fetchApi } from "@/src/lib/api"

// Subida de documentos al expediente. Va por aquí y no por una server action: los escritos y anexos
// pasan del límite de tamaño de las server actions, y el token está en la cookie httpOnly
export async function POST(request: Request) {
  const r = await fetchApi("/archivos", { method: "POST", body: await request.formData() })
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } })
}
