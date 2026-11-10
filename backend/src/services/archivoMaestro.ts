import { Op } from 'sequelize'
import { Caso, RadicadoOtroOperador } from '../models'
import { analizarExcel } from './cargueExcel'
import { detectarAlertas } from './alertas'
import { esRadicadoValido, normalizarRadicado } from '../utils/radicado'
import { ErrorNegocio } from '../utils/errores'

// =====================================
// ARCHIVO MAESTRO DE ASIGNACIÓN (manual §19)
// La entidad indica para cada radicado el operador a cargo: la firma, su contratista directo o sus
// equipos internos. Se guardan los radicados de los OTROS operadores: un caso nuestro con uno de esos
// radicados queda marcado, sale la alerta de duplicidad y ANS-13 cuenta cualquier escrito entregado
// sobre él. Cada carga reemplaza la anterior (el archivo maestro vigente es la fuente de control).
// =====================================

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Lo que en la columna de operador significa "es nuestro": no se carga como de otro operador
const ES_NUESTRO = /\bgpa\b|gomez pineda/

export const cargarArchivoMaestro = async (contenido: Buffer, nombreArchivo: string, operadorPorDefecto: string | null) => {
  const { encabezados, filas, mapeo } = await analizarExcel(contenido, nombreArchivo)
  if (mapeo.radicado === null) throw new ErrorNegocio('No se encontró la columna de radicados')
  const colOperador = encabezados.findIndex(h => /operador|contratista|asignad|responsable|firma/.test(plano(h)))
  if (colOperador < 0 && !operadorPorDefecto) throw new ErrorNegocio('No hay columna de operador: indique de qué operador son los radicados')

  const registros = new Map<string, string>()
  let nuestros = 0
  for (const f of filas) {
    const radicado = normalizarRadicado(f[mapeo.radicado] ?? '')
    if (!esRadicadoValido(radicado)) continue
    const operador = (colOperador >= 0 ? f[colOperador]?.trim() : '') || operadorPorDefecto || ''
    if (ES_NUESTRO.test(plano(operador))) { nuestros++; continue }
    registros.set(radicado, operador.slice(0, 150))
  }
  const nombre = `${nombreArchivo} (${new Date().toISOString().slice(0, 10)})`.slice(0, 150)
  await RadicadoOtroOperador.destroy({ where: {} })
  await RadicadoOtroOperador.bulkCreate([...registros].map(([radicado, operador]) => ({ radicado, operador, archivoMaestro: nombre })))

  // Los casos se marcan o desmarcan según el archivo vigente
  const radicados = [...registros.keys()]
  const [marcados] = await Caso.update({ deOtroOperador: true }, { where: { radicado: radicados, deOtroOperador: false }, individualHooks: true })
  await Caso.update({ deOtroOperador: false }, { where: { deOtroOperador: true, radicado: { [Op.notIn]: radicados.length ? radicados : [''] } }, individualHooks: true })
  const alertas = await detectarAlertas()
  return { otrosOperadores: registros.size, nuestros, filas: filas.length, casosMarcados: marcados, alertas }
}
