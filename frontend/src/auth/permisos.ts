export type CodigoRol = "ADMIN" | "COORDINADOR" | "ASISTENTE" | "AUXILIAR" | "REVISOR" | "CONSULTA"

export const NOMBRES_ROLES: Record<CodigoRol, string> = {
  ADMIN: "Administrador",
  COORDINADOR: "Coordinador",
  ASISTENTE: "Asistente administrativo",
  AUXILIAR: "Auxiliar jurídico",
  REVISOR: "Revisor",
  CONSULTA: "Consulta del tablero (cliente)"
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
  { href: "/tablero", nombre: "Tablero de la operación", descripcion: "Lo mismo que ve el cliente en Power BI", roles: ["COORDINADOR", "REVISOR", "ASISTENTE", "CONSULTA"] },
  { href: "/indicadores", nombre: "Indicadores ANS", descripcion: "Cumplimiento de los acuerdos de servicio", roles: ["COORDINADOR", "REVISOR", "ASISTENTE"] },
  { href: "/alertas", nombre: "Alertas", descripcion: "Términos, desacatos, insumos y duplicidad", roles: ["COORDINADOR", "REVISOR", "ASISTENTE"] },
  { href: "/informes", nombre: "Informes", descripcion: "Semanal y mensual en Excel", roles: ["COORDINADOR", "REVISOR", "ASISTENTE"] },
  { href: "/asistencia", nombre: "Asistencia", descripcion: "Equipo mínimo del día (ANS-11)", roles: ["COORDINADOR", "ASISTENTE"] },
  { href: "/equipos", nombre: "Equipos", descripcion: "Revisores, auxiliares y etapas", roles: ["COORDINADOR"] },
  { href: "/plantillas", nombre: "Plantillas de correo", descripcion: "Textos de los correos de salida", roles: ["COORDINADOR"] },
  { href: "/archivo-maestro", nombre: "Archivo maestro", descripcion: "Radicados de otros operadores", roles: ["COORDINADOR"] },
  { href: "/parametros", nombre: "Parámetros", descripcion: "Plazos, ANS y días no hábiles", roles: ["COORDINADOR"] },
  { href: "/usuarios", nombre: "Usuarios", descripcion: "Cuentas y perfiles", roles: ["ADMIN"] }
]

// D28: PST y la entidad (perfil de consulta) solo ven el tablero de la operación
export const soloConsulta = (roles: string[]) => roles.length > 0 && roles.every(r => r === "CONSULTA")

export const modulosPermitidos = (roles: string[]) => soloConsulta(roles)
  ? MODULOS.filter(m => m.href === "/tablero")
  : MODULOS.filter(m => !m.roles.length || tieneRol(roles, m.roles))
