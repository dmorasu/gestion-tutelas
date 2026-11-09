import bcrypt from 'bcrypt'

export const cifrarContrasena = (contrasena: string) => bcrypt.hash(contrasena, 10)
export const contrasenaCoincide = (contrasena: string, hash: string) => bcrypt.compare(contrasena, hash)

// Si el correo no existe se compara igual contra este hash: la respuesta tarda lo mismo y no
// delata qué correos están registrados (patrón de Nodex)
let relleno: Promise<string> | null = null
export const hashDeRelleno = () => (relleno ??= cifrarContrasena('relleno-para-igualar-tiempos'))
