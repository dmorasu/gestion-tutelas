export const NOMBRE_COOKIE = "TOKEN"
// Estado del login con Microsoft (se compara al volver de la página de Microsoft)
export const COOKIE_ESTADO_LOGIN = "ESTADO_LOGIN"

export const opcionesCookieSesion = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 10 * 60 * 60 // igual que el token del backend
}
