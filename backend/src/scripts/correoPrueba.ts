import 'dotenv/config'
import { db } from '../config/db'
import { Correo } from '../models'
import { asociarCorreo } from '../services/buzon/sincronizarBuzon'
import { cargarParametros, parametro } from '../services/parametros'
import { ETAPAS, ETAPA_EN_ASUNTO, NOMBRES_ETAPAS, type Etapa } from '../services/constantes'
import { leerAsunto } from '../utils/asunto'
import { formatoRadicado } from '../utils/radicado'
import { textoFechaHora } from '../utils/fechaColombia'

// =====================================
// CORREO DE PRUEBA: simula una asignación que llegó al buzón de asignaciones, con el asunto
// normalizado del cliente, para probar la bandeja, el registro, el reparto por equipo, el acuse y
// el semáforo sin tener 365 configurado.
//   npm run correo-prueba                                  → contestación, ordinario, vence en 5 días
//   npm run correo-prueba -- DESACATO                      → otra etapa (ACCION, IMPUGNACION, CUMPLIMIENTO,
//                                                            REQUERIMIENTO_PREVIO, DESACATO)
//   npm run correo-prueba -- ACCION 11001310300120260012300 → radicado fijo (un segundo correo se
//                                                            asocia al mismo caso)
//   npm run correo-prueba -- ACCION - 20                   → vence en 20 horas (sale crítico)
// Quedan con remitente "prueba@nodex.local" para reconocerlos y borrarlos después.
// =====================================

const [etapaArg = 'ACCION', radicadoArg, horasArg] = process.argv.slice(2)

const radicadoAlAzar = () => {
  const n = (largo: number) => Array.from({ length: largo }, () => Math.floor(Math.random() * 10)).join('')
  // Cali (76001), juzgado (31), civil (03), despacho, año, consecutivo, 00
  return `7600131030${n(2)}2026${n(5)}00`
}

const crear = async () => {
  const etapa = etapaArg.toUpperCase() as Etapa
  if (!(ETAPAS as readonly string[]).includes(etapa)) throw new Error(`Etapa no válida: use ${ETAPAS.join(', ')}`)
  const radicado = radicadoArg && radicadoArg !== '-' ? radicadoArg.replace(/\D/g, '') : radicadoAlAzar()
  if (radicado.length !== 23) throw new Error('El radicado debe tener 23 dígitos')

  await db.authenticate()
  await cargarParametros(true)
  const horas = Number(horasArg) || 5 * 24
  const vence = new Date(Date.now() + horas * 60 * 60 * 1000)
  const criticidad = horas < 24 ? 'CRÍTICO' : horas < 48 ? 'ALTO' : 'ORDINARIO'
  const asunto = `[${parametro<string>('PREFIJO_ASUNTO')}] [${criticidad}] [${radicado}] [${ETAPA_EN_ASUNTO[etapa]}] [Vence: ${textoFechaHora(vence)}]`
  const leido = leerAsunto(asunto, parametro<string>('HORA_VENCIMIENTO_TERMINO'))

  const correo = await Correo.create({
    direccion: 'ENTRANTE',
    buzon: 'ASIGNACIONES',
    etapaDetectada: leido.etapa,
    fuenteEtapa: leido.etapa ? 'ASUNTO' : null,
    criticidadDetectada: leido.criticidad,
    vencimientoDetectado: leido.vence,
    remitente: 'prueba@nodex.local',
    nombreRemitente: 'Correo de prueba',
    para: [process.env.BUZON_ASIGNACIONES || 'asignaciones@prueba.local'],
    cc: [],
    asunto,
    cuerpoTexto: [
      'Buenos días,',
      '',
      `Se asigna para su gestión el proceso radicado ${formatoRadicado(radicado)}, ${NOMBRES_ETAPAS[etapa].toLowerCase()}.`,
      'Accionante: JUAN PÉREZ GÓMEZ, C.C. 79.123.456.',
      'Documentos: https://ejemplo.sharepoint.com/sites/prueba/expediente',
      '',
      'Cordialmente,',
      'Correo de prueba generado por Nodex Tutelas'
    ].join('\n'),
    enlaces: ['https://ejemplo.sharepoint.com/sites/prueba/expediente'],
    fechaCorreo: new Date(),
    radicados: [radicado],
    estado: 'POR_REGISTRAR'
  })
  // Igual que el lector del buzón: si el radicado ya es un caso con esa etapa abierta, se asocia solo
  await asociarCorreo(correo)
  await correo.reload()
  console.log(`\nCorreo de prueba #${correo.id}\n  ${asunto}`)
  console.log(correo.estado === 'ASOCIADO' ? 'Se asoció solo a la actuación abierta del caso.' : 'Quedó en "Correos por registrar".\n')
}

crear()
  .catch(error => { console.error(error.message ?? error); process.exitCode = 1 })
  .finally(() => db.close())
