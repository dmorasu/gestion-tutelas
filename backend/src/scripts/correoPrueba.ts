import 'dotenv/config'
import { db } from '../config/db'
import { Correo } from '../models'
import { asociarCorreo } from '../services/buzon/sincronizarBuzon'
import { ETAPAS_DE_ALIAS, NOMBRES_ETAPAS } from '../services/constantes'
import { formatoRadicado } from '../utils/radicado'

// =====================================
// CORREO DE PRUEBA: simula una asignación que llegó al buzón, para probar la bandeja
// "Correos por registrar", el registro, el reparto y el semáforo sin tener el buzón configurado.
//   npm run correo-prueba                      → acción con radicado al azar
//   npm run correo-prueba -- IMPUGNACION       → otra etapa (ACCION, IMPUGNACION, CUMPLIMIENTO)
//   npm run correo-prueba -- ACCION 11001310300120260012300   → radicado fijo (para probar
//                                                 que un segundo correo se asocia al mismo caso)
// Quedan marcados con remitente "prueba@nodex.local" para reconocerlos y borrarlos después.
// =====================================

const [etapaArg = 'ACCION', radicadoArg] = process.argv.slice(2)

const radicadoAlAzar = () => {
  const n = (largo: number) => Array.from({ length: largo }, () => Math.floor(Math.random() * 10)).join('')
  // Bogotá (11001), juzgado (31), civil (03), despacho, año, consecutivo, 00
  return `1100131030${n(2)}2026${n(5)}00`
}

const crear = async () => {
  const etapa = ETAPAS_DE_ALIAS[etapaArg.toUpperCase()]
  if (!etapa) throw new Error('Etapa no válida: use ACCION, IMPUGNACION o CUMPLIMIENTO')
  const radicado = radicadoArg?.replace(/\D/g, '') || radicadoAlAzar()
  if (radicado.length !== 23) throw new Error('El radicado debe tener 23 dígitos')

  await db.authenticate()
  const asunto = etapa === 'IMPUGNACION'
    ? `Solicitud de impugnación fallo de tutela Rad. ${formatoRadicado(radicado)}`
    : etapa === 'CUMPLIMIENTO'
      ? `Requerimiento cumplimiento fallo de tutela ${formatoRadicado(radicado)}`
      : `Notificación auto admisorio acción de tutela No. ${formatoRadicado(radicado)}`
  const correo = await Correo.create({
    direccion: 'ENTRANTE',
    etapaDetectada: etapa,
    fuenteEtapa: 'ALIAS',
    remitente: 'prueba@nodex.local',
    nombreRemitente: 'Correo de prueba',
    para: [`tutelas.${etapa.toLowerCase()}@prueba.local`],
    cc: [],
    asunto,
    cuerpoTexto: [
      'Buenos días,',
      '',
      `Se asigna para su gestión el proceso radicado ${formatoRadicado(radicado)}, ${NOMBRES_ETAPAS[etapa].toLowerCase()}.`,
      'Accionante: JUAN PÉREZ GÓMEZ, C.C. 79.123.456.',
      'Término otorgado por el despacho: dos (2) días hábiles contados desde la notificación.',
      '',
      'Cordialmente,',
      'Correo de prueba generado por Nodex Tutelas'
    ].join('\n'),
    fechaCorreo: new Date(),
    radicados: [radicado],
    estado: 'POR_REGISTRAR'
  })
  // Igual que el lector del buzón: si el radicado ya es un caso con esa etapa abierta, se asocia solo
  await asociarCorreo(correo)
  await correo.reload()
  console.log(`\nCorreo de prueba #${correo.id} (${NOMBRES_ETAPAS[etapa]}) · radicado ${formatoRadicado(radicado)}`)
  console.log(correo.estado === 'ASOCIADO' ? 'Se asoció solo a la actuación abierta del caso.' : 'Quedó en "Correos por registrar".\n')
}

crear()
  .catch(error => { console.error(error.message ?? error); process.exitCode = 1 })
  .finally(() => db.close())
