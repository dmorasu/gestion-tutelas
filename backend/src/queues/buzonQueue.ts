import { Queue } from 'bullmq'
import { conexionRedis } from '../config/redis'

export const NOMBRE_COLA_BUZON = 'tutelas-buzon'

let cola: Queue | null = null
export const colaBuzon = () => (cola ??= new Queue(NOMBRE_COLA_BUZON, { connection: conexionRedis() }))

// Lectura inmediata (botón "Leer buzón ahora"). Con jobId fijo no se apilan lecturas repetidas
export const encolarLecturaBuzon = () =>
  colaBuzon().add('leer', {}, { jobId: `manual-${Math.floor(Date.now() / 30_000)}`, removeOnComplete: true, removeOnFail: 100 })
