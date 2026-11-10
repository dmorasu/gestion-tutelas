export type CodigoRol = "ADMIN" | "COORDINADOR" | "ASISTENTE" | "AUXILIAR" | "REVISOR"

export const NOMBRES_ROLES: Record<CodigoRol, string> = {
  ADMIN: "Administrador",
  COORDINADOR: "Coordinador",
  ASISTENTE: "Asistente administrativo",
  AUXILIAR: "Auxiliar jurídico",
  REVISOR: "Revisor"
}

// El Administrador entra a todo
export const tieneRol = (propios: string[], requeridos: CodigoRol[]) =>
  propios.includes("ADMIN") || requeridos.some(r => propios.includes(r))

// descripcion: solo para las tarjetas del inicio (textos cortos, como en Nodex)
export type Modulo = { href: string, nombre: string, descripcion: string, roles: CodigoRol[] }

// roles vacío = todos los perfiles. Inicio va aparte (siempre está en el menú)
export const MODULOS: Modulo[] = [
  { href: "/correos", nombre: "Correos", descripcion: "Asignaciones, insumos y respuestas de los buzones", roles: ["ASISTENTE", "COORDINADOR"] },
  { href: "/casos", nombre: "Casos", descripcion: "Actuaciones abiertas y sus plazos", roles: [] },
  { href: "/seguimiento", nombre: "Tablero diario", descripcion: "Estado de los casos por etapa y por persona", roles: [] },
  { href: "/indicadores", nombre: "Indicadores ANS", descripcion: "Cumplimiento de los acuerdos de servicio", roles: ["COORDINADOR", "REVISOR", "ASISTENTE"] },
  { href: "/alertas", nombre: "Alertas", descripcion: "Términos, desacatos, insumos y duplicidad", roles: ["COORDINADOR", "REVISOR", "ASISTENTE"] },
  { href: "/informes", nombre: "Informes", descripcion: "Semanal y mensual en Excel", roles: ["COORDINADOR", "REVISOR", "ASISTENTE"] },
  { href: "/equipos", nombre: "Equipos", descripcion: "Revisores, auxiliares y etapas", roles: ["COORDINADOR"] },
  { href: "/plantillas", nombre: "Plantillas de correo", descripcion: "Textos de los correos de salida", roles: ["COORDINADOR"] },
  { href: "/archivo-maestro", nombre: "Archivo maestro", descripcion: "Radicados de otros operadores", roles: ["COORDINADOR"] },
  { href: "/parametros", nombre: "Parámetros", descripcion: "Plazos, ANS y días no hábiles", roles: ["COORDINADOR"] },
  { href: "/usuarios", nombre: "Usuarios", descripcion: "Cuentas y perfiles", roles: ["ADMIN"] }
]

export const modulosPermitidos = (roles: string[]) => MODULOS.filter(m => !m.roles.length || tieneRol(roles, m.roles))
