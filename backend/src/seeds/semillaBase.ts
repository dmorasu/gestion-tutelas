import { db } from '../config/db'
import { Op } from 'sequelize'
import { Rol, Equipo, Caso, DiaNoHabil } from '../models'
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

// D3: el 24 y el 31 de diciembre se trabaja medio día (entre los dos restan un día hábil). Se
// siembran el año en curso y el siguiente, que cubren el contrato; no pisan lo que se haya editado
const sembrarMediosDias = async () => {
  const anio = new Date().getFullYear()
  for (const a of [anio, anio + 1]) {
    for (const [dia, nombre] of [['24', 'Nochebuena'], ['31', 'Fin de año']]) {
      const fecha = `${a}-12-${dia}`
      await DiaNoHabil.findOrCreate({ where: { fecha }, defaults: { fecha, descripcion: `${nombre}: medio día`, etapas: [], medioDia: true } })
    }
  }
}

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
  await sembrarMediosDias()
  await sembrarPlantillas()
}
