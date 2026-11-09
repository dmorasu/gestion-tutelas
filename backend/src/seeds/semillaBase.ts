import { Rol } from '../models'
import { NOMBRES_ROLES } from '../services/constantes'
import { sembrarParametros } from '../services/parametros'

// Roles y parámetros. Idempotente: no pisa lo que ya se haya cambiado
export const sembrarBase = async () => {
  for (const [codigo, nombre] of Object.entries(NOMBRES_ROLES)) {
    await Rol.findOrCreate({ where: { codigo }, defaults: { codigo, nombre } })
  }
  await sembrarParametros()
}
