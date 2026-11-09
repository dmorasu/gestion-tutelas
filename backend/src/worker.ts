import 'dotenv/config'
import colors from 'colors'
import { Worker } from 'bullmq'
import { db } from './config/db'
import { conexionRedis } from './config/redis'
import { colaBuzon, NOMBRE_COLA_BUZON } from './queues/buzonQueue'
import { sincronizarBuzon } from './services/buzon/sincronizarBuzon'
import { cargarParametros } from './services/parametros'
import { cargarCalendario } from './services/calendario'
import { activarHistorialCasos } from './services/historialCasos'

// =====================================
// WORKER: proceso aparte de la API (npm run worker). Lee el buzón cada BUZON_INTERVALO_SEGUNDOS.
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

  // concurrency 1: dos lecturas a la vez repetirían el mismo delta
  new Worker(NOMBRE_COLA_BUZON, async () => {
    await Promise.all([cargarParametros(), cargarCalendario()])
    const nuevos = await sincronizarBuzon()
    if (nuevos) console.log(colors.cyan(`📥 ${nuevos} correos nuevos`))
  }, { connection: conexionRedis(), concurrency: 1 })
    .on('failed', (_job, error) => console.error(colors.red('❌ Lectura del buzón:'), error.message))

  console.log(colors.cyan.bold(`Worker del buzón ${process.env.BUZON_CORREO} cada ${segundos} s`))
}

iniciar().catch(error => {
  console.error(colors.red.bold('No arrancó el worker'), error)
  process.exit(1)
})
