import { Op } from 'sequelize'
import { Archivo, Correo } from '../../models'
import { graph, rutaBuzon, ErrorGraph } from './graph'
import { existeEnSharepoint } from '../almacenamiento'
import { parametro } from '../parametros'
import type { Buzon } from '../constantes'

// =====================================
// LIMPIEZA DE ADJUNTOS DE LOS BUZONES
// Un buzón compartido sin licencia tiene 50 GB y lo que más pesa son los adjuntos que manda el
// cliente (expedientes, PDF escaneados). Como el expediente vive en SharePoint, pasados
// DIAS_RETENER_ADJUNTOS_BUZON días se quita el adjunto del correo en el buzón: el correo (texto,
// fecha, hilo) se queda, y el documento se sigue viendo en la app y en SharePoint.
// Solo se quita si la copia de SharePoint existe y tiene el mismo tamaño: nunca se borra la única copia.
// Ojo: si la firma tiene una retención o retención por litigio sobre los buzones, Exchange guarda
// lo borrado en "Elementos recuperables" (cuota aparte de 30 GB) y no libera espacio.
// =====================================

export const limpiarAdjuntos = async (limite = 500) => {
  if (!parametro<boolean>('LIMPIAR_ADJUNTOS_BUZON')) return { revisados: 0, retirados: 0, omitidos: 0 }
  const antes = new Date(Date.now() - parametro<number>('DIAS_RETENER_ADJUNTOS_BUZON') * 24 * 60 * 60 * 1000)
  const archivos = await Archivo.findAll({
    where: { proveedor: 'SHAREPOINT', itemId: { [Op.ne]: null }, adjuntoGraphId: { [Op.ne]: null }, retiradoDelBuzon: null },
    include: [{ model: Correo, required: true, attributes: ['graphId', 'buzon'], where: { direccion: 'ENTRANTE', fechaCorreo: { [Op.lt]: antes }, graphId: { [Op.ne]: null } } }],
    limit: limite
  })
  let retirados = 0
  let omitidos = 0
  for (const archivo of archivos) {
    const correo = archivo.correo!
    try {
      if (!(await existeEnSharepoint(archivo.itemId!, archivo.tamano))) { omitidos++; continue }
      await graph(`${rutaBuzon(correo.buzon as Buzon)}/messages/${correo.graphId}/attachments/${archivo.adjuntoGraphId}`, { metodo: 'DELETE' })
      await archivo.update({ retiradoDelBuzon: new Date() })
      retirados++
    } catch (error) {
      // Ya no está en el buzón (alguien borró el correo o el adjunto): no hay nada que quitar
      if (error instanceof ErrorGraph && error.status === 404) await archivo.update({ retiradoDelBuzon: new Date() })
      else { omitidos++; console.error('❌ Limpieza del adjunto', archivo.id, error) }
    }
  }
  return { revisados: archivos.length, retirados, omitidos }
}
