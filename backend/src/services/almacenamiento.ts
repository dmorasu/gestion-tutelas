import { BlobServiceClient, type ContainerClient } from '@azure/storage-blob'

// =====================================
// ARCHIVOS EN AZURE BLOB (contenedor propio, no el File Share de Nodex)
// Sin AZURE_STORAGE_CONNECTION_STRING (desarrollo) no se sube nada: el registro del archivo
// queda con rutaBlob null y el resto del flujo sigue.
// =====================================

let contenedor: ContainerClient | null = null

const obtenerContenedor = async () => {
  const conexion = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!conexion) return null
  if (!contenedor) {
    contenedor = BlobServiceClient.fromConnectionString(conexion).getContainerClient(process.env.AZURE_BLOB_CONTAINER || 'tutelas')
    await contenedor.createIfNotExists()
  }
  return contenedor
}

const limpiarNombre = (nombre: string) => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-150)

// Ej: correos/2026/11/123/oficio.pdf
export const subirArchivo = async (carpeta: string, nombre: string, contenido: Buffer, tipoMime?: string | null) => {
  const c = await obtenerContenedor()
  if (!c) return null
  const ruta = `${carpeta}/${Date.now()}_${limpiarNombre(nombre)}`
  await c.getBlockBlobClient(ruta).uploadData(contenido, { blobHTTPHeaders: { blobContentType: tipoMime || 'application/octet-stream' } })
  return ruta
}

export const descargarArchivo = async (ruta: string) => {
  const c = await obtenerContenedor()
  if (!c) return null
  const respuesta = await c.getBlobClient(ruta).download()
  return respuesta.readableStreamBody ?? null
}
