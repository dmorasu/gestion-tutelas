import { Usuario, Rol, UsuarioRol, Equipo } from './usuarios'
import { Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon, PlantillaCorreo, ItemCatalogo } from './catalogos'
import { Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision, CasoRelacion } from './casos'
import { Correo, Archivo, HistorialCaso, EnlaceCorreo, NotaCaso } from './correos'
import { Alerta, CorteAlertas, Informe, AnsPeriodo, Asistencia, TramoActuacion } from './seguimiento'

export const modelos = [
  Usuario, Rol, UsuarioRol, Equipo,
  Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon, PlantillaCorreo, ItemCatalogo,
  Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision, CasoRelacion,
  Correo, Archivo, HistorialCaso, EnlaceCorreo, NotaCaso,
  Alerta, CorteAlertas, Informe, AnsPeriodo, Asistencia, TramoActuacion
]

export {
  Usuario, Rol, UsuarioRol, Equipo,
  Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon, PlantillaCorreo, ItemCatalogo,
  Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision, CasoRelacion,
  Correo, Archivo, HistorialCaso, EnlaceCorreo, NotaCaso,
  Alerta, CorteAlertas, Informe, AnsPeriodo, Asistencia, TramoActuacion
}
