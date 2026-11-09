import express from 'express'
import colors from 'colors'
import morgan from 'morgan'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { db } from './config/db'
import { autenticacion } from './middleware/auth'
import { activarHistorialCasos } from './services/historialCasos'
import { cargarParametros } from './services/parametros'
import { cargarCalendario } from './services/calendario'
import { sembrarBase } from './seeds/semillaBase'
import authRouter from './routes/authRouter'
import correosRouter from './routes/correosRouter'
import casosRouter from './routes/casosRouter'
import catalogosRouter from './routes/catalogosRouter'
import archivosRouter from './routes/archivosRouter'

// Bitácora de cambios de los casos (hooks de los modelos): antes de atender peticiones
activarHistorialCasos()

export async function conectarBase() {
  try {
    await db.authenticate()
    // sync() crea tablas y columnas nuevas; los cambios de tipo irán como ALTER idempotentes (patrón Nodex)
    await db.sync({ alter: process.env.NODE_ENV !== 'production' })
    await sembrarBase()
    await cargarCalendario(true)
    console.log(colors.blue.bold('Conexión exitosa a la base de tutelas'))
  } catch (error) {
    console.log(colors.red.bold('Falló la conexión a la base de datos'))
    console.error(error)
  }
}

const app = express()
app.disable('x-powered-by')
app.use(morgan('dev'))

const origenes = [process.env.URL_FRONTEND, 'http://localhost:3100'].filter(Boolean)
app.use(cors({ origin: (origen, cb) => (!origen || origenes.includes(origen) ? cb(null, true) : cb(new Error('Not allowed by CORS'))), credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(cookieParser())

// Parámetros y calendario al día en cada petición (se releen como máximo cada minuto)
app.use(async (_req, _res, next) => {
  try {
    await Promise.all([cargarParametros(), cargarCalendario()])
  } catch (error) {
    console.error('No se pudieron recargar parámetros o calendario', error)
  }
  next()
})

app.get('/api/salud', (_req, res) => { res.json({ ok: true }) })
app.use('/api/auth', authRouter)
app.use('/api/correos', autenticacion, correosRouter)
app.use('/api/casos', autenticacion, casosRouter)
app.use('/api/catalogos', autenticacion, catalogosRouter)
app.use('/api/archivos', autenticacion, archivosRouter)

export default app
