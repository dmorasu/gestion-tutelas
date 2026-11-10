import 'dotenv/config'
import { db } from '../config/db'
import { sincronizarBuzon } from '../services/buzon/sincronizarBuzon'
import { cargarParametros } from '../services/parametros'
import { cargarCalendario } from '../services/calendario'
import { activarHistorialCasos } from '../services/historialCasos'
import { entraConfigurado } from '../config/entra'
import { buzonesConfigurados } from '../services/buzon/graph'

// =====================================
// LEER LOS BUZONES UNA VEZ (sin Redis ni worker): para la primera prueba con los buzones reales.
//   npm run leer-buzon
// Usa ENTRA_* y BUZON_ASIGNACIONES, BUZON_INSUMOS y BUZON_ENTREGAS del .env. La primera vez toma
// los correos desde BUZON_LEER_DESDE.
// Después, cada corrida trae solo lo nuevo (consulta delta).
// =====================================

const leer = async () => {
  if (!entraConfigurado()) throw new Error('Faltan ENTRA_TENANT_ID, ENTRA_CLIENT_ID o ENTRA_CLIENT_SECRET en backend/.env')
  const buzones = buzonesConfigurados()
  if (!buzones.length) throw new Error('Faltan BUZON_ASIGNACIONES, BUZON_INSUMOS o BUZON_ENTREGAS en backend/.env')
  await db.authenticate()
  activarHistorialCasos()
  await Promise.all([cargarParametros(true), cargarCalendario(true)])
  console.log(`Leyendo ${buzones.map(b => b.direccion).join(', ')}...`)
  const nuevos = await sincronizarBuzon()
  console.log(`Listo: ${nuevos} correo(s) nuevo(s). Revíselos en Correos.`)
}

leer()
  .catch(error => { console.error('No se pudo leer el buzón:', error.message ?? error); process.exitCode = 1 })
  .finally(() => db.close())
