// =====================================
// CORREOS DE DEMOSTRACIÓN EN EL BUZÓN DE ASIGNACIONES
// Cinco asignaciones como las que manda la entidad, guardadas igual que las guarda el lector del
// buzón (asunto normalizado, radicados del cuerpo, enlaces de SharePoint), para mostrar la bandeja
// sin tener 365 configurado. Distintas etapas, criticidades y tiempos de espera: uno pasa de los
// 30 minutos para que se vea el aviso en rojo, y uno es un paquete con tres radicados.
// Los radicados usan despachos 9xx para no chocar con uno real. Los datos son inventados.
// Guarda los ids en Docs/herramientas/salida-ejemplos/correos-demo.json.
//
//   cd backend
//   npx ts-node --transpile-only --project tsconfig.json ../Docs/herramientas/correos-demo.ts crear
//   npx ts-node --transpile-only --project tsconfig.json ../Docs/herramientas/correos-demo.ts borrar
//
// "borrar" quita los correos y, si en la demo se registraron casos con esos radicados, también los
// casos con su bitácora, alertas, archivos y correos de salida (acuses), y devuelve la secuencia.
// =====================================
import fs from 'fs'
import path from 'path'
import { db } from '../../backend/src/config/db'
import { Alerta, Archivo, Caso, Correo, EnlaceCorreo, HistorialCaso, NotaCaso } from '../../backend/src/models'
import { cargarParametros, parametro } from '../../backend/src/services/parametros'
import { registrarEnlaces } from '../../backend/src/services/buzon/enlaces'
import { refrescarAns } from '../../backend/src/services/tablero'
import { ETAPA_EN_ASUNTO, type Etapa } from '../../backend/src/services/constantes'
import { leerAsunto } from '../../backend/src/utils/asunto'
import { buscarRadicados, formatoRadicado } from '../../backend/src/utils/radicado'
import { enBogota, instanteBogota, textoFechaHora } from '../../backend/src/utils/fechaColombia'
import { sumarDiasHabiles } from '../../backend/src/utils/diasHabiles'
import { cargarCalendario } from '../../backend/src/services/calendario'

const SALIDA = path.join(__dirname, 'salida-ejemplos')
const ARCHIVO_IDS = path.join(SALIDA, 'correos-demo.json')
// El remitente marca los correos de la demo: "borrar" solo toca los que lo tienen
const REMITENTE = 'defensajudicial@entidad.demo'
const NOMBRE_REMITENTE = 'Defensa Judicial · La entidad'
const BUZON = process.env.BUZON_ASIGNACIONES || 'asignacionsdmc@gomezpinedaabogados.com'

const ahora = Date.now()

// 11001 (Bogotá) + 31 + 05 + despacho 9xx + 2026 + consecutivo + 00 = 23 dígitos
const radicado = (despacho: number) => `110013105${despacho}2026${String((ahora + despacho) % 100000).padStart(5, '0')}00`

type Demo = {
  etapa: Etapa
  criticidad: 'CRÍTICO' | 'ALTO' | 'ORDINARIO'
  // Vencimiento a N días hábiles, a una hora redonda (como lo pone la entidad), y minutos desde que "llegó"
  dias: number
  hora: string
  hace: number
  radicados: string[]
  cuerpo: (radicados: string[], vence: string) => string[]
}

const firma = ['', 'Cordialmente,', '', 'Coordinación de Defensa Judicial', 'La entidad']

const DEMOS: Demo[] = [
  {
    etapa: 'ACCION', criticidad: 'ORDINARIO', dias: 5, hora: '17:00', hace: 12,
    radicados: [radicado(901)],
    cuerpo: ([r], vence) => [
      'Buenos días,',
      '',
      `Se asigna para su gestión la acción de tutela con radicado ${formatoRadicado(r)}, para contestación.`,
      '',
      'Juzgado: Juzgado 14 Civil Municipal de Bogotá',
      'Accionante: LAURA MARCELA GÓMEZ RUIZ, C.C. 52.418.903',
      'Derecho invocado: Petición',
      `Término para contestar: ${vence}`,
      '',
      'El auto admisorio, el escrito de tutela y sus anexos están en el siguiente enlace:',
      'https://entidaddemo.sharepoint.com/sites/DefensaJudicial/Shared%20Documents/Tutelas/' + r,
      ...firma
    ]
  },
  {
    etapa: 'IMPUGNACION', criticidad: 'ALTO', dias: 2, hora: '12:00', hace: 47,
    radicados: [radicado(902)],
    cuerpo: ([r], vence) => [
      'Buenas tardes,',
      '',
      `Se remite el fallo de primera instancia del proceso ${formatoRadicado(r)}, desfavorable a la entidad, para que se proyecte la impugnación.`,
      '',
      'Juzgado: Juzgado 21 Administrativo del Circuito de Bogotá',
      'Accionante: CARLOS ANDRÉS PÉREZ MOLINA, C.C. 1.020.734.118',
      'Derecho invocado: Debido proceso',
      'Fecha de notificación del fallo: hoy',
      `Vence: ${vence}`,
      '',
      'Agradecemos priorizar.',
      ...firma
    ]
  },
  {
    etapa: 'DESACATO', criticidad: 'CRÍTICO', dias: 1, hora: '10:00', hace: 4,
    radicados: [radicado(903)],
    cuerpo: ([r], vence) => [
      'Buenos días,',
      '',
      `URGENTE. El juzgado abrió incidente de desacato dentro del proceso ${formatoRadicado(r)} y concedió un término muy corto para pronunciarse.`,
      '',
      'Juzgado: Juzgado 5 Penal Municipal con Función de Control de Garantías de Bogotá',
      'Accionante: MARÍA FERNANDA ROJAS PATIÑO, C.C. 39.807.221',
      'Orden incumplida: dar respuesta de fondo al derecho de petición del 12 de agosto',
      `Vence: ${vence}`,
      '',
      'Se requiere informe de cumplimiento con los soportes de la respuesta enviada al accionante.',
      ...firma
    ]
  },
  {
    etapa: 'CUMPLIMIENTO', criticidad: 'CRÍTICO', dias: 1, hora: '17:00', hace: 25,
    radicados: [radicado(904)],
    cuerpo: ([r], vence) => [
      'Buenas tardes,',
      '',
      `El juzgado requiere acreditar el cumplimiento del fallo de tutela del proceso ${formatoRadicado(r)}.`,
      '',
      'Juzgado: Juzgado 3 Laboral del Circuito de Bogotá',
      'Accionante: JORGE IVÁN CASTRO LEAL, C.C. 80.112.645',
      'Orden: expedir el paz y salvo y actualizar la información del accionante dentro de las 48 horas siguientes a la notificación',
      `Vence: ${vence}`,
      ...firma
    ]
  },
  {
    // Paquete: el asunto no trae un radicado y los tres van en el cuerpo, como en las asignaciones
    // en bloque; la app propone registrarlos juntos con "Radicados de un correo"
    etapa: 'ACCION', criticidad: 'ORDINARIO', dias: 4, hora: '17:00', hace: 8,
    radicados: [radicado(905), radicado(906), radicado(907)],
    cuerpo: ([a, b, c], vence) => [
      'Buenos días,',
      '',
      'Se asignan en paquete las siguientes acciones de tutela para contestación:',
      '',
      `1. ${formatoRadicado(a)} · Juzgado 12 Civil Municipal de Bogotá · Accionante: ANA LUCÍA MARTÍNEZ SOTO · Petición`,
      `2. ${formatoRadicado(b)} · Juzgado 30 Civil Municipal de Bogotá · Accionante: PEDRO PABLO SUÁREZ VEGA · Habeas data`,
      `3. ${formatoRadicado(c)} · Juzgado 8 de Familia de Bogotá · Accionante: DIANA CAROLINA LÓPEZ ARIAS · Igualdad`,
      '',
      `Término para contestar: ${vence}`,
      ...firma
    ]
  }
]

type Ids = { correos: number[], radicados: string[] }

const crear = async () => {
  if (fs.existsSync(ARCHIVO_IDS)) throw new Error(`Ya hay correos de demo (${ARCHIVO_IDS}). Bórrelos primero`)
  await db.authenticate()
  await cargarParametros(true)
  // Festivos y días no hábiles, para que ningún vencimiento caiga en fin de semana o festivo
  await cargarCalendario(true)
  const prefijo = parametro<string>('PREFIJO_ASUNTO')
  const horaTermino = parametro<string>('HORA_VENCIMIENTO_TERMINO')
  const ids: Ids = { correos: [], radicados: [] }

  for (const d of DEMOS) {
    const vence = textoFechaHora(instanteBogota(sumarDiasHabiles(enBogota(new Date(ahora)).dia, d.dias), d.hora))
    const bloqueRadicado = d.radicados.length === 1 ? ` [${d.radicados[0]}]` : ''
    const asunto = `[${prefijo}] [${d.criticidad}]${bloqueRadicado} [${ETAPA_EN_ASUNTO[d.etapa]}] [Vence: ${vence}]`
    const cuerpo = d.cuerpo(d.radicados, vence).join('\n')
    // Igual que el lector del buzón: lo del asunto manda y el resto se busca en el cuerpo
    const leido = leerAsunto(asunto, horaTermino)
    const encontrados = buscarRadicados(asunto, cuerpo)
    const correo = await Correo.create({
      direccion: 'ENTRANTE',
      buzon: 'ASIGNACIONES',
      etapaDetectada: leido.etapa,
      fuenteEtapa: leido.etapa ? 'ASUNTO' : null,
      criticidadDetectada: leido.criticidad,
      vencimientoDetectado: leido.vence,
      remitente: REMITENTE,
      nombreRemitente: NOMBRE_REMITENTE,
      para: [BUZON],
      cc: [],
      asunto,
      cuerpoTexto: cuerpo,
      enlaces: [...new Set(cuerpo.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [])],
      fechaCorreo: new Date(ahora - d.hace * 60_000),
      radicados: leido.radicado ? [leido.radicado, ...encontrados.filter(r => r !== leido.radicado)] : encontrados,
      estado: 'POR_REGISTRAR'
    })
    await registrarEnlaces(correo)
    ids.correos.push(correo.id)
    ids.radicados.push(...d.radicados)
    console.log(`#${correo.id}  ${asunto}`)
  }

  fs.mkdirSync(SALIDA, { recursive: true })
  fs.writeFileSync(ARCHIVO_IDS, JSON.stringify(ids, null, 2))
  console.log(`\n${ids.correos.length} correos en la bandeja de asignaciones ("Por atender")`)
}

const borrar = async () => {
  if (!fs.existsSync(ARCHIVO_IDS)) throw new Error('No hay correos de demo registrados')
  const ids = JSON.parse(fs.readFileSync(ARCHIVO_IDS, 'utf8')) as Ids
  await db.authenticate()

  // Los casos que se hayan registrado en la demo con esos radicados (despachos 9xx inventados)
  const casos = (await Caso.findAll({ where: { radicado: ids.radicados }, attributes: ['id'] })).map(c => c.id)
  const entrantes = (await Correo.findAll({ where: { id: ids.correos, remitente: REMITENTE }, attributes: ['id'] })).map(c => c.id)
  // Los acuses y demás correos de salida de esos casos, y respuestas que se hayan asociado
  const delCaso = casos.length ? (await Correo.findAll({ where: { casoId: casos }, attributes: ['id'] })).map(c => c.id) : []
  const correos = [...new Set([...entrantes, ...delCaso])]

  // Sin Op: desde Docs no se resuelve 'sequelize' (vive en backend/node_modules)
  await Archivo.destroy({ where: { correoId: correos } })
  if (casos.length) await Archivo.destroy({ where: { casoId: casos } })
  await EnlaceCorreo.destroy({ where: { correoId: correos } })
  await Correo.destroy({ where: { id: correos } })
  if (casos.length) {
    await Alerta.destroy({ where: { casoId: casos } })
    await HistorialCaso.destroy({ where: { casoId: casos } })
    await NotaCaso.destroy({ where: { casoId: casos } })
    await Caso.destroy({ where: { id: casos, tipoSolicitud: 'PQRS' } })
    await Caso.destroy({ where: { id: casos } })
    // El consecutivo vuelve al mayor número interno que quede
    await db.query(`SELECT setval('casos_numero_interno_seq', GREATEST(1, COALESCE((SELECT max(substring("numeroInterno" from '[0-9]+$')::int) FROM casos), 0)), EXISTS (SELECT 1 FROM casos WHERE "numeroInterno" IS NOT NULL))`)
    await refrescarAns(true)
  }
  fs.unlinkSync(ARCHIVO_IDS)
  console.log(`Borrados ${correos.length} correos y ${casos.length} casos de la demo`)
}

const accion = process.argv[2]
const tareas: Record<string, () => Promise<void>> = { crear, borrar }
if (!tareas[accion]) {
  console.error('Uso: correos-demo.ts crear | borrar')
  process.exit(1)
}
tareas[accion]()
  .catch(error => { console.error(error.message ?? error); process.exitCode = 1 })
  .finally(() => db.close())
