import 'dotenv/config'
import colors from 'colors'
import { Worker } from 'bullmq'
import { db } from './config/db'
import { conexionRedis } from './config/redis'
import { colaBuzon, NOMBRE_COLA_BUZON } from './queues/buzonQueue'
import { sincronizarBuzon } from './services/buzon/sincronizarBuzon'
import { limpiarAdjuntos } from './services/buzon/limpiezaBuzon'
import { cargarParametros } from './services/parametros'
import { cargarCalendario } from './services/calendario'
import { activarHistorialCasos } from './services/historialCasos'
import { buzonesConfigurados } from './services/buzon/graph'

// =====================================
// WORKER: proceso aparte de la API (npm run worker). Lee los buzones cada BUZON_INTERVALO_SEGUNDOS.
// Separado para que una caída de Graph o un PDF pesado no frene la API.
// =====================================

const iniciar = async () => {
  if (process.env.BUZON_ACTIVO !== 'true') {
    console.log(colors.yellow('BUZON_ACTIVO no es true: el worker no lee el buzón'))
    return
  }
  await db.authenticate()
  activarHistorialCasos()

  const segundos = Math.max(60, Number(process.env.BUZON_INTERVALO_SEGUNDOS) || 120)
  // Una sola programación repetida (si ya existe, se actualiza)
  await colaBuzon().upsertJobScheduler('buzon-periodico', { every: segundos * 1000 }, { name: 'leer', opts: { removeOnComplete: true, removeOnFail: 100 } })
  // Una vez al día, de madrugada (2:00 de Bogotá), se quitan del buzón los adjuntos ya guardados en SharePoint
  await colaBuzon().upsertJobScheduler('limpieza-adjuntos', { pattern: '0 2 * * *', tz: 'America/Bogota' }, { name: 'limpiar', opts: { removeOnComplete: true, removeOnFail: 20 } })

  // concurrency 1: dos lecturas a la vez repetirían el mismo delta
  new Worker(NOMBRE_COLA_BUZON, async trabajo => {
    await Promise.all([cargarParametros(), cargarCalendario()])
    if (trabajo.name === 'limpiar') {
      const r = await limpiarAdjuntos()
      if (r.retirados || r.omitidos) console.log(colors.cyan(`🧹 Adjuntos: ${r.retirados} retirados del buzón, ${r.omitidos} omitidos`))
      return
    }
    const nuevos = await sincronizarBuzon()
    if (nuevos) console.log(colors.cyan(`📥 ${nuevos} correos nuevos`))
  }, { connection: conexionRedis(), concurrency: 1 })
    .on('failed', (_job, error) => console.error(colors.red('❌ Lectura del buzón:'), error.message))

  console.log(colors.cyan.bold(`Worker de los buzones ${buzonesConfigurados().map(b => b.direccion).join(', ')} cada ${segundos} s`))
}

iniciar().catch(error => {
  console.error(colors.red.bold('No arrancó el worker'), error)
  process.exit(1)
})
