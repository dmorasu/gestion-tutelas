import { Router } from 'express'
import { body, param } from 'express-validator'
import { Op } from 'sequelize'
import multer from 'multer'
import { Correo, Archivo, Caso, Juzgado, RadicadoOtroOperador, Actuacion, SincronizacionBuzon, SolicitudInsumo, Escrito, MotivoDevolucion, EnlaceCorreo, Usuario } from '../models'
import { filtroPorAtender, asignacionesVencidas } from '../services/buzon/atencion'
import { descargarEnlace, subirEnlace, descartarEnlace } from '../services/buzon/enlaces'
import { confirmarDatosFaltantes } from '../services/flujoEscritos'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol } from '../middleware/auth'
import { registrarAsignacion } from '../services/registroCasos'
import { ROLES, ETAPAS, TIPOS_SOLICITUD, UNIDADES_TERMINO, CRITICIDADES, BUZONES } from '../services/constantes'
import { responderError, ErrorNegocio } from '../utils/errores'
import { encolarLecturaBuzon } from '../queues/buzonQueue'
import { buzonesConfigurados } from '../services/buzon/graph'
import { modoEnvio } from '../services/buzon/correosSalida'
import { archivarAdjuntos, destinoAdjuntos } from '../services/expediente'
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
const cargaEnlace = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024, files: 30 } })

// Nombres de los responsables (el correo guarda solo el id)
const nombresDe = async (ids: (number | null)[]) => {
  const unicos = [...new Set(ids.filter((x): x is number => !!x))]
  if (!unicos.length) return new Map<number, string>()
  return new Map((await Usuario.findAll({ where: { id: unicos }, attributes: ['id', 'nombre'] })).map(u => [u.id, u.nombre]))
}

// Bandeja de correos (por defecto, los que faltan por registrar), del más antiguo al más nuevo:
// el que lleva más tiempo esperando es el que más consume del ANS.
// estado=POR_REVISAR: respuestas ya asociadas que alguien debe atender (insumos, acuse o devolución)
router.get('/', async (req, res) => {
  try {
    // POR_ATENDER (lo que todavía no tiene destino) y MIOS (lo que tomé o me trasladaron) son las
    // bandejas de trabajo; las demás, consulta
    const estado = String(req.query.estado || 'POR_ATENDER')
    const pagina = Math.max(1, Number(req.query.pagina) || 1)
    const where: Record<string | symbol, unknown> =
      estado === 'POR_ATENDER' ? { ...(await filtroPorAtender()) }
        : estado === 'MIOS' ? { ...(await filtroPorAtender()), responsableId: req.usuario!.id }
          : estado === 'POR_REVISAR' ? { direccion: 'ENTRANTE', porRevisar: true }
            : { direccion: 'ENTRANTE', estado }
    if (req.query.etapa) where.etapaDetectada = String(req.query.etapa)
    if (req.query.buzon && (BUZONES as readonly string[]).includes(String(req.query.buzon))) where.buzon = String(req.query.buzon)
    const pendiente = ['POR_ATENDER', 'MIOS', 'POR_REGISTRAR', 'POR_REVISAR'].includes(estado)
    const { rows, count } = await Correo.findAndCountAll({
      where,
      attributes: ['id', 'buzon', 'remitente', 'nombreRemitente', 'asunto', 'fechaCorreo', 'etapaDetectada', 'fuenteEtapa', 'criticidadDetectada', 'vencimientoDetectado', 'radicados', 'estado', 'porRevisar', 'casoId', 'proposito', 'responsableId', 'tomadoEn', 'notaTraslado'],
      include: [
        { model: Archivo, attributes: ['id', 'nombre'] },
        { model: EnlaceCorreo, as: 'enlacesPendientes', attributes: ['id', 'estado'], required: false },
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
    const nombres = await nombresDe(rows.map(c => c.responsableId))
    res.json({
      total: count,
      pagina,
      correos: rows.map(c => ({
        ...c.toJSON(),
        enlacesPendientes: (c.enlacesPendientes ?? []).filter(e => e.estado === 'PENDIENTE').length,
        responsable: c.responsableId ? nombres.get(c.responsableId) ?? null : null,
        deOtroOperador: c.radicados.some(r => ajenos.has(r))
      }))
    })
  } catch (error) {
    responderError(res, error)
  }
})

// Estado de la lectura de cada buzón y si los correos de salida se envían de verdad o se simulan
router.get('/estado-buzon', async (_req, res) => {
  const configurados = buzonesConfigurados()
  const estados = await SincronizacionBuzon.findAll({ where: { buzon: configurados.map(b => b.direccion) } })
  const [porRegistrar, porRevisar, porAtender, vencidas, mios] = await Promise.all([
    Correo.count({ where: { direccion: 'ENTRANTE', estado: 'POR_REGISTRAR' } }),
    Correo.count({ where: { direccion: 'ENTRANTE', porRevisar: true } }),
    Correo.count({ where: await filtroPorAtender() }),
    asignacionesVencidas(),
    Correo.count({ where: { ...(await filtroPorAtender()), responsableId: _req.usuario!.id } })
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
    porRevisar,
    porAtender,
    mios,
    // Asignaciones sin registrar después de MINUTOS_ALERTA_SIN_ATENDER (se ven en rojo)
    asignacionesVencidas: vencidas,
    minutosAlerta: parametro<number>('MINUTOS_ALERTA_SIN_ATENDER')
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
    const [enlaces, personas] = await Promise.all([
      EnlaceCorreo.findAll({ where: { correoId: correo.id }, order: [['id', 'ASC']] }),
      Usuario.findAll({ where: { activo: true }, attributes: ['id', 'nombre'], order: [['nombre', 'ASC']] })
    ])
    res.json({
      correo,
      enlaces,
      responsable: correo.responsableId ? personas.find(p => p.id === correo.responsableId)?.nombre ?? null : null,
      personas,
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
    // Una respuesta (insumos, entrega, datos faltantes) asociada a mano queda por clasificar igual que
    // si hubiera llegado en su hilo; seguimiento o informativo quedan atendidos
    const proposito = String(req.body.proposito ?? 'SEGUIMIENTO')
    const porRevisar = ['RESPUESTA_INSUMOS', 'RESPUESTA_ENTREGA', 'RESPUESTA_DATOS_FALTANTES'].includes(proposito)
    await correo.update({ estado: 'ASOCIADO', casoId: actuacion.casoId, actuacionId: actuacion.id, proposito, usuarioId: req.usuario!.id, porRevisar })
    const { sub, tipo, escritoId } = await destinoAdjuntos(proposito, actuacion.id)
    await archivarAdjuntos(correo.id, actuacion.id, sub, tipo, escritoId)
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

// ── Quién atiende el correo ──
// Tomar: queda a mi nombre y los demás lo ven (nadie lo atiende dos veces). Trasladar: a otra persona,
// con una nota; le aparece en "Mis pendientes". Soltar: vuelve a estar sin dueño
router.post('/:id/tomar', registran, param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.params.id))
    if (!correo) throw new ErrorNegocio('El correo no existe', 404)
    if (correo.responsableId && correo.responsableId !== req.usuario!.id && !req.body.forzar) {
      const [quien] = (await nombresDe([correo.responsableId])).values()
      throw new ErrorNegocio(`Ya lo está atendiendo ${quien ?? 'otra persona'}`)
    }
    await correo.update({ responsableId: req.usuario!.id, tomadoEn: new Date(), notaTraslado: null })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/:id/trasladar', registran, param('id').isInt(), body('usuarioId').isInt().withMessage('Elija a quién trasladarlo'), manejarErroresEntrada, async (req, res) => {
  try {
    const correo = await Correo.findByPk(Number(req.params.id))
    const destino = await Usuario.findByPk(Number(req.body.usuarioId), { attributes: ['id', 'nombre', 'activo'] })
    if (!correo) throw new ErrorNegocio('El correo no existe', 404)
    if (!destino?.activo) throw new ErrorNegocio('Esa persona no está activa')
    const nota = String(req.body.nota ?? '').trim()
    await correo.update({ responsableId: destino.id, tomadoEn: new Date(), notaTraslado: `${req.usuario!.nombre}${nota ? `: ${nota}` : ' se lo trasladó'}`.slice(0, 1000) })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/:id/soltar', registran, param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    await Correo.update({ responsableId: null, tomadoEn: null, notaTraslado: null }, { where: { id: Number(req.params.id) } })
    res.json({ ok: true })
  } catch (error) {
    responderError(res, error)
  }
})

// ── Enlaces de SharePoint del correo ──
router.post('/enlaces/:id/descargar', registran, param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    res.json(await descargarEnlace(Number(req.params.id), req.usuario!.id))
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/enlaces/:id/subir', registran, cargaEnlace.array('archivos'), param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const archivos = ((req.files ?? []) as Express.Multer.File[]).map(a => ({ nombre: Buffer.from(a.originalname, 'latin1').toString('utf8'), tipoMime: a.mimetype, contenido: a.buffer }))
    res.json(await subirEnlace(Number(req.params.id), archivos, req.usuario!.id))
  } catch (error) {
    responderError(res, error)
  }
})

router.post('/enlaces/:id/descartar', registran, param('id').isInt(), body('motivo').isString(), manejarErroresEntrada, async (req, res) => {
  try {
    await descartarEnlace(Number(req.params.id), req.body.motivo, req.usuario!.id)
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
