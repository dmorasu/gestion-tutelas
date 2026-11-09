import 'dotenv/config'
import { db } from '../config/db'
import { Usuario, Rol } from '../models'
import { sembrarBase } from '../seeds/semillaBase'
import { generarContrasenaTemporal } from '../utils/politicaContrasena'
import { cifrarContrasena } from '../utils/contrasenas'

// =====================================
// PRIMER ADMINISTRADOR (no hay registro público)
// npm run crear-admin -- correo@gomezpinedaabogados.com "Nombre Apellido"
// Imprime una contraseña temporal; al entrar, la app pide cambiarla.
// Si el correo ya existe, le da el perfil de Administrador y una temporal nueva.
// =====================================

const [correoArg, ...nombre] = process.argv.slice(2)

const crear = async () => {
  const correo = String(correoArg ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(correo)) throw new Error('Uso: npm run crear-admin -- correo@dominio "Nombre"')
  await db.authenticate()
  await db.sync()
  await sembrarBase()

  const temporal = generarContrasenaTemporal()
  const contrasena = await cifrarContrasena(temporal)
  const [usuario, creado] = await Usuario.findOrCreate({
    where: { correo },
    defaults: { correo, nombre: nombre.join(' ') || correo.split('@')[0], contrasena, debeCambiarContrasena: true }
  })
  if (!creado) await usuario.update({ contrasena, debeCambiarContrasena: true, activo: true, versionSesion: usuario.versionSesion + 1 })
  const admin = await Rol.findOne({ where: { codigo: 'ADMIN' } })
  if (admin) await usuario.$add('roles', admin)

  console.log(`\n${creado ? 'Administrador creado' : 'Administrador actualizado'}: ${correo}`)
  console.log(`Contraseña temporal: ${temporal}\n(Se pide cambiarla al entrar)\n`)
}

crear()
  .catch(error => { console.error(error.message ?? error); process.exitCode = 1 })
  .finally(() => db.close())
