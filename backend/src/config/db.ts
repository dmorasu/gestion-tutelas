import 'reflect-metadata'
import 'dotenv/config'
import { Sequelize } from 'sequelize-typescript'
import { modelos } from '../models'

// Mismo motor Postgres de Nodex, pero base propia (DB_NAME=gpa_legal): nada se comparte
export const db = new Sequelize({
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  dialect: 'postgres',
  // Lista explícita: varios modelos no se llaman como su archivo
  models: modelos,
  logging: false,
  // Las fechas con hora se guardan en UTC; la zona de Colombia se aplica al calcular y mostrar
  timezone: '+00:00',
  // El motor de Postgres es el de Nodex (máximo 100 conexiones, Nodex llega a ~34): la API y el
  // worker juntos no pasan de 10
  pool: { max: Number(process.env.DB_POOL_MAX) || 5, min: 0, idle: 10_000 }
})
