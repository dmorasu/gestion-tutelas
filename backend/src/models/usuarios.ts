import { Table, Column, Model, DataType, BelongsToMany, ForeignKey, Default, Unique, AllowNull, DefaultScope, Scopes } from 'sequelize-typescript'

// Usuarios de la app. Login propio con correo y contraseña (como Nodex), sin registro público:
// los crea el administrador con una contraseña temporal que se cambia al primer ingreso.
// La contraseña nunca sale en las consultas (defaultScope); para validarla se usa el scope 'conContrasena'
@DefaultScope(() => ({ attributes: { exclude: ['contrasena'] } }))
@Scopes(() => ({ conContrasena: { attributes: { include: ['contrasena'] } } }))
@Table({ tableName: 'usuarios' })
export class Usuario extends Model {
  @AllowNull(false)
  @Column(DataType.STRING(150))
  declare nombre: string

  // Se guarda en minúsculas
  @Unique
  @AllowNull(false)
  @Column(DataType.STRING(150))
  declare correo: string

  // Hash bcrypt
  @AllowNull(false)
  @Column(DataType.STRING(100))
  declare contrasena: string

  // Contraseña temporal (usuario nuevo o restablecida): debe cambiarla antes de trabajar
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare debeCambiarContrasena: boolean

  @Default(true)
  @Column(DataType.BOOLEAN)
  declare activo: boolean

  // Sube al cerrar sesión: los tokens anteriores dejan de servir (patrón de Nodex)
  @Default(1)
  @Column(DataType.INTEGER)
  declare versionSesion: number

  // Capacidad diaria para el reparto (casos nuevos por día). null = sin límite
  @Column(DataType.INTEGER)
  declare capacidadDiaria: number | null

  @Column(DataType.DATE)
  declare ultimoIngreso: Date | null

  @BelongsToMany(() => Rol, () => UsuarioRol)
  declare roles?: Rol[]
}

@Table({ tableName: 'roles', timestamps: false })
export class Rol extends Model {
  @Unique
  @Column(DataType.STRING(30))
  declare codigo: string

  @Column(DataType.STRING(80))
  declare nombre: string

  @BelongsToMany(() => Usuario, () => UsuarioRol)
  declare usuarios?: Usuario[]
}

@Table({ tableName: 'usuario_roles', timestamps: false })
export class UsuarioRol extends Model {
  @ForeignKey(() => Usuario)
  @Column(DataType.INTEGER)
  declare usuarioId: number

  @ForeignKey(() => Rol)
  @Column(DataType.INTEGER)
  declare rolId: number
}
