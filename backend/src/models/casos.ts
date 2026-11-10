import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, Default, Unique, AllowNull, Index } from 'sequelize-typescript'
import { Usuario, Equipo } from './usuarios'
import { Juzgado, MotivoDevolucion } from './catalogos'
import type { Criticidad, Etapa, EstadoActuacion, TipoSolicitud, UnidadTermino } from '../services/constantes'

// =====================================
// CASO: un radicado. Agrupa las actuaciones de todas sus etapas.
// =====================================
@Table({ tableName: 'casos' })
export class Caso extends Model {
  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(23))
  declare radicado: string

  // Número interno de la firma (GPA-AAAA-NNNNN). Va en el acuse de la asignación: el cliente puede
  // usarlo cuando no tenga el radicado a mano (correo del cliente, punto 3.3)
  @Unique
  @Column(DataType.STRING(20))
  declare numeroInterno: string | null

  @AllowNull(false)
  @Column(DataType.STRING(25))
  declare tipoSolicitud: TipoSolicitud

  @ForeignKey(() => Juzgado)
  @Column(DataType.INTEGER)
  declare juzgadoId: number | null

  @BelongsTo(() => Juzgado)
  declare juzgado?: Juzgado

  @Default('ACCIONADO')
  @Column(DataType.STRING(15))
  declare calidadEntidad: string

  // Etapa con la que llegó la primera vez: no cambia (fila 13 del Excel)
  @AllowNull(false)
  @Column(DataType.STRING(25))
  declare etapaInicial: Etapa

  // Etapa de la actuación abierta más reciente (fila 14)
  @AllowNull(false)
  @Column(DataType.STRING(25))
  declare etapaActual: Etapa

  @Default('ABIERTO')
  @Column(DataType.STRING(10))
  declare estado: 'ABIERTO' | 'CERRADO'

  @Column(DataType.DATE)
  declare fechaCierre: Date | null

  @Column(DataType.STRING(200))
  declare motivoCierre: string | null

  // Derechos involucrados (tutela) o cumplimiento exigido (acción de cumplimiento)
  @Column(DataType.TEXT)
  declare derechosInvolucrados: string | null

  @Column(DataType.TEXT)
  declare observaciones: string | null

  // El archivo maestro de la entidad asigna este radicado a otro operador (ANS-13)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare deOtroOperador: boolean

  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare registradoPorId: number | null

  @BelongsTo(() => Usuario, 'registradoPorId')
  declare registradoPor?: Usuario

  @HasMany(() => Parte)
  declare partes?: Parte[]

  @HasMany(() => Actuacion)
  declare actuaciones?: Actuacion[]
}

// Accionantes y demás partes. Varias por caso (D18)
@Table({ tableName: 'partes' })
export class Parte extends Model {
  @ForeignKey(() => Caso)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare casoId: number

  @BelongsTo(() => Caso, { onDelete: 'CASCADE' })
  declare caso?: Caso

  @Default('ACCIONANTE')
  @Column(DataType.STRING(20))
  declare rol: 'ACCIONANTE' | 'VINCULADO' | 'APODERADO'

  @Column(DataType.STRING(10))
  declare tipoDocumento: string | null

  @Index
  @Column(DataType.STRING(30))
  declare numeroDocumento: string | null

  @AllowNull(false)
  @Column(DataType.STRING(200))
  declare nombre: string
}

// =====================================
// ACTUACIÓN: una etapa del caso (acción, impugnación, cumplimiento, requerimiento, desacato).
// Cada bloque de la hoja "Seguimiento Acciones" es una actuación con los mismos campos.
// =====================================
@Table({ tableName: 'actuaciones' })
export class Actuacion extends Model {
  @ForeignKey(() => Caso)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare casoId: number

  @BelongsTo(() => Caso, { onDelete: 'CASCADE' })
  declare caso?: Caso

  @AllowNull(false)
  @Column(DataType.STRING(25))
  declare etapa: Etapa

  @Default('POR_ASUMIR')
  @Column(DataType.STRING(20))
  declare estado: EstadoActuacion

  // Nivel de riesgo (manual §13): el del asunto de la asignación o el calculado, el que sea mayor
  @Default('ORDINARIO')
  @Column(DataType.STRING(10))
  declare criticidad: Criticidad

  @Column(DataType.STRING(10))
  declare criticidadFuente: 'ASUNTO' | 'CALCULADA' | 'MANUAL' | null

  // Hora de llegada del correo de la entidad: protege el ANS aunque se registre después
  @AllowNull(false)
  @Column(DataType.DATE)
  declare fechaAsignacion: Date

  // La misma, corrida por la hora de corte y los días no hábiles (D1). Desde aquí cuentan los ANS
  @Column(DataType.DATE)
  declare fechaAsignacionEfectiva: Date | null

  // Notificación de la acción, del fallo impugnado, del requerimiento o de la apertura del desacato
  @Column(DataType.DATE)
  declare fechaNotificacion: Date | null

  // Término que da el juez (D4)
  @Column(DataType.INTEGER)
  declare terminoValor: number | null

  @Column(DataType.STRING(20))
  declare terminoUnidad: UnidadTermino | null

  // Vencimiento que informa la entidad en la asignación ([Vence: fecha y hora] del asunto).
  // Si está, manda sobre el cálculo con el término (manual §12.1)
  @Column(DataType.DATE)
  declare fechaVencimientoInformada: Date | null

  // Vencimiento del término judicial: el informado o el calculado con notificación y término
  @Column(DataType.DATE)
  declare fechaVencimiento: Date | null

  // Hasta cuándo hay que entregar el escrito para cumplir el ANS (lo menor entre el ANS y el vencimiento)
  @Column(DataType.DATE)
  declare fechaLimiteEntrega: Date | null

  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare auxiliarId: number | null

  @BelongsTo(() => Usuario, 'auxiliarId')
  declare auxiliar?: Usuario

  // Todo escrito lo revisa el revisor del equipo antes de entregarlo (roles del cliente)
  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare revisorId: number | null

  @BelongsTo(() => Usuario, 'revisorId')
  declare revisor?: Usuario

  @ForeignKey(() => Equipo)
  @Column(DataType.INTEGER)
  declare equipoId: number | null

  @BelongsTo(() => Equipo)
  declare equipo?: Equipo

  @Default(false)
  @Column(DataType.BOOLEAN)
  declare requiereInsumos: boolean

  // D6: la asignación llegó sin sus insumos mínimos y se pidieron los datos faltantes. Mientras
  // tanto el ANS no corre; cuando llegan, cuenta desde fechaDatosCompletos
  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  declare datosFaltantesPendientes: boolean

  @Column(DataType.DATE)
  declare fechaDatosCompletos: Date | null

  @Column(DataType.DATE)
  declare fechaAsumida: Date | null

  // El auxiliar envió el paquete al revisor (la última vez)
  @Column(DataType.DATE)
  declare fechaEnvioRevision: Date | null

  // Lo que se pide al juez (tipificado por etapa)
  @Column(DataType.TEXT)
  declare loQueSePide: string | null

  // Impugnación: quién impugna y cuándo la pidió la entidad (ANS-03)
  @Column(DataType.STRING(15))
  declare origenImpugnacion: 'ACCIONANTE' | 'ACCIONADO' | null

  @Column(DataType.DATE)
  declare fechaImpugnacion: Date | null

  // Cumplimiento: responsable (entidad, PST, ambos, otro)
  @Column(DataType.STRING(15))
  declare responsableCumplimiento: string | null

  // Actuación de la que nace (la impugnación nace de la acción, el desacato del cumplimiento...)
  @ForeignKey(() => Actuacion)
  @Column(DataType.INTEGER)
  declare actuacionOrigenId: number | null

  @Column(DataType.DATE)
  declare fechaCierre: Date | null

  @HasMany(() => SolicitudInsumo)
  declare insumos?: SolicitudInsumo[]

  @HasMany(() => Escrito)
  declare escritos?: Escrito[]

  @HasMany(() => RadicacionJuzgado)
  declare radicaciones?: RadicacionJuzgado[]

  @HasMany(() => Decision)
  declare decisiones?: Decision[]
}

@Table({ tableName: 'solicitudes_insumos' })
export class SolicitudInsumo extends Model {
  @ForeignKey(() => Actuacion)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare actuacionId: number

  @BelongsTo(() => Actuacion, { onDelete: 'CASCADE' })
  declare actuacion?: Actuacion

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare descripcion: string

  // Insumo mínimo para empezar a contar el ANS (D6)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare minimo: boolean

  // Hora de envío del correo de solicitud (automática)
  @Column(DataType.DATE)
  declare fechaSolicitud: Date | null

  // Hasta cuándo tiene el cliente para entregarlo: 2 días hábiles, el mismo día si es crítico (§11)
  @Column(DataType.DATE)
  declare fechaLimite: Date | null

  // Hora de llegada de la respuesta de la entidad (automática, por el hilo)
  @Column(DataType.DATE)
  declare fechaRecepcion: Date | null

  // Hilo del correo para emparejar la respuesta
  @Column(DataType.STRING(255))
  declare conversationId: string | null
}

// Escrito (contestación, impugnación, cumplimiento, respuesta a requerimiento, desacato).
// Cada entrega a la entidad es una versión: la 2 en adelante son correcciones de una devolución
@Table({ tableName: 'escritos' })
export class Escrito extends Model {
  @ForeignKey(() => Actuacion)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare actuacionId: number

  @BelongsTo(() => Actuacion, { onDelete: 'CASCADE' })
  declare actuacion?: Actuacion

  @Default(1)
  @Column(DataType.INTEGER)
  declare version: number

  @AllowNull(false)
  @Column(DataType.STRING(30))
  declare tipo: string

  // BORRADOR: el auxiliar lo está armando. EN_REVISION: con el revisor. AJUSTE_INTERNO: el revisor lo devolvió al auxiliar.
  // ENTREGADO, DEVUELTO o APROBADO: según la respuesta de la entidad
  @Default('BORRADOR')
  @Column(DataType.STRING(15))
  declare estado: 'BORRADOR' | 'EN_REVISION' | 'AJUSTE_INTERNO' | 'ENTREGADO' | 'DEVUELTO' | 'APROBADO'

  // Enlace al paquete (escrito y anexos) en el repositorio autorizado: se entrega por enlace,
  // no por adjunto (correo del cliente, punto 3.2, y manual §23)
  @Column(DataType.STRING(1000))
  declare enlace: string | null

  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare elaboradoPorId: number | null

  @Column(DataType.DATE)
  declare fechaEnvioRevision: Date | null

  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare revisadoPorId: number | null

  @Column(DataType.DATE)
  declare fechaRevision: Date | null

  // Lo que pidió corregir el revisor (devolución interna, no cuenta para ANS-05)
  @Column(DataType.TEXT)
  declare observacionRevision: string | null

  @Column(DataType.DATE)
  declare fechaEntregaEntidad: Date | null

  // Fecha límite del ANS al momento de entregar: los indicadores se miden contra ella, no contra
  // la de hoy (una devolución posterior la cambia)
  @Column(DataType.DATE)
  declare limiteAns: Date | null

  // Acuse o aprobación de la entidad. Sin acuse el mismo día hábil, la constancia de envío vale como recibo (§17)
  @Column(DataType.DATE)
  declare fechaAcuse: Date | null

  @Column(DataType.DATE)
  declare fechaAprobacion: Date | null

  // Correo con el que salió la entrega: su hilo empareja el acuse o la devolución
  @Column(DataType.INTEGER)
  declare correoEntregaId: number | null

  // Se adjunta respuesta a un derecho de petición (se relaciona con PQRS)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare adjuntaRespuestaDP: boolean

  @HasMany(() => Devolucion)
  declare devoluciones?: Devolucion[]
}

@Table({ tableName: 'devoluciones' })
export class Devolucion extends Model {
  @ForeignKey(() => Escrito)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare escritoId: number

  @BelongsTo(() => Escrito, { onDelete: 'CASCADE' })
  declare escrito?: Escrito

  @AllowNull(false)
  @Column(DataType.DATE)
  declare fechaDevolucion: Date

  // Clasificación del manual (§17): fondo, falta de soporte, criterio institucional o estilo.
  // ANS-05 cuenta solo las de fondo; las de estilo no reinician el proceso
  @Default('SIN_CLASIFICAR')
  @Column(DataType.STRING(15))
  declare tipo: 'FONDO' | 'SOPORTE' | 'CRITERIO' | 'ESTILO' | 'SIN_CLASIFICAR'

  // Correo de la entidad con la devolución (capturado del buzón de entregas)
  @Column(DataType.INTEGER)
  declare correoId: number | null

  // Llegó después de los días hábiles que tiene la entidad para devolver (manual §17)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare extemporanea: boolean

  @ForeignKey(() => MotivoDevolucion)
  @Column(DataType.INTEGER)
  declare motivoId: number | null

  @BelongsTo(() => MotivoDevolucion)
  declare motivo?: MotivoDevolucion

  @Column(DataType.TEXT)
  declare observacion: string | null

  // Plazo para corregir (ANS-06) y cuándo se entregó la corrección
  @Column(DataType.DATE)
  declare fechaLimiteCorreccion: Date | null

  @Column(DataType.DATE)
  declare fechaNuevaEntrega: Date | null
}

// La entidad radica el escrito en el juzgado (D17): por constancia en el buzón o marcado a mano
@Table({ tableName: 'radicaciones_juzgado' })
export class RadicacionJuzgado extends Model {
  @ForeignKey(() => Actuacion)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare actuacionId: number

  @BelongsTo(() => Actuacion, { onDelete: 'CASCADE' })
  declare actuacion?: Actuacion

  @AllowNull(false)
  @Column(DataType.DATE)
  declare fechaRadicacion: Date

  @Default('MANUAL')
  @Column(DataType.STRING(10))
  declare fuente: 'CORREO' | 'MANUAL'

  @Column(DataType.INTEGER)
  declare correoId: number | null
}

@Table({ tableName: 'decisiones' })
export class Decision extends Model {
  @ForeignKey(() => Actuacion)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare actuacionId: number

  @BelongsTo(() => Actuacion, { onDelete: 'CASCADE' })
  declare actuacion?: Actuacion

  @AllowNull(false)
  @Column(DataType.STRING(10))
  declare instancia: 'PRIMERA' | 'SEGUNDA' | 'DESACATO'

  @Column(DataType.DATEONLY)
  declare fechaDecision: string | null

  @Column(DataType.DATE)
  declare fechaNotificacion: Date | null

  @AllowNull(false)
  @Column(DataType.STRING(20))
  declare sentido: string

  // Calculado con el parámetro SENTIDOS_FAVORABLES (D13), se guarda para no recalcular reportes
  @Column(DataType.BOOLEAN)
  declare favorable: boolean | null

  // Primera instancia: hasta cuándo se puede impugnar (D5)
  @Column(DataType.DATE)
  declare fechaVenceImpugnacion: Date | null
}
