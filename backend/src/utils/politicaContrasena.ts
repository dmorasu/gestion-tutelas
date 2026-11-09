import { randomInt } from 'crypto'
import { body } from 'express-validator'

// =====================================
// POLÍTICA DE CONTRASEÑAS (la misma de Nodex)
// El frontend muestra las mismas reglas mientras se escribe (frontend/src/auth/politicaContrasena.ts)
// =====================================

export const MINIMO_CONTRASENA = 8
export const MAXIMO_CONTRASENA = 100

const REGLAS: { cumple: (c: string) => boolean, texto: string }[] = [
  { cumple: c => c.length >= MINIMO_CONTRASENA, texto: `mínimo ${MINIMO_CONTRASENA} caracteres` },
  { cumple: c => /[A-ZÁÉÍÓÚÑ]/.test(c), texto: 'una mayúscula' },
  { cumple: c => /[a-záéíóúñ]/.test(c), texto: 'una minúscula' },
  { cumple: c => /\d/.test(c), texto: 'un número' },
  { cumple: c => /[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s]/.test(c), texto: 'un carácter especial (ej: ! @ # $ % * . -)' }
]

// Lo que le falta a la contraseña (vacío = cumple)
export const faltantesContrasena = (contrasena: string) => {
  const faltan = REGLAS.filter(r => !r.cumple(contrasena)).map(r => r.texto)
  if (contrasena !== contrasena.trim()) faltan.push('sin espacios al inicio ni al final')
  if (contrasena.length > MAXIMO_CONTRASENA) faltan.push(`máximo ${MAXIMO_CONTRASENA} caracteres`)
  return faltan
}

export const contrasenaSegura = (campo = 'contrasena', etiqueta = 'La contraseña') =>
  body(campo)
    .isString().withMessage(`${etiqueta} no es válida`)
    .bail()
    .custom((valor: string) => {
      const faltan = faltantesContrasena(valor)
      if (faltan.length) throw new Error(`${etiqueta} debe tener: ${faltan.join(', ')}`)
      return true
    })

// Contraseña temporal que cumple la política (al dictarla no se confunden 0/O ni 1/l/I)
const MAYUSCULAS = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const MINUSCULAS = 'abcdefghjkmnpqrstuvwxyz'
const NUMEROS = '23456789'
const ESPECIALES = '@#$%*+-'

export const generarContrasenaTemporal = (largo = 10) => {
  const elegir = (grupo: string) => grupo[randomInt(grupo.length)]
  const todos = MAYUSCULAS + MINUSCULAS + NUMEROS
  const caracteres = [elegir(MAYUSCULAS), elegir(MINUSCULAS), elegir(NUMEROS), elegir(ESPECIALES)]
  while (caracteres.length < largo) caracteres.push(elegir(todos))
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]]
  }
  return caracteres.join('')
}
