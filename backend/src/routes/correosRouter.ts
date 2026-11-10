import { Router } from 'express'
import { body, param } from 'express-validator'
import { Op } from 'sequelize'
import { Correo, Archivo, Caso, Juzgado, RadicadoOtroOperador, Actuacion, SincronizacionBuzon, SolicitudInsumo, Escrito, MotivoDevolucion } from '../models'
import { confirmarDatosFaltantes } from '../services/flujoEscritos'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol } from '../middleware/auth'
import { registrarAsignacion } from '../services/registroCasos'
import { ROLES, ETAPAS, TIPOS_SOLICITUD, UNIDADES_TERMINO, CRITICIDADES, BUZONES } from '../services/constantes'
import { responderError, ErrorNegocio } from '../utils/errores'
import { encolarLecturaBuzon } from '../queues/buzonQueue'
import { buzonesConfigurados } from '../services/buzon/graph'
import { modoEnvio } from '../services/buzon/correosSalida'
import { archivarAdjuntos } from '../services/expediente'
import { parametro } from '../services/parametros'

const router = Router()

// Lo más probable según el texto de la respuesta a una entrega; la persona confirma. El cliente
// puede escribir "aprobado" en una devolución ("no queda aprobado…"): por eso la devolución va primero
const sugerirRespuesta = (asunto: string | null, cuerpo: string | null) => {
  const t = `${asunto ?? ''} ${(cuerpo ?? '').slice(0, 3000)}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/devuelv|devolucion|ajust|corregir|correccion|observaciones al|no se aprueba|no queda aprobado/.test(t)) return 'DEVOLUCION'
  if (/aprob|visto bueno|sin observaciones/.test(t)) return 'APROBACION'
  return 'ACUSE'
}
const registran = requiereRol(ROLES.ASISTENTE, ROLES.COORDINADOR)

// Bandeja de correos (por defecto, los que faltan por registrar), del más antiguo al más nuevo:
// el que lleva más tiempo esperando es el que más consume del ANS.
// estado=POR_REVISAR: respuestas ya asociadas que alguien debe atender (insumos, acuse o devolución)
router.get('/', async (req, res) => {
  try {
    const estado = String(req.query.estado || 'POR_REGISTRAR')
    const pagina = Math.max(1, Number(req.query.pagina) || 1)
    const where: Record<string, unknown> = estado === 'POR_REVISAR' ? { direccion: 'ENTRANTE', porRevisar: true } : { direccion: 'ENTRANTE', estado }
    if (req.query.etapa) where.etapaDetectada = String(req.query.etapa)
    if (req.query.buzon && (BUZONES as readonly string[]).includes(String(req.query.buzon))) where.buzon = String(req.query.buzon)
    const pendiente = estado === 'POR_REGISTRAR' || estado === 'POR_REVISAR'
    const { rows, count } = await Correo.findAndCountAll({
      where,
      attributes: ['id', 'buzon', 'remitente', 'nombreRemitente', 'asunto', 'fechaCorreo', 'etapaDetectada', 'fuenteEtapa', 'criticidadDetectada', 'vencimientoDetectado', 'radicados', 'estado', 'porRevisar', 'casoId', 'proposito'],
      include: [
        { model: Archivo, attributes: ['id', 'nombre'] },
        { model: Caso, attributes: ['id', 'radicado', 'numeroInterno', 'etapaActual'] }
      ],
      order: [['fechaCorreo', pendiente ? 'ASC' : 'DESC']],
      limit: 50,
      offset: (pagina - 1) * 50,
      distinct: true
    })
    // Radicados que el archivo maestro asigna a otro operador (ANS-13): se marcan antes de registrar
    const radicados = [...new Set(rows.flatMap(c => c.radicados))]
    const ajenos = new Set((await RadicadoOtroOperador.findAll({ where: { radicado: radicados }, attributes: ['radicado'] })).map(r => r.radicado))
    res.json({
      total: count,
      pagina,
      correos: rows.map(c => ({ ...c.toJSON(), deOtroOperador: c.radicados.some(r => ajenos.has(r)) }))
    })
  } catch (error) {
    responderError(res, error)
  }
})

// Estado de la lectura de cada buzón y si los correos de salida se envían de verdad o se simulan
router.get('/estado-buzon', async (_req, res) => {
  const configurados = buzonesConfigurados()
  const estados = await SincronizacionBuzon.findAll({ where: { buzon: configurados.map(b => b.direccion) } })
  const [porRegistrar, porRevisar] = await Promise.all([
    Correo.count({ where: { direccion: 'ENTRANTE', estado: 'POR_REGISTRAR' } }),
    Correo.count({ where: { direccion: 'ENTRANTE', porRevisar: true } })
  ])
  res.json({
    activo: process.env.BUZON_ACTIVO === 'true',
    envio: modoEnvio(),
    // Uso de cada buzón frente a su capacidad (50 GB el compartido sin licencia)
    buzones: configurados.map(b => {
      const estado = estados.find(e => e.buzon === b.direccion) ?? null
      const porcentaje = estado?.tamanoBytes ? Math.round((Number(estado.tamanoBytes) / (parametro<number>('CUOTA_BUZON_GB') * 1024 ** 3)) * 1000) / 10 : null
      return { ...b, estado, porcentaje, alerta: porcentaje !== null && porcentaje >= parametro<number>('ALERTA_BUZON_PORCENTAJE') }
    }),
    cuotaGb: parametro<number>('CUOTA_BUZON_GB'),
    porRegistrar,
    porRevisar
  })
})

// Leer el buzón ya, sin esperar los 2 minutos
router.post('/sincronizar', requiereRol(ROLES.COORDINADOR, ROLES.ASISTENTE), async (_req, res) => {
  try {
    if (process.env.BUZON_ACTIVO !== 'true') throw new ErrorNegocio('La lectura del buzón no está activa (BUZON_ACTIVO)')
    await encolarLecturaBuzon()
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

// Detalle con el formulario precargado: radicado, juzgado (por el remitente o el código del
// despacho del radicado), etapa, criticidad y vencimiento (del asunto normalizado)
router.get('/:id', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.params.id), {
      include: [{ model: Archivo, attributes: ['id', 'nombre', 'tipoMime', 'tamano'] }, { model: Caso, include: [{ model: Actuacion, attributes: ['id', 'etapa', 'estado'] }] }]
    })
    if (!correo) throw new ErrorNegocio('El correo no existe', 404)
    const radicado = correo.radicados[0] ?? null
    const juzgado = await Juzgado.findOne({
      where: {
        [Op.or]: [
          ...(correo.remitente ? [{ correos: { [Op.contains]: [correo.remitente] } }] : []),
          ...(radicado ? [{ codigoDespacho: radicado.slice(0, 12) }] : [])
        ]
      },
      attributes: ['id', 'nombre']
    }).catch(() => null)
    const deOtroOperador = radicado ? !!(await RadicadoOtroOperador.findOne({ where: { radicado: correo.radicados } })) : false
    // Respuesta por revisar: lo que hace falta para atenderla desde aquí
    const contexto = correo.actuacionId ? {
      actuacion: await Actuacion.findByPk(correo.actuacionId, { attributes: ['id', 'etapa', 'estado'] }),
      insumosPendientes: await SolicitudInsumo.findAll({ where: { actuacionId: correo.actuacionId, fechaRecepcion: null }, attributes: ['id', 'descripcion', 'minimo', 'fechaSolicitud'] }),
      escrito: await Escrito.findOne({ where: { actuacionId: correo.actuacionId }, order: [['version', 'DESC']], attributes: ['id', 'version', 'estado', 'fechaEntregaEntidad'] }),
      motivos: await MotivoDevolucion.findAll({ where: { activo: true }, attributes: ['id', 'nombre', 'tipo'], order: [['nombre', 'ASC']] })
    } : null
    res.json({
      correo,
      contexto,
      sugerenciaRespuesta: correo.proposito === 'RESPUESTA_ENTREGA' ? sugerirRespuesta(correo.asunto, correo.cuerpoTexto) : null,
      sugerencia: {
        radicado,
        juzgadoId: juzgado?.id ?? correo.caso?.juzgadoId ?? null,
        etapa: correo.etapaDetectada,
        criticidad: correo.criticidadDetectada,
        fechaVencimiento: correo.vencimientoDetectado,
        tipoSolicitud: correo.caso?.tipoSolicitud ?? 'TUTELA'
      },
      deOtroOperador
    })
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/:id/registrar',
  registran,
  param('id').isInt(),
  body('radicado').isString().notEmpty().withMessage('Falta el radicado'),
  body('tipoSolicitud').isIn(TIPOS_SOLICITUD),
  body('etapa').isIn(ETAPAS).withMessage('Etapa no válida'),
  body('terminoUnidad').optional({ values: 'null' }).isIn(UNIDADES_TERMINO),
  body('terminoValor').optional({ values: 'null' }).isInt({ min: 1 }),
  body('fechaVencimiento').optional({ values: 'falsy' }).isISO8601(),
  body('criticidad').optional({ values: 'falsy' }).isIn(CRITICIDADES),
  body('partes').optional().isArray(),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      const resultado = await registrarAsignacion({ ...req.body, correoId: Number(req.params.id) }, req.usuario!.id)
      res.status(201).json(resultado)
    } catch (error) {
      responderError(res, error)
    }
  })

// Correo de seguimiento de una actuación que no se emparejó solo
router.post('/:id/asociar', registran, param('id').isInt(), body('actuacionId').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.params.id))
    const actuacion = await Actuacion.findByPk(Number(req.body.actuacionId), { attributes: ['id', 'casoId'] })
    if (!correo || !actuacion) throw new ErrorNegocio('Correo o actuación no existen', 404)
    await correo.update({ estado: 'ASOCIADO', casoId: actuacion.casoId, actuacionId: actuacion.id, proposito: req.body.proposito ?? 'SEGUIMIENTO', usuarioId: req.usuario!.id, porRevisar: false })
    await archivarAdjuntos(correo.id, actuacion.id, 'Entrada')
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

// Datos faltantes que mandó el cliente: se confirma el recibido (plantilla) y sale de "por revisar"
router.post('/:id/datos-faltantes-recibidos', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    await confirmarDatosFaltantes({ correoId: Number(req.params.id), enviarAcuse: req.body.enviarAcuse !== false, usuarioId: req.usuario!.id })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

// Respuesta ya asociada que alguien leyó y atendió (insumos, acuse, datos faltantes). La
// clasificación de devoluciones llega con el flujo de entregas
router.post('/:id/atendido', registran, param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.params.id))
    if (!correo) throw new ErrorNegocio('El correo no existe', 404)
    await correo.update({ porRevisar: false, usuarioId: req.usuario!.id })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

// Publicidad, respuestas automáticas, correos que no son de tutelas
router.post('/:id/descartar', registran, param('id').isInt(), body('motivo').isString().notEmpty().withMessage('Indique por qué se descarta'), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.params.id))
    if (!correo || correo.estado !== 'POR_REGISTRAR') throw new ErrorNegocio('El correo no está por registrar')
    await correo.update({ estado: 'DESCARTADO', error: String(req.body.motivo).slice(0, 500), usuarioId: req.usuario!.id })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

export default router
