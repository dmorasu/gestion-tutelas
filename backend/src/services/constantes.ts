// =====================================
// VALORES DEL DOMINIO
// Fuentes: hoja "Seguimiento Acciones" del Excel, correo de roles y buzones (Docs/informacion_correo.txt)
// y manual operativo v1.1 (Docs/*Manual_Operativo*.docx)
// =====================================

// Roles del correo del cliente: coordinador, revisor, auxiliar jurídico y asistente administrativo
export const ROLES = {
  ADMIN: 'ADMIN',
  COORDINADOR: 'COORDINADOR',
  ASISTENTE: 'ASISTENTE',
  AUXILIAR: 'AUXILIAR',
  REVISOR: 'REVISOR',
  // D28: PST y la entidad entran a ver solo el tablero de la operación
  CONSULTA: 'CONSULTA'
} as const
export type CodigoRol = typeof ROLES[keyof typeof ROLES]

export const NOMBRES_ROLES: Record<CodigoRol, string> = {
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  ASISTENTE: 'Asistente administrativo',
  AUXILIAR: 'Auxiliar jurídico',
  REVISOR: 'Revisor',
  CONSULTA: 'Consulta del tablero (cliente)'
}

export const TIPOS_SOLICITUD = ['TUTELA', 'ACCION_CUMPLIMIENTO', 'PQRS'] as const
export type TipoSolicitud = typeof TIPOS_SOLICITUD[number]

// Etapas del flujo. Un caso puede tener varias actuaciones abiertas a la vez (D12)
export const ETAPAS = ['ACCION', 'IMPUGNACION', 'CUMPLIMIENTO', 'REQUERIMIENTO_PREVIO', 'DESACATO', 'PQRS'] as const
export type Etapa = typeof ETAPAS[number]

export const NOMBRES_ETAPAS: Record<Etapa, string> = {
  ACCION: 'Contestación',
  IMPUGNACION: 'Impugnación',
  CUMPLIMIENTO: 'Cumplimiento',
  REQUERIMIENTO_PREVIO: 'Requerimiento previo',
  DESACATO: 'Desacato',
  PQRS: 'PQRS'
}

// Palabra de la etapa en el asunto normalizado: [Actuación: TUTELA, IMPUGNACIÓN, CUMPLIMIENTO,
// REQUERIMIENTO PREVIO, DESACATO]. "TUTELA" es la contestación de la acción
export const ETAPA_EN_ASUNTO: Record<Etapa, string> = {
  ACCION: 'TUTELA',
  IMPUGNACION: 'IMPUGNACIÓN',
  CUMPLIMIENTO: 'CUMPLIMIENTO',
  REQUERIMIENTO_PREVIO: 'REQUERIMIENTO PREVIO',
  DESACATO: 'DESACATO',
  PQRS: 'PQRS'
}

// Nivel de riesgo del manual (§13). Crítico: desacato, requerimiento, cumplimiento o término < 24 h
export const CRITICIDADES = ['CRITICO', 'ALTO', 'ORDINARIO'] as const
export type Criticidad = typeof CRITICIDADES[number]
export const NOMBRES_CRITICIDAD: Record<Criticidad, string> = { CRITICO: 'CRÍTICO', ALTO: 'ALTO', ORDINARIO: 'ORDINARIO' }

// Los tres buzones del servicio, cada uno con su función (correo del cliente, punto 2).
// La dirección de cada uno va en el .env
export const BUZONES = ['ASIGNACIONES', 'INSUMOS', 'ENTREGAS'] as const
export type Buzon = typeof BUZONES[number]
export const VARIABLE_BUZON: Record<Buzon, string> = {
  ASIGNACIONES: 'BUZON_ASIGNACIONES',
  INSUMOS: 'BUZON_INSUMOS',
  ENTREGAS: 'BUZON_ENTREGAS'
}

export const CALIDADES_ENTIDAD = ['ACCIONADO', 'VINCULADO', 'DEMANDADO'] as const

export const UNIDADES_TERMINO = ['HORAS', 'DIAS_HABILES', 'DIAS_CALENDARIO'] as const
export type UnidadTermino = typeof UNIDADES_TERMINO[number]

// Estado de la actuación: las etapas internas del manual (§11) y los roles del correo
export const ESTADOS_ACTUACION = [
  'POR_ASUMIR', // asignada, el auxiliar aún no la toma
  'EN_ANALISIS', // el auxiliar revisa el expediente
  'EN_INSUMOS', // insumos pedidos: suspende el ANS del componente (manual §12.3)
  'EN_PROYECCION', // proyectando el escrito
  'EN_REVISION', // paquete enviado al revisor
  'AJUSTE_INTERNO', // el revisor lo devolvió al auxiliar
  'ENTREGADO', // V1 o V2 enviada a la entidad
  'DEVUELTO', // la entidad lo devolvió: se ajusta y sale la V2
  'APROBADO', // confirmación expresa del funcionario autorizado (§17)
  'RADICADO', // la entidad informó la radicación
  'CERRADA'
] as const
export type EstadoActuacion = typeof ESTADOS_ACTUACION[number]

export const ESTADOS_CORREO = ['POR_REGISTRAR', 'ASOCIADO', 'DESCARTADO', 'ENVIADO', 'SIMULADO', 'ERROR'] as const
export type EstadoCorreo = typeof ESTADOS_CORREO[number]

// Plantillas de los correos de salida (correo del cliente, punto 2). El texto es editable en la app:
// el cliente aún no envía sus plantillas
// titulo: el encabezado grande del correo (editable en la plantilla)
export const PLANTILLAS = {
  ACUSE_ASIGNACION: { buzon: 'ASIGNACIONES', nombre: 'Confirmación de recibido de la asignación', titulo: 'Asignación recibida' },
  ACUSE_PAQUETE: { buzon: 'ASIGNACIONES', nombre: 'Confirmación de recibido de un paquete de asignaciones (Excel)', titulo: 'Asignaciones recibidas' },
  SOLICITUD_DATOS_FALTANTES: { buzon: 'ASIGNACIONES', nombre: 'Solicitud de datos faltantes de la asignación', titulo: 'Solicitud de información faltante' },
  ACUSE_DATOS_FALTANTES: { buzon: 'ASIGNACIONES', nombre: 'Confirmación de recibido de la información faltante', titulo: 'Información recibida' },
  SOLICITUD_INSUMOS: { buzon: 'INSUMOS', nombre: 'Solicitud de insumos', titulo: 'Solicitud de insumos' },
  ACUSE_INSUMOS: { buzon: 'INSUMOS', nombre: 'Confirmación de recibido de insumos', titulo: 'Insumos recibidos' },
  ENTREGA_V1: { buzon: 'ENTREGAS', nombre: 'Entrega V1 del escrito y anexos', titulo: 'Entrega del proyecto de escrito' },
  ENTREGA_V2: { buzon: 'ENTREGAS', nombre: 'Entrega V2 después de una devolución', titulo: 'Entrega del escrito ajustado' },
  ALERTA: { buzon: 'ASIGNACIONES', nombre: 'Alerta al cliente', titulo: '{{tipoAlerta}}' }
} as const satisfies Record<string, { buzon: Buzon, nombre: string, titulo: string }>
export type CodigoPlantilla = keyof typeof PLANTILLAS

// Tipo de escrito de cada actuación (D9 y D14). El memorial de cumplimiento (fallo desfavorable) y
// la respuesta al requerimiento previo son escritos distintos: el requerimiento puede llegar con o
// sin memorial enviado. En la impugnación, la entidad impugna o responde la del accionante (descorre)
export const TIPOS_ESCRITO = {
  ACCION: 'Contestación de la acción',
  IMPUGNACION: 'Escrito de impugnación',
  DESCORRE: 'Respuesta a la impugnación del accionante (descorre)',
  CUMPLIMIENTO: 'Memorial de cumplimiento',
  REQUERIMIENTO_PREVIO: 'Respuesta al requerimiento previo',
  DESACATO: 'Respuesta al incidente de desacato',
  PQRS: 'Respuesta a la PQRS'
} as const
export type TipoEscrito = keyof typeof TIPOS_ESCRITO

export const tipoEscrito = (a: { etapa: Etapa, origenImpugnacion?: string | null }): TipoEscrito =>
  a.etapa === 'IMPUGNACION' && a.origenImpugnacion === 'ACCIONANTE' ? 'DESCORRE' : a.etapa

// Sentidos de las decisiones (D13: "Concede parcialmente", "Hecho superado" y los de desacato)
export const SENTIDOS_DECISION = [
  'CONCEDE', 'CONCEDE_PARCIAL', 'NIEGA', 'IMPROCEDENTE', 'HECHO_SUPERADO', // primera instancia
  'CONFIRMA', 'REVOCA', 'MODIFICA', // segunda instancia
  'SANCIONA', 'NO_SANCIONA' // desacato
] as const
