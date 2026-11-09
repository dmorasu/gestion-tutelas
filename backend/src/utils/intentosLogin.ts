import type { Request } from 'express'

// =====================================
// LÍMITE DE INTENTOS DEL LOGIN (copiado de Nodex)
// Frena a quien prueba contraseñas: por cuenta (5 fallos → 15 min) y por IP (para quien prueba
// muchas cuentas desde el mismo equipo). Vive en memoria: con una sola instancia de la API basta;
// un reinicio solo limpia los contadores.
// =====================================

const VENTANA_MS = 15 * 60 * 1000
const MAXIMO_POR_CUENTA = 5
// Muchos usuarios salen por la IP de la oficina: holgura para que errores normales no bloqueen a todos
const MAXIMO_POR_IP = 30

type Contador = { fallos: number, desde: number, bloqueadoHasta: number, ultimaIp?: string }

const porCuenta = new Map<string, Contador>()
const porIp = new Map<string, Contador>()

// El login llega desde el servidor de Next (127.0.0.1), no del navegador: la IP real viene en
// X-IP-Cliente. Solo se le cree si la petición es local; si no, cualquiera inventaría una IP por intento
const esLocal = (direccion?: string) => !!direccion && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(direccion)

export const ipCliente = (req: Request) => {
  const reenviada = req.get('x-ip-cliente')?.trim()
  return esLocal(req.socket.remoteAddress) && reenviada ? reenviada : (req.socket.remoteAddress ?? 'desconocida')
}

const clave = (correo: string) => String(correo ?? '').trim().toLowerCase()

const minutosRestantes = (contador?: Contador) => {
  if (!contador || contador.bloqueadoHasta <= Date.now()) return 0
  return Math.ceil((contador.bloqueadoHasta - Date.now()) / 60000)
}

// Minutos que faltan para poder intentar de nuevo (0 = puede intentar)
export const minutosBloqueo = (correo: string, ip: string) =>
  Math.max(minutosRestantes(porCuenta.get(clave(correo))), minutosRestantes(porIp.get(ip)))

const sumarFallo = (mapa: Map<string, Contador>, llave: string, maximo: number) => {
  const ahora = Date.now()
  const actual = mapa.get(llave)
  const contador = actual && ahora - actual.desde < VENTANA_MS ? actual : { fallos: 0, desde: ahora, bloqueadoHasta: 0 }
  contador.fallos++
  if (contador.fallos >= maximo) {
    contador.bloqueadoHasta = ahora + VENTANA_MS
    contador.fallos = 0
    contador.desde = ahora
  }
  mapa.set(llave, contador)
}

export const registrarFallo = (correo: string, ip: string) => {
  sumarFallo(porCuenta, clave(correo), MAXIMO_POR_CUENTA)
  sumarFallo(porIp, ip, MAXIMO_POR_IP)
  porCuenta.get(clave(correo))!.ultimaIp = ip
}

// Entró bien: se olvidan los fallos de la cuenta (los de la IP siguen)
export const registrarExito = (correo: string) => {
  porCuenta.delete(clave(correo))
}

export const minutosBloqueoCuenta = (correo: string) => minutosRestantes(porCuenta.get(clave(correo)))

// El administrador desbloquea la cuenta y, si la IP desde la que falló quedó bloqueada, también la libera
export const desbloquearCuenta = (correo: string) => {
  const contador = porCuenta.get(clave(correo))
  porCuenta.delete(clave(correo))
  if (contador?.ultimaIp && minutosRestantes(porIp.get(contador.ultimaIp)) > 0) porIp.delete(contador.ultimaIp)
}

setInterval(() => {
  const ahora = Date.now()
  for (const mapa of [porCuenta, porIp]) {
    for (const [llave, c] of mapa) {
      if (c.bloqueadoHasta < ahora && ahora - c.desde > VENTANA_MS) mapa.delete(llave)
    }
  }
}, VENTANA_MS).unref()
