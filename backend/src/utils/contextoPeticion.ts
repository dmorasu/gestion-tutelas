import { AsyncLocalStorage } from 'async_hooks'

// =====================================
// QUIÉN HACE LA PETICIÓN, DISPONIBLE EN CUALQUIER PUNTO DEL CÓDIGO (copiado de Nodex)
// Los hooks de los modelos (historial del caso) no reciben `req`. La autenticación deja aquí
// al usuario y todo lo que corra dentro de esa petición lo puede leer.
// =====================================

// WEB = pantalla; MASIVO = cargue de Excel; BUZON = lector del correo; SISTEMA = tareas y scripts
export type OrigenCambio = 'WEB' | 'MASIVO' | 'BUZON' | 'SISTEMA'

export type ContextoPeticion = {
  usuarioId: number | null
  nombre: string
  origen: OrigenCambio
}

const almacen = new AsyncLocalStorage<ContextoPeticion>()

export const ejecutarConContexto = <T>(contexto: ContextoPeticion, fn: () => T) => almacen.run(contexto, fn)

export const contextoActual = (): ContextoPeticion =>
  almacen.getStore() ?? { usuarioId: null, nombre: 'Sistema', origen: 'SISTEMA' }

export const origenDeRuta = (url: string): OrigenCambio => (url.includes('/cargue') ? 'MASIVO' : 'WEB')
