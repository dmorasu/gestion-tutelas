import { Usuario, Rol, UsuarioRol, Equipo } from './usuarios'
import { Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon, PlantillaCorreo } from './catalogos'
import { Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision } from './casos'
import { Correo, Archivo, HistorialCaso, EnlaceCorreo } from './correos'
import { Alerta, Informe, AnsPeriodo, Asistencia } from './seguimiento'

export const modelos = [
  Usuario, Rol, UsuarioRol, Equipo,
  Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon, PlantillaCorreo,
  Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision,
  Correo, Archivo, HistorialCaso, EnlaceCorreo,
  Alerta, Informe, AnsPeriodo, Asistencia
]

export {
  Usuario, Rol, UsuarioRol, Equipo,
  Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon, PlantillaCorreo,
  Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision,
  Correo, Archivo, HistorialCaso, EnlaceCorreo,
  Alerta, Informe, AnsPeriodo, Asistencia
}
