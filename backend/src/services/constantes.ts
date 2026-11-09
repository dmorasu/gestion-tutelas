// =====================================
// VALORES DEL DOMINIO (los de la hoja "Seguimiento Acciones" del Excel)
// =====================================

export const ROLES = {
  ADMIN: 'ADMIN',
  COORDINADOR: 'COORDINADOR',
  ASISTENTE: 'ASISTENTE',
  AUXILIAR: 'AUXILIAR',
  ABOGADO: 'ABOGADO'
} as const
export type CodigoRol = typeof ROLES[keyof typeof ROLES]

export const NOMBRES_ROLES: Record<CodigoRol, string> = {
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  ASISTENTE: 'Asistente',
  AUXILIAR: 'Auxiliar jurídico',
  ABOGADO: 'Abogado revisor'
}

export const TIPOS_SOLICITUD = ['TUTELA', 'ACCION_CUMPLIMIENTO', 'PQRS'] as const
export type TipoSolicitud = typeof TIPOS_SOLICITUD[number]

// Etapas del flujo. Un caso puede tener varias actuaciones abiertas a la vez (D12)
export const ETAPAS = ['ACCION', 'IMPUGNACION', 'CUMPLIMIENTO', 'REQUERIMIENTO_PREVIO', 'DESACATO', 'PQRS'] as const
export type Etapa = typeof ETAPAS[number]

export const NOMBRES_ETAPAS: Record<Etapa, string> = {
  ACCION: 'Acción',
  IMPUGNACION: 'Impugnación',
  CUMPLIMIENTO: 'Cumplimiento',
  REQUERIMIENTO_PREVIO: 'Requerimiento previo',
  DESACATO: 'Desacato',
  PQRS: 'PQRS'
}

// Valor del encabezado X-Tutelas-Etapa que pone la regla de Exchange según el alias.
// CUMPLIMIENTO agrupa cumplimiento, requerimiento previo y desacato: el asistente precisa
// la etapa al registrar
export const ETAPAS_DE_ALIAS: Record<string, Etapa> = {
  ACCION: 'ACCION',
  IMPUGNACION: 'IMPUGNACION',
  CUMPLIMIENTO: 'CUMPLIMIENTO',
  PQRS: 'PQRS'
}

export const CALIDADES_ENTIDAD = ['ACCIONADO', 'VINCULADO', 'DEMANDADO'] as const

export const UNIDADES_TERMINO = ['HORAS', 'DIAS_HABILES', 'DIAS_CALENDARIO'] as const
export type UnidadTermino = typeof UNIDADES_TERMINO[number]

// Estado de la actuación (de él sale el "Estado escrito" del Excel)
export const ESTADOS_ACTUACION = [
  'POR_ASUMIR', // asignada, el auxiliar aún no la toma
  'EN_INSUMOS', // insumos pedidos a la entidad
  'EN_PROYECCION', // proyectando el escrito
  'EN_REVISION', // con el abogado
  'ENTREGADO', // escrito enviado a la entidad
  'DEVUELTO', // la entidad lo devolvió
  'RADICADO', // la entidad lo radicó en el juzgado
  'CERRADA'
] as const
export type EstadoActuacion = typeof ESTADOS_ACTUACION[number]

export const ESTADOS_CORREO = ['POR_REGISTRAR', 'ASOCIADO', 'DESCARTADO', 'ERROR'] as const
export type EstadoCorreo = typeof ESTADOS_CORREO[number]

// Sentidos de las decisiones (D13: se agregan "Concede parcialmente" y los de desacato)
export const SENTIDOS_DECISION = [
  'CONCEDE', 'CONCEDE_PARCIAL', 'NIEGA', 'IMPROCEDENTE', // primera instancia
  'CONFIRMA', 'REVOCA', 'MODIFICA', // segunda instancia
  'SANCIONA', 'NO_SANCIONA' // desacato
] as const
