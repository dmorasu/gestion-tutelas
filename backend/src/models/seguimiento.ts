import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Default, AllowNull, Index } from 'sequelize-typescript'
import { Caso, Actuacion } from './casos'
import { Usuario } from './usuarios'
import { Archivo } from './correos'

// =====================================
// CORTES DE ALERTAS (reunión 18-nov). Va antes de Alerta: los decoradores leen su tipo al cargar
// Dos veces al día (HORAS_CORTE_ALERTAS) sale un solo correo al cliente con las alertas pendientes del
// momento. Cada corte queda registrado para que los asistentes revisen qué salió y lo reenvíen. Un
// corte automático por día y hora: si el worker se reinicia, no se repite
// =====================================
@Table({ tableName: 'cortes_alertas' })
export class CorteAlertas extends Model {
  @Index
  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare dia: string

  // Hora programada (HH:MM) del corte automático, o la hora en que se envió a mano
  @AllowNull(false)
  @Column(DataType.STRING(5))
  declare hora: string

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare automatico: boolean

  @Default(0)
  @Column(DataType.INTEGER)
  declare cantidad: number

  // El del correo: ENVIADO, SIMULADO o ERROR (con error, las alertas siguen pendientes)
  @AllowNull(false)
  @Column(DataType.STRING(10))
  declare estado: 'ENVIADO' | 'SIMULADO' | 'ERROR'

  @Column(DataType.TEXT)
  declare error: string | null

  @Column(DataType.INTEGER)
  declare correoId: number | null

  @Default(0)
  @Column(DataType.INTEGER)
  declare reenvios: number

  @Column(DataType.DATE)
  declare ultimoReenvio: Date | null

  // Quien lo envió a mano o lo reenvió por última vez
  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare usuarioId: number | null

  @BelongsTo(() => Usuario)
  declare usuario?: Usuario
}

// =====================================
// ALERTAS INMEDIATAS (manual §22 y correo del cliente, punto 5)
// Términos vencidos o próximos, requerimientos de cumplimiento y desacatos, falta de insumos y
// duplicidad con otro operador. La app las detecta; el coordinador las emite por escrito al
// cliente. ANS-08 mide que se emitan el mismo día hábil de la detección (el siguiente si se
// detectan después del corte).
// =====================================
@Table({ tableName: 'alertas' })
export class Alerta extends Model {
  @Index
  @AllowNull(false)
  @Column(DataType.STRING(30))
  declare tipo: 'TERMINO_PROXIMO' | 'TERMINO_VENCIDO' | 'DESACATO' | 'FALTA_INSUMOS' | 'DUPLICIDAD' | 'CUMPLIMIENTO_PENDIENTE'

  @ForeignKey(() => Caso)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare casoId: number

  @BelongsTo(() => Caso, { onDelete: 'CASCADE' })
  declare caso?: Caso

  @ForeignKey(() => Actuacion)
  @Column(DataType.INTEGER)
  declare actuacionId: number | null

  @BelongsTo(() => Actuacion, { onDelete: 'CASCADE' })
  declare actuacion?: Actuacion

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare mensaje: string

  @AllowNull(false)
  @Column(DataType.DATE)
  declare fechaDeteccion: Date

  // Hasta cuándo se debe emitir para cumplir ANS-08
  @Column(DataType.DATE)
  declare fechaLimiteEmision: Date | null

  @Index
  @Default('PENDIENTE')
  @Column(DataType.STRING(10))
  declare estado: 'PENDIENTE' | 'EMITIDA' | 'DESCARTADA'

  @Column(DataType.DATE)
  declare fechaEmision: Date | null

  @Column(DataType.TEXT)
  declare motivoDescarte: string | null

  // Quien la emitió o la descartó
  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare usuarioId: number | null

  @BelongsTo(() => Usuario)
  declare usuario?: Usuario

  // Último correo con que salió (el del corte, la emisión suelta o el último reenvío)
  @Column(DataType.INTEGER)
  declare correoId: number | null

  // Corte en que se emitió por primera vez (reunión 18-nov: dos cortes al día). Nulo si se emitió suelta
  @ForeignKey(() => CorteAlertas)
  @Column(DataType.INTEGER)
  declare corteId: number | null

  @BelongsTo(() => CorteAlertas)
  declare corte?: CorteAlertas

  // fechaEmision es la primera (la que mide ANS-08); los reenvíos solo suman aquí
  @Default(0)
  @Column(DataType.INTEGER)
  declare vecesEnviada: number

  @Column(DataType.DATE)
  declare ultimoEnvio: Date | null
}

// =====================================
// INFORMES (correo del cliente, punto 5, y manual §26)
// Semanal (segundo día hábil) y mensual (quinto día hábil). El Excel queda en SharePoint y ANS-10
// mide que se genere a tiempo.
// =====================================
@Table({ tableName: 'informes' })
export class Informe extends Model {
  @AllowNull(false)
  @Column(DataType.STRING(10))
  declare tipo: 'SEMANAL' | 'MENSUAL'

  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare desde: string

  // Último día incluido
  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare hasta: string

  @Column(DataType.DATE)
  declare fechaLimite: Date | null

  @ForeignKey(() => Archivo)
  @Column(DataType.INTEGER)
  declare archivoId: number | null

  @BelongsTo(() => Archivo)
  declare archivo?: Archivo

  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare usuarioId: number | null

  @BelongsTo(() => Usuario)
  declare usuario?: Usuario

  // Cifras del informe (para verlas en la app sin abrir el Excel)
  @Column(DataType.JSONB)
  declare resumen: unknown
}

// =====================================
// ANS POR MES: foto del cálculo de services/indicadores (la misma regla de la pantalla). La lee la
// vista tablero.ans de Power BI y el tablero de la app: así las dos muestran las mismas cifras.
// Se refresca cada 30 minutos el mes en curso y el anterior; los meses cerrados no cambian.
// =====================================
@Table({ tableName: 'ans_periodos', indexes: [{ unique: true, fields: ['mes', 'codigo'] }] })
export class AnsPeriodo extends Model {
  // AAAA-MM
  @AllowNull(false)
  @Column(DataType.STRING(7))
  declare mes: string

  @AllowNull(false)
  @Column(DataType.STRING(10))
  declare codigo: string

  @AllowNull(false)
  @Column(DataType.STRING(80))
  declare nombre: string

  @Column(DataType.STRING(10))
  declare sentido: string | null

  @Column(DataType.DECIMAL(6, 2))
  declare meta: number | null

  @Default(0)
  @Column(DataType.INTEGER)
  declare cumplen: number

  @Default(0)
  @Column(DataType.INTEGER)
  declare total: number

  @Column(DataType.DECIMAL(6, 2))
  declare porcentaje: number | null

  @Column(DataType.BOOLEAN)
  declare cumple: boolean | null

  // Se mide fuera de la app (ANS-11, ANS-12)
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare fueraDeApp: boolean

  // D29: nivel de incumplimiento (LEVE, MODERADO, GRAVE) y descuento sobre la factura del mes
  @Column(DataType.STRING(10))
  declare nivel: string | null

  @Column(DataType.DECIMAL(5, 2))
  declare descuento: number | null
}

// =====================================
// ASISTENCIA DIARIA (D27, ANS-11): una fila por persona y día hábil. El equipo mínimo se mide por
// rol contra el parámetro EQUIPO_MINIMO
// =====================================
@Table({ tableName: 'asistencias', indexes: [{ unique: true, fields: ['fecha', 'usuarioId'] }] })
export class Asistencia extends Model {
  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare fecha: string

  @ForeignKey(() => Usuario)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare usuarioId: number

  @BelongsTo(() => Usuario, { foreignKey: 'usuarioId', onDelete: 'CASCADE' })
  declare usuario?: Usuario

  @AllowNull(false)
  @Column(DataType.STRING(15))
  declare estado: 'PRESENTE' | 'AUSENTE' | 'INCAPACIDAD' | 'VACACIONES' | 'PERMISO'

  @Column(DataType.STRING(200))
  declare observacion: string | null

  // Quién la registró
  @Column(DataType.INTEGER)
  declare registradaPorId: number | null
}

// =====================================
// TRAMOS DE LA ACTUACIÓN (reunión 18-nov: tiempos de las acciones)
// Cuánto estuvo cada actuación en cada estado y quién la tenía. Sirve para estimar cuánto toma cada
// tipo de respuesta en cada etapa y en cada paso (registro, elaboración, revisión, corrección), y para
// la productividad diaria de cada persona. Se escribe solo con los hooks de la actuación
// (services/tiempos.ts); fin nulo = el tramo en curso.
// =====================================
@Table({ tableName: 'tramos_actuacion', updatedAt: false })
export class TramoActuacion extends Model {
  @Index
  @ForeignKey(() => Actuacion)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare actuacionId: number

  @BelongsTo(() => Actuacion, { onDelete: 'CASCADE' })
  declare actuacion?: Actuacion

  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare casoId: number

  // La etapa en ese momento (una nulidad cambia de etapa al clasificarse)
  @AllowNull(false)
  @Column(DataType.STRING(25))
  declare etapa: string

  // El estado de la actuación durante el tramo ('REGISTRO' para el paso del asistente)
  @AllowNull(false)
  @Column(DataType.STRING(20))
  declare estado: string

  // A qué estado pasó al cerrar: distingue, por ejemplo, una revisión aprobada de una devuelta
  @Column(DataType.STRING(20))
  declare estadoSiguiente: string | null

  @Index
  @AllowNull(false)
  @Column(DataType.STRING(15))
  declare fase: 'REGISTRO' | 'POR_ASUMIR' | 'ELABORACION' | 'INSUMOS' | 'REVISION' | 'AJUSTE' | 'ENTIDAD' | 'CORRECCION' | 'RADICACION'

  @AllowNull(false)
  @Column(DataType.STRING(12))
  declare perfil: 'ASISTENTE' | 'AUXILIAR' | 'REVISOR' | 'ENTIDAD'

  // Quien tenía el tramo (el auxiliar, el revisor o quien registró). Nulo en las esperas de la entidad
  @Index
  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare usuarioId: number | null

  @BelongsTo(() => Usuario)
  declare usuario?: Usuario

  @AllowNull(false)
  @Column(DataType.DATE)
  declare inicio: Date

  @Index
  @Column(DataType.DATE)
  declare fin: Date | null

  // Horas corridas y horas dentro de la jornada de días hábiles (lo que de verdad se trabajó)
  @Column(DataType.FLOAT)
  declare horas: number | null

  @Column(DataType.FLOAT)
  declare horasHabiles: number | null
}
