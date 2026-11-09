import 'dotenv/config'
import IORedis from 'ioredis'

// REDIS_DB distinto al de Nodex: si comparten el servidor de Redis, ninguno toma los trabajos del otro
export const conexionRedis = () => new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  db: Number(process.env.REDIS_DB) || 5,
  maxRetriesPerRequest: null // obligatorio para BullMQ
})
