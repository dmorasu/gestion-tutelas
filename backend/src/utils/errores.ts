import type { Response } from 'express'

// Error de una regla de negocio: el mensaje se muestra tal cual al usuario (patrón de Nodex)
export class ErrorNegocio extends Error {
  constructor(mensaje: string, public status = 400) {
    super(mensaje)
  }
}

export const responderError = (res: Response, error: unknown) => {
  if (error instanceof ErrorNegocio) return res.status(error.status).json({ error: error.message })
  console.error(error)
  return res.status(500).json({ error: 'Hubo un error, intenta de nuevo' })
}
