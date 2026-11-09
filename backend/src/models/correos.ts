import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, Default, Unique, AllowNull, Index } from 'sequelize-typescript'
import { Caso, Actuacion, Escrito } from './casos'
import { Usuario } from './usuarios'
import type { Etapa, EstadoCorreo } from '../services/constantes'

// =====================================
// CORREOS DEL BUZÓN DE TUTELAS (entrantes y salientes)
// Se guarda todo lo que entra: así la fecha de asignación es la del correo y queda la evidencia.
// =====================================
@Table({ tableName: 'correos' })
export class Correo extends Model {
  // Id del mensaje en Microsoft Graph (no repetir al releer el buzón)
  @Unique
  @Column(DataType.STRING(255))
  declare graphId: string | null

  @Index
  @Column(DataType.STRING(255))
  declare internetMessageId: string | null

  // Hilo: empareja las respuestas de la entidad con la solicitud que las originó
  @Index
  @Column(DataType.STRING(255))
  declare conversationId: string | null

  @AllowNull(false)
  @Column(DataType.STRING(10))
  declare direccion: 'ENTRANTE' | 'SALIENTE'

  // Etapa según el encabezado X-Tutelas-Etapa o el alias al que llegó
  @Column(DataType.STRING(25))
  declare etapaDetectada: Etapa | null

  // Alias o encabezado del que salió la etapa (para revisar la regla de Exchange)
  @Column(DataType.STRING(30))
  declare fuenteEtapa: 'ENCABEZADO' | 'ALIAS' | null

  @Column(DataType.STRING(255))
  declare remitente: string | null

  @Column(DataType.STRING(255))
  declare nombreRemitente: string | null

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  declare para: string[]

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  declare cc: string[]

  @Column(DataType.TEXT)
  declare asunto: string | null

  // Cuerpo en texto (sin HTML) para buscar el radicado y mostrarlo en la bandeja
  @Column(DataType.TEXT)
  declare cuerpoTexto: string | null

  @Index
  @AllowNull(false)
  @Column(DataType.DATE)
  declare fechaCorreo: Date

  // Radicados de 23 dígitos encontrados en asunto, cuerpo y PDF
  @Default([])
  @Column(DataType.ARRAY(DataType.STRING(23)))
  declare radicados: string[]

  @Index
  @Default('POR_REGISTRAR')
  @Column(DataType.STRING(15))
  declare estado: EstadoCorreo

  // Para qué se envió (salientes) o qué resultó ser (entrantes): ASIGNACION, RESPUESTA_INSUMOS,
  // DEVOLUCION, CONSTANCIA_RADICACION...
  @Column(DataType.STRING(30))
  declare proposito: string | null

  @ForeignKey(() => Caso)
  @Column(DataType.INTEGER)
  declare casoId: number | null

  @BelongsTo(() => Caso)
  declare caso?: Caso

  @ForeignKey(() => Actuacion)
  @Column(DataType.INTEGER)
  declare actuacionId: number | null

  @BelongsTo(() => Actuacion)
  declare actuacion?: Actuacion

  @Column(DataType.TEXT)
  declare error: string | null

  // Quién lo registró o descartó (entrantes) o lo envió (salientes)
  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare usuarioId: number | null

  @BelongsTo(() => Usuario)
  declare usuario?: Usuario

  @HasMany(() => Archivo)
  declare archivos?: Archivo[]
}

// Adjuntos de correos y escritos, guardados en Azure Blob
@Table({ tableName: 'archivos' })
export class Archivo extends Model {
  @AllowNull(false)
  @Column(DataType.STRING(255))
  declare nombre: string

  @Column(DataType.STRING(120))
  declare tipoMime: string | null

  @Column(DataType.INTEGER)
  declare tamano: number | null

  // Ruta dentro del contenedor. null = no se pudo subir (queda el registro para reintentar)
  @Column(DataType.STRING(500))
  declare rutaBlob: string | null

  @ForeignKey(() => Correo)
  @Column(DataType.INTEGER)
  declare correoId: number | null

  @BelongsTo(() => Correo, { onDelete: 'CASCADE' })
  declare correo?: Correo

  @ForeignKey(() => Caso)
  @Column(DataType.INTEGER)
  declare casoId: number | null

  @ForeignKey(() => Actuacion)
  @Column(DataType.INTEGER)
  declare actuacionId: number | null

  @ForeignKey(() => Escrito)
  @Column(DataType.INTEGER)
  declare escritoId: number | null

  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare usuarioId: number | null
}

export type CambioCampo = { campo: string, antes: string | null, despues: string | null }

// Bitácora del caso (línea de tiempo). Se llena con hooks de los modelos (services/historialCasos)
@Table({ tableName: 'historial_casos', updatedAt: false })
export class HistorialCaso extends Model {
  @Index
  @ForeignKey(() => Caso)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare casoId: number

  @Column(DataType.INTEGER)
  declare actuacionId: number | null

  @AllowNull(false)
  @Column(DataType.STRING(30))
  declare seccion: string

  @AllowNull(false)
  @Column(DataType.STRING(15))
  declare accion: 'CREADO' | 'MODIFICADO' | 'ELIMINADO'

  @Default([])
  @Column(DataType.JSONB)
  declare cambios: CambioCampo[]

  @Column(DataType.INTEGER)
  declare usuarioId: number | null

  @Column(DataType.STRING(150))
  declare nombreUsuario: string | null

  @Column(DataType.STRING(15))
  declare origen: string | null
}
