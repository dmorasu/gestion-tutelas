import { Table, Column, Model, DataType, Default, Unique, AllowNull } from 'sequelize-typescript'

// Juzgados. Los correos de los remitentes sirven para precargar el juzgado del caso nuevo
@Table({ tableName: 'juzgados' })
export class Juzgado extends Model {
  @AllowNull(false)
  @Column(DataType.STRING(200))
  declare nombre: string

  @Column(DataType.STRING(100))
  declare ciudad: string | null

  // Los 12 primeros dígitos del radicado identifican el despacho (ciudad, entidad, especialidad, número)
  @Unique
  @Column(DataType.STRING(12))
  declare codigoDespacho: string | null

  // Correos desde los que escribe (en minúsculas)
  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  declare correos: string[]

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean
}

// Catálogo de motivos de devolución de fondo, ligado a los lineamientos de la entidad (D19)
@Table({ tableName: 'motivos_devolucion' })
export class MotivoDevolucion extends Model {
  @AllowNull(false)
  @Column(DataType.STRING(200))
  declare nombre: string

  @Default('FONDO')
  @Column(DataType.STRING(15))
  declare tipo: 'FONDO' | 'SOPORTE' | 'CRITERIO' | 'ESTILO'

  // Lineamiento de la entidad del que sale (documento y numeral)
  @Column(DataType.STRING(200))
  declare lineamiento: string | null

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean
}

// Días no hábiles además de fines de semana y festivos (D3). etapas vacío = todas
@Table({ tableName: 'dias_no_habiles' })
export class DiaNoHabil extends Model {
  @Unique
  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare fecha: string

  @Column(DataType.STRING(150))
  declare descripcion: string | null

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  declare etapas: string[]
}

// Supuestos de las dudas pendientes y reglas configurables (Docs/PLAN.md §5)
@Table({ tableName: 'parametros' })
export class Parametro extends Model {
  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(60))
  declare clave: string

  @Column(DataType.JSONB)
  declare valor: unknown

  @Column(DataType.TEXT)
  declare descripcion: string | null

  // Duda del cuestionario de la que depende (D1, D6...)
  @Column(DataType.STRING(10))
  declare duda: string | null

  // false = sigue siendo un supuesto; true = confirmado por el abogado o el contrato
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare confirmado: boolean
}

// Radicados que el archivo maestro de la entidad asigna a otros operadores (ANS-13, meta 0)
@Table({ tableName: 'radicados_otros_operadores' })
export class RadicadoOtroOperador extends Model {
  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(23))
  declare radicado: string

  @Column(DataType.STRING(150))
  declare operador: string | null

  // Nombre o fecha del archivo maestro del que salió
  @Column(DataType.STRING(150))
  declare archivoMaestro: string | null
}

// Punto de avance de la lectura del buzón (deltaLink de Microsoft Graph)
@Table({ tableName: 'sincronizacion_buzon' })
export class SincronizacionBuzon extends Model {
  @Unique
  @Column(DataType.STRING(150))
  declare buzon: string

  @Column(DataType.TEXT)
  declare deltaLink: string | null

  @Column(DataType.DATE)
  declare ultimaEjecucion: Date | null

  @Column(DataType.TEXT)
  declare ultimoError: string | null

  @Default(0)
  @Column(DataType.INTEGER)
  declare correosLeidos: number

  // Tamaño del buzón (todas sus carpetas) en la última lectura: el compartido sin licencia tiene 50 GB
  @Column(DataType.BIGINT)
  declare tamanoBytes: string | null

  @Column(DataType.DATE)
  declare tamanoMedidoEn: Date | null
}

// Plantillas de los correos de salida. Texto con marcadores {{radicado}}, {{numeroInterno}}...
// El cliente aún no envía las suyas: se editan en la app sin tocar el código
@Table({ tableName: 'plantillas_correo' })
export class PlantillaCorreo extends Model {
  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(40))
  declare codigo: string

  @AllowNull(false)
  @Column(DataType.STRING(500))
  declare asunto: string

  // Encabezado grande del correo. null = el de constantes (PLANTILLAS)
  @Column(DataType.STRING(200))
  declare titulo: string | null

  // HTML sencillo: párrafos y saltos de línea
  @AllowNull(false)
  @Column(DataType.TEXT)
  declare cuerpo: string

  // false = borrador de la firma; true = la plantilla definitiva del cliente
  @Default(false)
  @Column(DataType.BOOLEAN)
  declare confirmada: boolean
}
