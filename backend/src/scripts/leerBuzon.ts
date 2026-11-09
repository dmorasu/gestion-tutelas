import 'dotenv/config'
import { db } from '../config/db'
import { sincronizarBuzon } from '../services/buzon/sincronizarBuzon'
import { cargarParametros } from '../services/parametros'
import { cargarCalendario } from '../services/calendario'
import { activarHistorialCasos } from '../services/historialCasos'
import { entraConfigurado } from '../config/entra'

// =====================================
// LEER EL BUZÓN UNA VEZ (sin Redis ni worker): para la primera prueba con el buzón real.
//   npm run leer-buzon
// Usa ENTRA_* y BUZON_CORREO del .env. La primera vez toma los correos desde BUZON_LEER_DESDE.
// Después, cada corrida trae solo lo nuevo (consulta delta).
// =====================================

const leer = async () => {
  if (!entraConfigurado()) throw new Error('Faltan ENTRA_TENANT_ID, ENTRA_CLIENT_ID o ENTRA_CLIENT_SECRET en backend/.env')
  if (!process.env.BUZON_CORREO) throw new Error('Falta BUZON_CORREO en backend/.env')
  await db.authenticate()
  activarHistorialCasos()
  await Promise.all([cargarParametros(true), cargarCalendario(true)])
  console.log(`Leyendo ${process.env.BUZON_CORREO}...`)
  const nuevos = await sincronizarBuzon()
  console.log(`Listo: ${nuevos} correo(s) nuevo(s). Revíselos en "Correos por registrar".`)
}

leer()
  .catch(error => { console.error('No se pudo leer el buzón:', error.message ?? error); process.exitCode = 1 })
  .finally(() => db.close())
