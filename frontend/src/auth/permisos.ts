export type CodigoRol = "ADMIN" | "COORDINADOR" | "ASISTENTE" | "AUXILIAR" | "ABOGADO"

export const NOMBRES_ROLES: Record<CodigoRol, string> = {
  ADMIN: "Administrador",
  COORDINADOR: "Coordinador",
  ASISTENTE: "Asistente",
  AUXILIAR: "Auxiliar jurídico",
  ABOGADO: "Abogado revisor"
}

// El Administrador entra a todo
export const tieneRol = (propios: string[], requeridos: CodigoRol[]) =>
  propios.includes("ADMIN") || requeridos.some(r => propios.includes(r))

// descripcion: solo para las tarjetas del inicio (textos cortos, como en Nodex)
export type Modulo = { href: string, nombre: string, descripcion: string, roles: CodigoRol[] }

// roles vacío = todos los perfiles. Inicio va aparte (siempre está en el menú)
export const MODULOS: Modulo[] = [
  { href: "/correos", nombre: "Correos por registrar", descripcion: "Asignaciones que llegan al buzón", roles: ["ASISTENTE", "COORDINADOR"] },
  { href: "/casos", nombre: "Tablero", descripcion: "Actuaciones abiertas y sus plazos", roles: [] },
  { href: "/parametros", nombre: "Parámetros", descripcion: "Plazos, ANS y días no hábiles", roles: ["COORDINADOR"] },
  { href: "/usuarios", nombre: "Usuarios", descripcion: "Cuentas y perfiles", roles: ["ADMIN"] }
]

export const modulosPermitidos = (roles: string[]) => MODULOS.filter(m => !m.roles.length || tieneRol(roles, m.roles))
