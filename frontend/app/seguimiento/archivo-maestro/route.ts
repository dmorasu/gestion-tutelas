import { fetchApi } from "@/src/lib/api"

// Carga del archivo maestro (Excel): por route handler, no por server action, por el tamaño
export async function POST(request: Request) {
  const r = await fetchApi("/seguimiento/archivo-maestro", { method: "POST", body: await request.formData() })
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } })
}
