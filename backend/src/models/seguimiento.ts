import { Table, Column, Model, DataType, ForeignKey, BelongsTo, Default, AllowNull, Index } from 'sequelize-typescript'
import { Caso, Actuacion } from './casos'
import { Usuario } from './usuarios'
import { Archivo } from './correos'

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
  @Column(DataType.STRING(20))
  declare tipo: 'TERMINO_PROXIMO' | 'TERMINO_VENCIDO' | 'DESACATO' | 'FALTA_INSUMOS' | 'DUPLICIDAD'

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

  @Column(DataType.INTEGER)
  declare correoId: number | null
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
