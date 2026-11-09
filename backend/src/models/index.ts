import { Usuario, Rol, UsuarioRol } from './usuarios'
import { Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon } from './catalogos'
import { Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision } from './casos'
import { Correo, Archivo, HistorialCaso } from './correos'

export const modelos = [
  Usuario, Rol, UsuarioRol,
  Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon,
  Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision,
  Correo, Archivo, HistorialCaso
]

export {
  Usuario, Rol, UsuarioRol,
  Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon,
  Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision,
  Correo, Archivo, HistorialCaso
}
