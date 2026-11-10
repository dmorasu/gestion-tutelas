import { db } from '../config/db'
import { Op } from 'sequelize'
import { Rol, Equipo, Caso } from '../models'
import { NOMBRES_ROLES } from '../services/constantes'
import { sembrarParametros } from '../services/parametros'
import { sembrarPlantillas } from '../services/buzon/correosSalida'
import { SECUENCIA_NUMERO_INTERNO, siguienteNumeroInterno } from '../services/registroCasos'

// Equipos iniciales del correo del cliente (1 revisor por cada 4 auxiliares). Solo si no hay ninguno:
// después se ajustan en la pantalla de Equipos
const EQUIPOS_INICIALES = [
  { nombre: 'Contestaciones 1', etapas: ['ACCION'] },
  { nombre: 'Contestaciones 2', etapas: ['ACCION'] },
  { nombre: 'Impugnaciones y cumplimientos', etapas: ['IMPUGNACION', 'CUMPLIMIENTO'] },
  { nombre: 'Requerimientos y desacatos', etapas: ['REQUERIMIENTO_PREVIO', 'DESACATO'] }
]

// Roles, parámetros, plantillas, equipos y la secuencia del número interno. Idempotente: no pisa
// lo que ya se haya cambiado
export const sembrarBase = async () => {
  // El perfil "Abogado revisor" pasó a llamarse "Revisor" (roles del cliente): se conserva la fila
  // para no perder a quien ya lo tenga
  await Rol.update({ codigo: 'REVISOR', nombre: NOMBRES_ROLES.REVISOR }, { where: { codigo: 'ABOGADO' } })
  for (const [codigo, nombre] of Object.entries(NOMBRES_ROLES)) {
    const [rol] = await Rol.findOrCreate({ where: { codigo }, defaults: { codigo, nombre } })
    if (rol.nombre !== nombre) await rol.update({ nombre })
  }
  if (!(await Equipo.count())) await Equipo.bulkCreate(EQUIPOS_INICIALES)
  await db.query(`CREATE SEQUENCE IF NOT EXISTS ${SECUENCIA_NUMERO_INTERNO} START 1`)
  // Casos creados antes del número interno: se numeran en el orden en que llegaron. Si ninguno
  // tiene número, la secuencia arranca de 1
  const sinNumero = await Caso.findAll({ where: { numeroInterno: null }, attributes: ['id', 'createdAt'], order: [['id', 'ASC']] })
  if (sinNumero.length) {
    if (!(await Caso.count({ where: { numeroInterno: { [Op.ne]: null } } }))) await db.query(`ALTER SEQUENCE ${SECUENCIA_NUMERO_INTERNO} RESTART WITH 1`)
    for (const caso of sinNumero) await caso.update({ numeroInterno: await siguienteNumeroInterno(undefined, caso.createdAt) })
  }
  await sembrarParametros()
  await sembrarPlantillas()
}
