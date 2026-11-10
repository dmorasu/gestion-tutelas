import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, Default, Unique, AllowNull, Index } from 'sequelize-typescript'
import { Caso, Actuacion, Escrito } from './casos'
import { Usuario } from './usuarios'
import type { Buzon, Criticidad, Etapa, EstadoCorreo } from '../services/constantes'

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

  // Buzón por el que entró o salió: asignaciones, insumos o entregas
  @Index
  @Column(DataType.STRING(15))
  declare buzon: Buzon | null

  // Lo que se leyó del asunto normalizado de la asignación (o, sin él, del texto)
  @Column(DataType.STRING(25))
  declare etapaDetectada: Etapa | null

  @Column(DataType.STRING(10))
  declare fuenteEtapa: 'ASUNTO' | 'TEXTO' | null

  @Column(DataType.STRING(10))
  declare criticidadDetectada: Criticidad | null

  @Column(DataType.DATE)
  declare vencimientoDetectado: Date | null

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

  // Enlaces del cuerpo: el cliente puede mandar los documentos como enlace en vez de adjunto
  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  declare enlaces: string[]

  // Respuesta que alguien debe atender: insumos recibidos, acuse o devolución de una entrega,
  // datos faltantes. Se apaga cuando se clasifica
  @Index
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare porRevisar: boolean

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

  @HasMany(() => EnlaceCorreo)
  declare enlacesPendientes?: EnlaceCorreo[]

  // Quién lo está atendiendo (lo tomó o se lo trasladaron). null = nadie: está "sin atender".
  // Sin asociación al modelo de usuarios: Correo ya tiene una (usuarioId) y dos obligarían a nombrarlas
  @Index
  @Column(DataType.INTEGER)
  declare responsableId: number | null

  @Column(DataType.DATE)
  declare tomadoEn: Date | null

  @Column(DataType.TEXT)
  declare notaTraslado: string | null

  // Ya se avisó al coordinador que la asignación pasó de MINUTOS_ALERTA_SIN_ATENDER sin atender
  @Column(DataType.DATE)
  declare avisoSinAtenderEn: Date | null
}

// =====================================
// ENLACES DE SHAREPOINT QUE TRAE UN CORREO
// El cliente manda expedientes e insumos como enlace. Cada enlace es un pendiente del correo hasta
// que su documento esté en el expediente (descargado por la app o subido a mano) o se descarte:
// un correo con enlaces pendientes no cuenta como atendido.
// =====================================
@Table({ tableName: 'enlaces_correo' })
export class EnlaceCorreo extends Model {
  @ForeignKey(() => Correo)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  declare correoId: number

  @BelongsTo(() => Correo, { onDelete: 'CASCADE' })
  declare correo?: Correo

  @AllowNull(false)
  @Column(DataType.TEXT)
  declare url: string

  @Index
  @Default('PENDIENTE')
  @Column(DataType.STRING(12))
  declare estado: 'PENDIENTE' | 'DESCARGADO' | 'DESCARTADO'

  // Cuántos archivos quedaron en el expediente (un enlace a una carpeta trae varios)
  @Default(0)
  @Column(DataType.INTEGER)
  declare archivos: number

  // Último intento fallido: por qué (pide iniciar sesión, venció, carpeta…)
  @Column(DataType.TEXT)
  declare error: string | null

  @Column(DataType.DATE)
  declare intentadoEn: Date | null

  @Column(DataType.INTEGER)
  declare usuarioId: number | null
}

// Documentos del expediente (adjuntos de correos, escritos, anexos, insumos), guardados en SharePoint
@Table({ tableName: 'archivos' })
export class Archivo extends Model {
  @AllowNull(false)
  @Column(DataType.STRING(255))
  declare nombre: string

  @Column(DataType.STRING(120))
  declare tipoMime: string | null

  @Column(DataType.INTEGER)
  declare tamano: number | null

  // CORREO: adjunto de un correo que llegó. ESCRITO y ANEXO: del paquete que se entrega.
  // INSUMO: lo que mandó el cliente. RESPUESTA: lo que adjuntó la entidad al acusar, aprobar o
  // devolver una entrega. SOPORTE: otro documento del expediente
  @Default('CORREO')
  @Column(DataType.STRING(10))
  declare tipo: 'CORREO' | 'ESCRITO' | 'ANEXO' | 'INSUMO' | 'SOPORTE' | 'RESPUESTA'

  // SHAREPOINT o LOCAL (desarrollo sin SharePoint). null = no se pudo guardar: queda el registro
  @Column(DataType.STRING(10))
  declare proveedor: 'SHAREPOINT' | 'LOCAL' | null

  // Ruta dentro de la biblioteca (Casos/GPA-2026-00001 .../Contestación/Escritos/V1/escrito.docx)
  @Column(DataType.STRING(800))
  declare ruta: string | null

  // Id del archivo en SharePoint (sobrevive a que lo muevan o renombren) y su dirección para
  // abrirlo en Word o el visor de SharePoint
  @Column(DataType.STRING(100))
  declare itemId: string | null

  @Column(DataType.STRING(1000))
  declare webUrl: string | null

  // Adjunto de un correo: su id en el buzón. Con la copia ya verificada en SharePoint, la limpieza
  // lo quita del buzón (el correo queda) para no llenar los 50 GB
  @Column(DataType.STRING(300))
  declare adjuntoGraphId: string | null

  @Column(DataType.DATE)
  declare retiradoDelBuzon: Date | null

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
