import { Router, type Request, type Response } from 'express'
import { body, param } from 'express-validator'
import { Op, type WhereOptions } from 'sequelize'
import { Caso, Parte, Actuacion, Juzgado, Usuario, Equipo, SolicitudInsumo, Escrito, Devolucion, Decision, RadicacionJuzgado, Correo, Archivo, HistorialCaso } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol, tieneRol } from '../middleware/auth'
import { registrarAsignacion, recalcularPlazos } from '../services/registroCasos'
import { revisorDeEquipo } from '../services/reparto'
import { semaforo } from '../services/plazos'
import { parametro } from '../services/parametros'
import { ROLES, ETAPAS, TIPOS_SOLICITUD, UNIDADES_TERMINO, ESTADOS_ACTUACION, CRITICIDADES, BUZONES, TIPOS_ESCRITO, TIPOS_PETICION } from '../services/constantes'
import { normalizarRadicado, normalizarRadicadoPqrs } from '../utils/radicado'
import { crearPqrsLigada } from '../services/pqrs'
import { exigirResponsable, exigirRevisor, alcanceActuaciones } from '../services/permisosActuacion'
import * as flujo from '../services/flujoEscritos'
import { INSTANCIAS, SENTIDOS_POR_INSTANCIA, registrarDecision, abrirCumplimiento } from '../services/fallos'
import { lineaTiempo } from '../services/lineaTiempo'
import { filtroPorAtender, asignacionesVencidas } from '../services/buzon/atencion'
import { modoEnvio, borradorLibre, enviarLibre } from '../services/buzon/correosSalida'
import { proveedorAlmacen } from '../services/almacenamiento'
import { MotivoDevolucion, Alerta } from '../models'
import { responderError, ErrorNegocio } from '../utils/errores'

const router = Router()
const HORA = 60 * 60 * 1000
const ABIERTA = { [Op.ne]: 'CERRADA' }

// Rango de fechas límite de cada color del semáforo (para filtrar en la base)
const rangoSemaforo = (color: string) => {
  const ahora = Date.now()
  const rojo = new Date(ahora + parametro<number>('SEMAFORO_HORAS_ROJO') * HORA)
  const amarillo = new Date(ahora + parametro<number>('SEMAFORO_HORAS_AMARILLO') * HORA)
  switch (color) {
    case 'VENCIDO': return { [Op.lt]: new Date(ahora) }
    case 'ROJO': return { [Op.gte]: new Date(ahora), [Op.lt]: rojo }
    case 'AMARILLO': return { [Op.gte]: rojo, [Op.lt]: amarillo }
    case 'VERDE': return { [Op.gte]: amarillo }
    case 'SIN_FECHA': return { [Op.is]: null }
    default: return undefined
  }
}

const alcance = alcanceActuaciones

// Mientras se esperan insumos el ANS está suspendido (sin fecha límite), pero el término judicial
// sigue corriendo: el semáforo cae al vencimiento para no esconder la urgencia
// Con el escrito ya entregado (o aprobado o radicado) el ANS ya se midió: no cuenta como pendiente
const ENTREGADAS = ['ENTREGADO', 'APROBADO', 'RADICADO']
const semaforoDe = (a: Actuacion) => (ENTREGADAS.includes(a.estado) ? 'ENTREGADO' : semaforo(a.fechaLimiteEntrega ?? a.fechaVencimiento))

// =====================================
// TABLERO: actuaciones abiertas, la de fecha límite más cercana primero
// =====================================
router.get('/', async (req, res) => {
  try {
    const pagina = Math.max(1, Number(req.query.pagina) || 1)
    const where: WhereOptions = { estado: req.query.estado ? String(req.query.estado) : ABIERTA }
    const w = where as Record<string | symbol, unknown>
    if (req.query.etapa) w.etapa = String(req.query.etapa)
    if (req.query.criticidad) w.criticidad = String(req.query.criticidad)
    if (req.query.equipoId) w.equipoId = Number(req.query.equipoId)
    if (req.query.auxiliarId) w.auxiliarId = Number(req.query.auxiliarId)
    if (req.query.revisorId) w.revisorId = Number(req.query.revisorId)
    if (req.query.todos !== '1') Object.assign(w, alcance(req))
    if (req.query.semaforo === 'ENTREGADO') w.estado = ENTREGADAS
    const rango = req.query.semaforo ? rangoSemaforo(String(req.query.semaforo)) : undefined
    if (rango) {
      w.fechaLimiteEntrega = rango
      // Los colores son de lo que falta entregar
      if (!req.query.estado) w.estado = { [Op.notIn]: [...ENTREGADAS, 'CERRADA'] }
    }

    // Búsqueda por radicado, número interno, nombre o documento del accionante. Primero los casos y
    // luego se filtra por id: un $anidado$ con límite y hasMany falla en Sequelize
    const q = String(req.query.q ?? '').trim()
    if (q) {
      const digitos = normalizarRadicado(q)
      // El de una PQRS es alfanumérico: se busca también normalizado como tal
      const alfanumerico = normalizarRadicadoPqrs(q)
      const [porRadicado, porNumero, porParte] = await Promise.all([
        digitos.length >= 5 || alfanumerico.length >= 4
          ? Caso.findAll({ where: { radicado: { [Op.or]: [...(digitos.length >= 5 ? [{ [Op.like]: `%${digitos}%` }] : []), { [Op.like]: `%${alfanumerico}%` }] } }, attributes: ['id'], limit: 500 })
          : [],
        Caso.findAll({ where: { numeroInterno: { [Op.iLike]: `%${q}%` } }, attributes: ['id'], limit: 500 }),
        Parte.findAll({ where: { [Op.or]: [{ nombre: { [Op.iLike]: `%${q}%` } }, { numeroDocumento: q }] }, attributes: ['casoId'], limit: 500 })
      ])
      w.casoId = [...new Set([...porRadicado.map(c => c.id), ...porNumero.map(c => c.id), ...porParte.map(p => p.casoId)])]
    }

    const { rows, count } = await Actuacion.findAndCountAll({
      where,
      include: [
        {
          // juzgadoId es necesario para unir el juzgado incluido abajo
          model: Caso, required: true, attributes: ['id', 'radicado', 'numeroInterno', 'tipoSolicitud', 'deOtroOperador', 'juzgadoId'],
          include: [{ model: Parte, attributes: ['nombre', 'numeroDocumento'], required: false }, { model: Juzgado, attributes: ['nombre'] }]
        },
        { model: Usuario, as: 'auxiliar', attributes: ['id', 'nombre'] },
        { model: Usuario, as: 'revisor', attributes: ['id', 'nombre'] },
        { model: Equipo, attributes: ['id', 'nombre'] }
      ],
      order: [['fechaLimiteEntrega', 'ASC NULLS LAST'], ['fechaVencimiento', 'ASC NULLS LAST'], ['fechaAsignacion', 'ASC']],
      limit: 50,
      offset: (pagina - 1) * 50,
      distinct: true
    })
    res.json({
      total: count,
      pagina,
      actuaciones: rows.map(a => ({ ...a.toJSON(), semaforo: semaforoDe(a) }))
    })
  } catch (error) {
    responderError(res, error)
  }
})

// Totales del inicio: por semáforo, criticidad y etapa, y lo que espera en los buzones
router.get('/resumen', async (req, res) => {
  try {
    const propias = alcance(req)
    const colores = ['VENCIDO', 'ROJO', 'AMARILLO', 'VERDE', 'SIN_FECHA']
    const pendientes = { [Op.notIn]: [...ENTREGADAS, 'CERRADA'] }
    const conteos = await Promise.all(colores.map(c => Actuacion.count({ where: { ...propias, estado: pendientes, fechaLimiteEntrega: rangoSemaforo(c) } })))
    const [porEtapa, porCriticidad, porRegistrar, porRevisar, alertasPendientes, porAtender, asignacionesSinAtender] = await Promise.all([
      Actuacion.count({ where: { ...propias, estado: ABIERTA }, group: ['etapa'] }),
      Actuacion.count({ where: { ...propias, estado: ABIERTA }, group: ['criticidad'] }),
      Correo.count({ where: { direccion: 'ENTRANTE', estado: 'POR_REGISTRAR' } }),
      Correo.count({ where: { direccion: 'ENTRANTE', porRevisar: true } }),
      Alerta.count({ where: { estado: 'PENDIENTE' } }),
      Correo.count({ where: await filtroPorAtender() }),
      asignacionesVencidas()
    ])
    res.json({ semaforo: Object.fromEntries(colores.map((c, i) => [c, conteos[i]])), porEtapa, porCriticidad, porRegistrar, porRevisar, alertasPendientes, porAtender, asignacionesSinAtender })
  } catch (error) {
    responderError(res, error)
  }
})

// Registro manual (sin correo): la fecha de asignación la indica el asistente
router.post('/',
  requiereRol(ROLES.ASISTENTE, ROLES.COORDINADOR),
  body('radicado').isString().notEmpty(),
  body('tipoSolicitud').isIn(TIPOS_SOLICITUD),
  body('etapa').isIn(ETAPAS),
  body('fechaAsignacion').isISO8601().withMessage('Indique la fecha y hora de asignación'),
  body('fechaVencimiento').optional({ values: 'falsy' }).isISO8601(),
  body('criticidad').optional({ values: 'falsy' }).isIn(CRITICIDADES),
  body('terminoUnidad').optional({ values: 'null' }).isIn(UNIDADES_TERMINO),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      res.status(201).json(await registrarAsignacion({ ...req.body, correoId: null }, req.usuario!.id))
    } catch (error) {
      responderError(res, error)
    }
  })

// ¿Ya existe el caso? El formulario lo consulta mientras se escribe el radicado
router.get('/radicado/:radicado', async (req, res) => {
  try {
    const texto = String(req.params.radicado)
    const radicado = req.query.tipo === 'PQRS' ? normalizarRadicadoPqrs(texto) : normalizarRadicado(texto)
    const caso = radicado.length === 23 || (req.query.tipo === 'PQRS' && radicado.length >= 4)
      ? await Caso.findOne({ where: { radicado }, attributes: ['id', 'numeroInterno', 'estado'], include: [{ model: Actuacion, attributes: ['id', 'etapa', 'estado'] }] })
      : null
    res.json({ caso })
  } catch (error) {
    responderError(res, error)
  }
})

router.get('/:id', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const caso = await Caso.findByPk(Number(req.params.id), {
      include: [
        { model: Parte },
        { model: Juzgado, attributes: ['id', 'nombre'] },
        { model: Usuario, as: 'registradoPor', attributes: ['nombre'] },
        {
          model: Actuacion,
          separate: true,
          order: [['fechaAsignacion', 'ASC']],
          include: [
            { model: Usuario, as: 'auxiliar', attributes: ['id', 'nombre'] },
            { model: Usuario, as: 'revisor', attributes: ['id', 'nombre'] },
            { model: Equipo, attributes: ['id', 'nombre'] },
            { model: SolicitudInsumo, separate: true, order: [['createdAt', 'ASC']] },
            { model: Escrito, separate: true, order: [['version', 'ASC']], include: [{ model: Devolucion, include: [{ model: MotivoDevolucion, attributes: ['nombre'] }] }] },
            { model: Decision, separate: true },
            { model: RadicacionJuzgado, separate: true }
          ]
        }
      ]
    })
    if (!caso) throw new ErrorNegocio('El caso no existe', 404)
    const [correos, archivos] = await Promise.all([
      Correo.findAll({
        where: { casoId: caso.id },
        attributes: ['id', 'direccion', 'buzon', 'remitente', 'para', 'asunto', 'fechaCorreo', 'proposito', 'estado', 'porRevisar', 'error', 'actuacionId'],
        order: [['fechaCorreo', 'DESC']]
      }),
      Archivo.findAll({
        where: { casoId: caso.id },
        attributes: ['id', 'nombre', 'tipoMime', 'tamano', 'tipo', 'proveedor', 'webUrl', 'actuacionId', 'escritoId', 'correoId', 'createdAt'],
        order: [['createdAt', 'ASC']]
      })
    ])
    const datos = caso.toJSON() as Record<string, unknown> & { actuaciones?: Record<string, unknown>[] }
    datos.actuaciones = (caso.actuaciones ?? []).map(a => ({ ...a.toJSON(), semaforo: a.estado === 'CERRADA' ? null : semaforoDe(a) }))
    // D24: la PQRS ligada a esta tutela, o la tutela de la que nace esta PQRS
    const relacionados = await Caso.findAll({
      where: { [Op.or]: [{ casoRelacionadoId: caso.id }, ...(caso.casoRelacionadoId ? [{ id: caso.casoRelacionadoId }] : [])] },
      attributes: ['id', 'numeroInterno', 'radicado', 'tipoSolicitud', 'estado'],
      include: [{ model: Actuacion, attributes: ['id', 'etapa', 'estado', 'fechaLimiteEntrega', 'tipoPeticion'] }]
    })
    res.json({ caso: datos, correos, archivos, relacionados, tiposPeticion: TIPOS_PETICION, pqrsActivo: parametro<boolean>('AMBITO_PQRS_ACTIVO'), motivosCierre: flujo.MOTIVOS_CIERRE, sentidos: SENTIDOS_POR_INSTANCIA, tiposEscrito: TIPOS_ESCRITO, envio: modoEnvio(), almacen: proveedorAlmacen() })
  } catch (error) {
    responderError(res, error)
  }
})

// Línea de tiempo (bitácora, correos, documentos y alertas), del más reciente al más antiguo
router.get('/:id/historial', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    res.json(await lineaTiempo(Number(req.params.id)))
  } catch (error) {
    responderError(res, error)
  }
})

// =====================================
// ACTUACIONES
// =====================================
const CAMPOS_EDITABLES = [
  'fechaNotificacion', 'terminoValor', 'terminoUnidad', 'fechaVencimientoInformada', 'criticidad',
  'auxiliarId', 'revisorId', 'equipoId', 'requiereInsumos', 'loQueSePide', 'estado', 'responsableCumplimiento', 'origenImpugnacion'
] as const
const CAMBIAN_PLAZOS = new Set(['fechaNotificacion', 'terminoValor', 'terminoUnidad', 'fechaVencimientoInformada', 'criticidad', 'requiereInsumos'])
const CAMBIAN_RESPONSABLE = ['auxiliarId', 'revisorId', 'equipoId']

router.patch('/actuaciones/:id',
  param('id').isInt(),
  body('terminoUnidad').optional({ values: 'null' }).isIn(UNIDADES_TERMINO),
  body('estado').optional().isIn(ESTADOS_ACTUACION),
  body('criticidad').optional().isIn(CRITICIDADES),
  body('fechaNotificacion').optional({ values: 'null' }).isISO8601(),
  body('fechaVencimientoInformada').optional({ values: 'null' }).isISO8601(),
  manejarErroresEntrada,
  async (req, res) => {
    try {
      const actuacion = await Actuacion.findByPk(Number(req.params.id))
      if (!actuacion) throw new ErrorNegocio('La actuación no existe', 404)
      exigirResponsable(req, actuacion)
      // Repartir excepcionalmente es del coordinador (roles del cliente)
      if (CAMBIAN_RESPONSABLE.some(c => c in req.body) && !tieneRol(req, ROLES.COORDINADOR)) throw new ErrorNegocio('Solo el coordinador reasigna responsables', 403)
      const cambios: Record<string, unknown> = Object.fromEntries(CAMPOS_EDITABLES.filter(c => c in req.body).map(c => [c, req.body[c] === '' ? null : req.body[c]]))
      // Nuevo auxiliar sin equipo ni revisor indicados: los de su equipo
      if (cambios.auxiliarId && !('equipoId' in cambios)) {
        const auxiliar = await Usuario.findByPk(Number(cambios.auxiliarId), { attributes: ['id', 'equipoId'] })
        if (!auxiliar) throw new ErrorNegocio('El auxiliar no existe')
        cambios.equipoId = auxiliar.equipoId
        if (!('revisorId' in cambios)) cambios.revisorId = await revisorDeEquipo(auxiliar.equipoId)
      }
      // La criticidad puesta a mano no la cambia el recálculo
      if ('criticidad' in cambios) cambios.criticidadFuente = 'MANUAL'
      if (cambios.estado === 'CERRADA') cambios.fechaCierre = new Date()
      await actuacion.update(cambios)
      if (Object.keys(cambios).some(c => CAMBIAN_PLAZOS.has(c))) await recalcularPlazos(actuacion.id)
      res.json(await Actuacion.findByPk(actuacion.id))
    } catch (error) {
      responderError(res, error)
    }
  })

// Eliminar una actuación registrada por error (asignación duplicada, mal digitada). Solo si no se ha
// entregado nada a la entidad: lo entregado es parte del servicio y se cierra, no se borra. Si era la
// única actuación, se va el caso. El correo de la asignación vuelve a la bandeja para registrarlo bien
router.delete('/actuaciones/:id', requiereRol(ROLES.COORDINADOR), param('id').isInt(),
  body('motivo').isString().trim().notEmpty().withMessage('Indique por qué se elimina'), manejarErroresEntrada,
  async (req, res) => {
    try {
      const actuacion = await Actuacion.findByPk(Number(req.params.id), { attributes: ['id', 'casoId', 'etapa'] })
      if (!actuacion) throw new ErrorNegocio('La actuación no existe', 404)
      const entregados = await Escrito.count({ where: { actuacionId: actuacion.id, fechaEntregaEntidad: { [Op.ne]: null } } })
      if (entregados) throw new ErrorNegocio('Ya se entregó un escrito a la entidad: la actuación se cierra con su causal, no se elimina')
      const casoId = actuacion.casoId
      const otras = await Actuacion.count({ where: { casoId, id: { [Op.ne]: actuacion.id } } })
      // Los correos de la asignación vuelven a la bandeja; los demás quedan solo sin asociar
      await Correo.update({ estado: 'POR_REGISTRAR', casoId: null, actuacionId: null, proposito: null }, { where: { actuacionId: actuacion.id, proposito: 'ASIGNACION', direccion: 'ENTRANTE' } })
      await Correo.update({ actuacionId: null, ...(otras ? {} : { casoId: null }) }, { where: { actuacionId: actuacion.id } })
      await Alerta.destroy({ where: { actuacionId: actuacion.id } })
      // El hook de la bitácora registra la eliminación; el motivo va aparte
      await actuacion.destroy()
      if (otras) {
        await HistorialCaso.create({
          casoId, actuacionId: null, seccion: 'ACTUACION', accion: 'ELIMINADO',
          cambios: [{ campo: 'Motivo de la eliminación', antes: null, despues: String(req.body.motivo).trim().slice(0, 500) }],
          usuarioId: req.usuario!.id, nombreUsuario: req.usuario!.nombre, origen: 'Casos'
        })
      }
      if (!otras) {
        await Alerta.destroy({ where: { casoId } })
        await Correo.update({ casoId: null }, { where: { casoId } })
        await Archivo.update({ casoId: null }, { where: { casoId } })
        await HistorialCaso.destroy({ where: { casoId } })
        await Caso.destroy({ where: { id: casoId } })
      }
      res.json({ ok: true, casoEliminado: !otras })
    } catch (error) {
      responderError(res, error)
    }
  })

// El auxiliar toma la actuación y empieza a revisar el expediente
router.post('/actuaciones/:id/asumir', param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    const actuacion = await Actuacion.findByPk(Number(req.params.id))
    if (!actuacion) throw new ErrorNegocio('La actuación no existe', 404)
    // Sin auxiliar asignado, cualquier auxiliar puede tomarla
    if (actuacion.auxiliarId) exigirResponsable(req, actuacion)
    if (actuacion.estado !== 'POR_ASUMIR') throw new ErrorNegocio('La actuación ya fue asumida')
    const auxiliarId = actuacion.auxiliarId ?? req.usuario!.id
    const cambios: Record<string, unknown> = { estado: 'EN_ANALISIS', fechaAsumida: new Date(), auxiliarId }
    if (!actuacion.auxiliarId) {
      cambios.equipoId = req.usuario!.equipoId ?? null
      cambios.revisorId = actuacion.revisorId ?? await revisorDeEquipo(req.usuario!.equipoId ?? null)
    }
    await actuacion.update(cambios)
    res.json(actuacion)
  } catch (error) {
    responderError(res, error)
  }
})

// =====================================
// FLUJO DEL ESCRITO
// =====================================
type Paso = (req: Request, a: Actuacion) => Promise<unknown>

// Carga la actuación, revisa el permiso y responde con el resultado del paso
const paso = (permiso: 'RESPONSABLE' | 'REVISOR', fn: Paso) => async (req: Request, res: Response) => {
  try {
    const a = await Actuacion.findByPk(Number(req.params.id))
    if (!a) throw new ErrorNegocio('La actuación no existe', 404)
    if (permiso === 'REVISOR') exigirRevisor(req, a)
    else exigirResponsable(req, a)
    res.json((await fn(req, a)) ?? { ok: true })
  } catch (error) {
    responderError(res, error)
  }
}

const fechaOpcional = (v: unknown) => (v ? new Date(String(v)) : null)

// Correo libre: el borrador (asunto y destinatarios sugeridos) y el envío
router.get('/actuaciones/:id/borrador-correo', param('id').isInt(), manejarErroresEntrada,
  async (req, res) => {
    try {
      const a = await Actuacion.findByPk(Number(req.params.id))
      if (!a) throw new ErrorNegocio('La actuación no existe', 404)
      exigirResponsable(req, a)
      res.json(await borradorLibre(a.id))
    } catch (error) {
      responderError(res, error)
    }
  })

router.post('/actuaciones/:id/correo', param('id').isInt(), body('buzon').isIn(BUZONES), body('para').isArray({ min: 1 }).withMessage('Indique a quién va el correo'),
  body('asunto').isString().trim().notEmpty().withMessage('Falta el asunto'), body('cuerpo').isString().trim().notEmpty().withMessage('Falta el mensaje'), manejarErroresEntrada,
  paso('RESPONSABLE', async (req, a) => {
    await enviarLibre({
      actuacionId: a.id, buzon: req.body.buzon, para: req.body.para, cc: req.body.cc ?? [], asunto: req.body.asunto, cuerpo: req.body.cuerpo,
      responderACorreoId: req.body.responderACorreoId ? Number(req.body.responderACorreoId) : null, usuarioId: req.usuario!.id
    })
  }))

router.post('/actuaciones/:id/datos-faltantes', param('id').isInt(), body('detalle').isString().trim().notEmpty().withMessage('Indique qué datos faltan'), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.solicitarDatosFaltantes({ actuacionId: a.id, detalle: req.body.detalle, para: req.body.para, usuarioId: req.usuario!.id })))

router.post('/actuaciones/:id/insumos', param('id').isInt(), body('insumos').isArray({ min: 1 }).withMessage('Indique al menos un insumo'), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.solicitarInsumos({ actuacionId: a.id, insumos: req.body.insumos, usuarioId: req.usuario!.id })))

router.post('/actuaciones/:id/insumos/recibidos', param('id').isInt(), body('insumoIds').isArray(), body('fecha').optional({ values: 'falsy' }).isISO8601(), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.confirmarInsumos({
    actuacionId: a.id, insumoIds: req.body.insumoIds.map(Number), correoId: req.body.correoId ? Number(req.body.correoId) : null,
    fecha: fechaOpcional(req.body.fecha), enviarAcuse: !!req.body.enviarAcuse, usuarioId: req.usuario!.id
  })))

router.post('/actuaciones/:id/revision', param('id').isInt(), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.enviarARevision({ actuacionId: a.id, usuarioId: req.usuario!.id })))

router.post('/actuaciones/:id/devolver-auxiliar', param('id').isInt(), body('observacion').isString(), manejarErroresEntrada,
  paso('REVISOR', (req, a) => flujo.devolverAlAuxiliar({ actuacionId: a.id, observacion: req.body.observacion, usuarioId: req.usuario!.id })))

router.post('/actuaciones/:id/entregar', param('id').isInt(), manejarErroresEntrada,
  paso('REVISOR', async (req, a) => { await flujo.entregar({ actuacionId: a.id, usuarioId: req.usuario!.id }) }))

router.post('/actuaciones/:id/respuesta', param('id').isInt(),
  body('tipo').isIn(['ACUSE', 'APROBACION', 'DEVOLUCION']),
  body('devolucion.tipo').if(body('tipo').equals('DEVOLUCION')).isIn(flujo.TIPOS_DEVOLUCION).withMessage('Indique el tipo de devolución'),
  body('fecha').optional({ values: 'falsy' }).isISO8601(),
  manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.registrarRespuesta({
    actuacionId: a.id, tipo: req.body.tipo, correoId: req.body.correoId ? Number(req.body.correoId) : null,
    fecha: fechaOpcional(req.body.fecha), devolucion: req.body.devolucion, usuarioId: req.usuario!.id
  })))

router.post('/actuaciones/:id/radicacion', param('id').isInt(), body('fecha').isISO8601().withMessage('Indique la fecha de radicación'), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.registrarRadicacion({ actuacionId: a.id, fecha: new Date(req.body.fecha), usuarioId: req.usuario!.id })))

router.post('/actuaciones/:id/cerrar', requiereRol(ROLES.COORDINADOR, ROLES.ASISTENTE, ROLES.REVISOR), param('id').isInt(), body('motivo').isString(), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.cerrarActuacion({ actuacionId: a.id, motivo: req.body.motivo })))

// ── PQRS ligada a la tutela por derecho de petición (D24) ──
router.post('/:id/pqrs-ligada', requiereRol(ROLES.ASISTENTE, ROLES.COORDINADOR), param('id').isInt(),
  body('radicado').isString().trim().notEmpty().withMessage('Indique el radicado de la petición'),
  body('tipoPeticion').isIn(Object.keys(TIPOS_PETICION)).withMessage('Indique el tipo de petición'),
  body('fechaRadicacionPeticion').optional({ values: 'falsy' }).isISO8601(), manejarErroresEntrada,
  async (req, res) => {
    try {
      res.status(201).json(await crearPqrsLigada({
        casoId: Number(req.params.id), radicado: req.body.radicado, tipoPeticion: req.body.tipoPeticion,
        fechaRadicacionPeticion: req.body.fechaRadicacionPeticion || null, observaciones: req.body.observaciones ?? null, usuarioId: req.usuario!.id
      }))
    } catch (error) {
      responderError(res, error)
    }
  })

// ── Fallos (D12, D13): se registran aunque la actuación esté cerrada ──
router.post('/actuaciones/:id/decision', param('id').isInt(), body('instancia').isIn(INSTANCIAS), body('sentido').isString(),
  body('fechaDecision').optional({ values: 'falsy' }).isISO8601(), body('fechaNotificacion').optional({ values: 'falsy' }).isISO8601(), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => registrarDecision({
    actuacionId: a.id, instancia: req.body.instancia, sentido: req.body.sentido, fechaDecision: req.body.fechaDecision || null,
    fechaNotificacion: req.body.fechaNotificacion || null, notificadaPorCorreo: req.body.notificadaPorCorreo === true, usuarioId: req.usuario!.id
  })))

// D29: el acta de seguimiento acredita que la sanción o la vulneración se debió solo a la entrega
// tardía del escrito: el caso no causa remuneración. Lo marca el coordinador
router.patch('/decisiones/:id', requiereRol(ROLES.COORDINADOR), param('id').isInt(), body('sancionAtribuible').isBoolean(), manejarErroresEntrada, async (req, res) => {
  try {
    const decision = await Decision.findByPk(Number(req.params.id))
    if (!decision) throw new ErrorNegocio('El fallo no existe', 404)
    if (decision.favorable !== false) throw new ErrorNegocio('Solo un fallo desfavorable puede tener sanción atribuible')
    res.json(await decision.update({ sancionAtribuible: req.body.sancionAtribuible === true }))
  } catch (error) {
    responderError(res, error)
  }
})

// La entidad pidió el memorial por otro canal: el coordinador abre el cumplimiento sin esperar el correo
router.post('/decisiones/:id/cumplimiento', requiereRol(ROLES.COORDINADOR), param('id').isInt(), manejarErroresEntrada, async (req, res) => {
  try {
    res.json(await abrirCumplimiento({ decisionId: Number(req.params.id), usuarioId: req.usuario!.id }))
  } catch (error) {
    responderError(res, error)
  }
})

export default router
