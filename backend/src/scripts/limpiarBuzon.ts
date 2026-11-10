import 'dotenv/config'
import { db } from '../config/db'
import { limpiarAdjuntos } from '../services/buzon/limpiezaBuzon'
import { cargarParametros } from '../services/parametros'
import { entraConfigurado } from '../config/entra'

// =====================================
// LIMPIAR LOS ADJUNTOS DE LOS BUZONES UNA VEZ (lo mismo que hace el worker cada madrugada)
//   npm run limpiar-buzon
// Quita del buzón los adjuntos con más de DIAS_RETENER_ADJUNTOS_BUZON días cuya copia está
// verificada en SharePoint. El correo se conserva.
// =====================================

const main = async () => {
  if (!entraConfigurado()) throw new Error('Faltan ENTRA_TENANT_ID, ENTRA_CLIENT_ID o ENTRA_CLIENT_SECRET en backend/.env')
  await db.authenticate()
  await cargarParametros(true)
  const r = await limpiarAdjuntos(5000)
  console.log(`Revisados ${r.revisados}: ${r.retirados} retirados del buzón, ${r.omitidos} omitidos (sin copia verificada o con error).`)
}

main()
  .catch(error => { console.error('No se pudo limpiar:', error.message ?? error); process.exitCode = 1 })
  .finally(() => db.close())
