import { Router, type Request, type Response } from 'express'
import { body, param } from 'express-validator'
import { Op, fn, col, where as condicionSql, type WhereOptions } from 'sequelize'
import { Caso, Parte, Actuacion, Juzgado, Usuario, Equipo, SolicitudInsumo, Escrito, Devolucion, Decision, RadicacionJuzgado, Correo, Archivo, HistorialCaso, NotaCaso, Rol, CasoRelacion, ItemCatalogo } from '../models'
import { manejarErroresEntrada } from '../middleware/validacion'
import { requiereRol, tieneRol } from '../middleware/auth'
import { registrarAsignacion, recalcularPlazos } from '../services/registroCasos'
import { revisorDeEquipo } from '../services/reparto'
import { semaforo } from '../services/plazos'
import { parametro } from '../services/parametros'
import { DOCUMENTOS_ENTREGA, DOCUMENTO_DE_ESCRITO, ETAPAS_PROCESO, ROLES, ETAPAS, TIPOS_SOLICITUD, UNIDADES_TERMINO, ESTADOS_ACTUACION, CRITICIDADES, BUZONES, TIPOS_ESCRITO, TIPOS_PETICION, reglaEmergencia } from '../services/constantes'
import { normalizarRadicado, normalizarRadicadoPqrs, raizProceso } from '../utils/radicado'
import { dondeRadicado, sugerirRelaciones, relacionesDe, decidirRelacion, relacionarManual, unirCasos, NOMBRES_RELACION } from '../services/relacionesCasos'
import { TIPOS_RELACION } from '../models/casos'
import { crearPqrsLigada } from '../services/pqrs'
import { exigirResponsable, exigirRevisor, exigirQuienPideInsumos, exigirQuienReasigna, responsablesDelRegistro, alcanceActuaciones } from '../services/permisosActuacion'
import * as flujo from '../services/flujoEscritos'
import { existePlantilla, generarFicha } from '../services/documentosWord'
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
    // Igual que services/plazos.semaforo: el rojo incluye el límite exacto
    case 'ROJO': return { [Op.gte]: new Date(ahora), [Op.lte]: rojo }
    case 'AMARILLO': return { [Op.gt]: rojo, [Op.lt]: amarillo }
    case 'VERDE': return { [Op.gte]: amarillo }
    case 'SIN_FECHA': return { [Op.is]: null }
    default: return undefined
  }
}

const alcance = alcanceActuaciones

// Búsqueda del accionante (reunión 18-nov): el nombre con las palabras en cualquier orden ("Pérez Juan"
// encuentra "Juan Carlos Pérez") y el documento aunque esté a medias o con puntos
const condicionesParte = (q: string): WhereOptions[] => {
  const palabras = q.split(/\s+/).filter(p => p.length >= 2).slice(0, 6)
  const condiciones: WhereOptions[] = [{ nombre: { [Op.iLike]: `%${q}%` } }]
  if (palabras.length > 1) condiciones.push({ [Op.and]: palabras.map(p => ({ nombre: { [Op.iLike]: `%${p}%` } })) })
  const documento = q.replace(/[^0-9a-z]/gi, '')
  // Se comparan los dos sin puntos ni guiones: el documento puede venir guardado como "1.234.567"
  if (documento.length >= 4) condiciones.push(condicionSql(fn('regexp_replace', col('numeroDocumento'), '[^0-9A-Za-z]', '', 'g'), { [Op.iLike]: `%${documento}%` }))
  return condiciones
}

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
          ? Caso.findAll({
            where: {
              [Op.or]: [
                { radicado: { [Op.or]: [...(digitos.length >= 5 ? [{ [Op.like]: `%${digitos}%` }] : []), { [Op.like]: `%${alfanumerico}%` }] } },
                // El radicado de un caso que se unió a este
                { radicadosAlternos: { [Op.overlap]: [digitos, alfanumerico].filter(Boolean) } }
              ]
            },
            attributes: ['id'],
            limit: 500
          })
          : [],
        Caso.findAll({ where: { [Op.or]: [{ numeroInterno: { [Op.iLike]: `%${q}%` } }, { numerosInternosAlternos: { [Op.overlap]: [q.toUpperCase()] } }] }, attributes: ['id'], limit: 500 }),
        Parte.findAll({ where: { [Op.or]: condicionesParte(q) }, attributes: ['casoId'], limit: 500 })
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
      res.status(201).json(await registrarAsignacion(responsablesDelRegistro(req, { ...req.body, correoId: null }), req.usuario!.id))
    } catch (error) {
      responderError(res, error)
    }
  })

// ¿Ya existe el caso? El formulario lo consulta mientras se escribe el radicado
router.get('/radicado/:radicado', async (req, res) => {
  try {
    const texto = String(req.params.radicado)
    const radicado = req.query.tipo === 'PQRS' ? normalizarRadicadoPqrs(texto) : normalizarRadicado(texto)
    const completo = radicado.length === 23 || (req.query.tipo === 'PQRS' && radicado.length >= 4)
    const caso = completo
      ? await Caso.findOne({ where: dondeRadicado(radicado), attributes: ['id', 'numeroInterno', 'radicado', 'estado'], include: [{ model: Actuacion, attributes: ['id', 'etapa', 'estado'] }] })
      : null
    // Reunión 18-nov: el mismo proceso puede llegar con los dos últimos dígitos distintos (otra
    // instancia o recurso). Se avisa para sumar la actuación al caso que ya existe
    const raiz = !caso && req.query.tipo !== 'PQRS' ? raizProceso(radicado) : null
    const mismoProceso = raiz
      ? await Caso.findAll({ where: { radicado: { [Op.like]: `${raiz}%` } }, attributes: ['id', 'numeroInterno', 'radicado', 'estado'], include: [{ model: Actuacion, attributes: ['id', 'etapa', 'estado'] }], limit: 5 })
      : []
    res.json({ caso, mismoProceso })
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
    // Reunión 23-nov: si la etapa admite escrito de emergencia y si ya está el modelo de la firma
    const emergencias = await Promise.all((caso.actuaciones ?? []).map(async a => {
      const regla = reglaEmergencia(caso.tipoSolicitud, a.etapa)
      return regla ? { escrito: regla.escrito, alcance: regla.alcance, modelo: await existePlantilla(regla.plantilla) } : null
    }))
    datos.actuaciones = (caso.actuaciones ?? []).map((a, i) => ({ ...a.toJSON(), semaforo: a.estado === 'CERRADA' ? null : semaforoDe(a), emergencia: emergencias[i] }))
    // D24: la PQRS ligada a esta tutela, o la tutela de la que nace esta PQRS
    const relacionados = await Caso.findAll({
      where: { [Op.or]: [{ casoRelacionadoId: caso.id }, ...(caso.casoRelacionadoId ? [{ id: caso.casoRelacionadoId }] : [])] },
      attributes: ['id', 'numeroInterno', 'radicado', 'tipoSolicitud', 'estado'],
      include: [{ model: Actuacion, attributes: ['id', 'etapa', 'estado', 'fechaLimiteEntrega', 'tipoPeticion'] }]
    })
    const notas = await NotaCaso.count({ where: { casoId: caso.id } })
    // Casos que pueden ser el mismo o antecedentes del accionante (reunión 18-nov). Se buscan también
    // al abrir el caso: así aparecen los de antes de la regla y los que llegaron después de este
    await sugerirRelaciones(caso.id).catch(error => console.error('❌ Relaciones del caso', error))
    const vinculos = await relacionesDe(caso.id)
    res.json({ caso: datos, correos, archivos, relacionados, vinculos, tiposRelacion: NOMBRES_RELACION, documentosEntrega: DOCUMENTOS_ENTREGA, documentoDeEscrito: DOCUMENTO_DE_ESCRITO, notas, tiposPeticion: TIPOS_PETICION, pqrsActivo: parametro<boolean>('AMBITO_PQRS_ACTIVO'), motivosCierre: flujo.motivosDeCierre(caso.tipoSolicitud), sentidos: SENTIDOS_POR_INSTANCIA, tiposEscrito: TIPOS_ESCRITO, envio: modoEnvio(), almacen: proveedorAlmacen() })
  } catch (error) {
    responderError(res, error)
  }
})

// Notas de las personas en la bitácora. Escribe quien trabaja el caso: asistencia y coordinación,
// o el auxiliar o revisor de alguna de sus actuaciones (las mismas reglas de lo que ve cada perfil)
router.post('/:id/notas', param('id').isInt(), body('texto').isString().trim().isLength({ min: 1, max: 4000 }).withMessage('Escriba la nota (hasta 4.000 caracteres)'),
  body('actuacionId').optional({ values: 'null' }).isInt(), manejarErroresEntrada,
  async (req, res) => {
    try {
      const casoId = Number(req.params.id)
      const actuacionId = req.body.actuacionId ? Number(req.body.actuacionId) : null
      const visibles = await Actuacion.count({ where: { casoId, ...alcance(req) } })
      if (!visibles) throw new ErrorNegocio('Este caso no está a su cargo', 403)
      if (actuacionId && !(await Actuacion.count({ where: { id: actuacionId, casoId } }))) throw new ErrorNegocio('La etapa no es de este caso')
      res.status(201).json(await NotaCaso.create({ casoId, actuacionId, usuarioId: req.usuario!.id, nombreUsuario: req.usuario!.nombre, texto: String(req.body.texto).trim() }))
    } catch (error) {
      responderError(res, error)
    }
  })

// Resumen de los hechos y derechos (reunión 18-nov): los registra quien trabaja el caso (sobre todo el
// auxiliar, que lee la tutela). Van en la ficha técnica y en el correo de insumos
router.patch('/:id/ficha', param('id').isInt(), body('resumenHechos').optional({ values: 'null' }).isString().isLength({ max: 4000 }).withMessage('El resumen va hasta 4.000 caracteres'),
  body('derechosIds').optional().isArray(), manejarErroresEntrada,
  async (req, res) => {
    try {
      const casoId = Number(req.params.id)
      if (!tieneRol(req, ROLES.ASISTENTE, ROLES.COORDINADOR) && !(await Actuacion.count({ where: { casoId, ...alcance(req) } }))) throw new ErrorNegocio('Este caso no está a su cargo', 403)
      const caso = await Caso.findByPk(casoId)
      if (!caso) throw new ErrorNegocio('El caso no existe', 404)
      const cambios: Record<string, unknown> = {}
      if ('resumenHechos' in req.body) cambios.resumenHechos = String(req.body.resumenHechos ?? '').trim() || null
      if (req.body.derechosIds) {
        const ids = [...new Set((req.body.derechosIds as unknown[]).map(Number).filter(Boolean))]
        if ((await ItemCatalogo.count({ where: { id: ids, catalogo: 'DERECHO' } })) !== ids.length) throw new ErrorNegocio('Algún derecho no está en el catálogo')
        cambios.derechosIds = ids
      }
      await caso.update(cambios)
      res.json({ ok: true })
    } catch (error) {
      responderError(res, error)
    }
  })

// ── Casos relacionados (reunión 18-nov) ──
// Deciden y relacionan quienes trabajan el caso (las mismas reglas de las notas): el auxiliar es quien
// valora el antecedente (por ejemplo, para alegar temeridad)
const exigirQuienTrabajaCaso = async (req: Request, casoId: number) => {
  if (!(await Actuacion.count({ where: { casoId, ...alcance(req) } }))) throw new ErrorNegocio('Este caso no está a su cargo', 403)
}

router.post('/:id/relaciones', param('id').isInt(), body('otro').isString().trim().notEmpty().withMessage('Escriba el número interno o el radicado del otro caso'),
  body('tipo').isIn(TIPOS_RELACION), body('nota').optional({ values: 'null' }).isString().isLength({ max: 2000 }), manejarErroresEntrada,
  async (req, res) => {
    try {
      await exigirQuienTrabajaCaso(req, Number(req.params.id))
      res.status(201).json(await relacionarManual({ casoId: Number(req.params.id), otro: req.body.otro, tipo: req.body.tipo, nota: req.body.nota, usuario: { id: req.usuario!.id!, nombre: req.usuario!.nombre } }))
    } catch (error) {
      responderError(res, error)
    }
  })

router.patch('/relaciones/:id', param('id').isInt(), body('estado').isIn(['CONFIRMADA', 'DESCARTADA']), body('tipo').optional({ values: 'null' }).isIn(TIPOS_RELACION),
  body('nota').optional({ values: 'null' }).isString().isLength({ max: 2000 }), manejarErroresEntrada,
  async (req, res) => {
    try {
      const r = await CasoRelacion.findByPk(Number(req.params.id), { attributes: ['casoId', 'relacionadoId'] })
      if (!r) throw new ErrorNegocio('La relación no existe', 404)
      // Basta con trabajar uno de los dos casos
      await exigirQuienTrabajaCaso(req, r.casoId).catch(() => exigirQuienTrabajaCaso(req, r.relacionadoId))
      res.json(await decidirRelacion({ relacionId: Number(req.params.id), estado: req.body.estado, tipo: req.body.tipo, nota: req.body.nota, usuario: { id: req.usuario!.id!, nombre: req.usuario!.nombre } }))
    } catch (error) {
      responderError(res, error)
    }
  })

// Unir otro caso a este (eran el mismo proceso): solo el coordinador
router.post('/:id/unir', requiereRol(ROLES.COORDINADOR), param('id').isInt(), body('otroCasoId').isInt(),
  body('motivo').isString().trim().notEmpty().withMessage('Indique por qué se unen los casos'), manejarErroresEntrada,
  async (req, res) => {
    try {
      res.json(await unirCasos({ principalId: Number(req.params.id), absorbidoId: Number(req.body.otroCasoId), motivo: req.body.motivo, usuario: { id: req.usuario!.id!, nombre: req.usuario!.nombre } }))
    } catch (error) {
      responderError(res, error)
    }
  })

// Línea de tiempo (notas, bitácora, correos, documentos y alertas), del más reciente al más antiguo
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
  'auxiliarId', 'revisorId', 'equipoId', 'requiereInsumos', 'loQueSePide', 'estado', 'responsableCumplimiento', 'origenImpugnacion', 'tipoRespuestaId'
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
      const cambios: Record<string, unknown> = Object.fromEntries(CAMPOS_EDITABLES.filter(c => c in req.body).map(c => [c, req.body[c] === '' ? null : req.body[c]]))
      const reasigna = CAMBIAN_RESPONSABLE.filter(c => c in cambios && cambios[c] !== actuacion[c as 'auxiliarId'])
      const auxiliar = reasigna.includes('auxiliarId') && cambios.auxiliarId
        ? await Usuario.findByPk(Number(cambios.auxiliarId), { attributes: ['id', 'equipoId', 'activo'], include: [{ model: Rol, attributes: ['codigo'], through: { attributes: [] } }] })
        : null
      if (reasigna.length) {
        if (cambios.auxiliarId && !(auxiliar?.activo && auxiliar.roles?.some(r => r.codigo === ROLES.AUXILIAR))) throw new ErrorNegocio('Escoja un auxiliar jurídico activo')
        exigirQuienReasigna(req, actuacion, Object.fromEntries(reasigna.map(c => [c, cambios[c]])), auxiliar?.equipoId)
      } else {
        // Lo que no cambia no se reescribe (el formulario manda todos los campos)
        for (const c of CAMBIAN_RESPONSABLE) delete cambios[c]
      }
      // Nuevo auxiliar sin equipo ni revisor indicados: los de su equipo
      if (auxiliar && !('equipoId' in cambios)) {
        cambios.equipoId = auxiliar.equipoId
        if (!('revisorId' in cambios)) cambios.revisorId = await revisorDeEquipo(auxiliar.equipoId)
      }
      // El tipo de respuesta sale del catálogo (reunión 18-nov)
      if (cambios.tipoRespuestaId && !(await ItemCatalogo.count({ where: { id: Number(cambios.tipoRespuestaId), catalogo: 'TIPO_RESPUESTA' } }))) throw new ErrorNegocio('Tipo de respuesta no válido')
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
// Reunión 18-nov: el asistente también elimina lo que no era un caso, pero solo antes de que alguien
// lo asuma (después ya hay trabajo del auxiliar y lo decide el coordinador)
router.delete('/actuaciones/:id', requiereRol(ROLES.COORDINADOR, ROLES.ASISTENTE), param('id').isInt(),
  body('motivo').isString().trim().notEmpty().withMessage('Indique por qué se elimina'), manejarErroresEntrada,
  async (req, res) => {
    try {
      const actuacion = await Actuacion.findByPk(Number(req.params.id), { attributes: ['id', 'casoId', 'etapa', 'estado'] })
      if (!actuacion) throw new ErrorNegocio('La actuación no existe', 404)
      if (!tieneRol(req, ROLES.COORDINADOR) && actuacion.estado !== 'POR_ASUMIR') throw new ErrorNegocio('Ya la asumió el auxiliar: la elimina el coordinador', 403)
      const entregados = await Escrito.count({ where: { actuacionId: actuacion.id, fechaEntregaEntidad: { [Op.ne]: null } } })
      if (entregados) throw new ErrorNegocio('Ya se entregó un escrito a la entidad: la actuación se cierra con su causal, no se elimina')
      const casoId = actuacion.casoId
      const otras = await Actuacion.count({ where: { casoId, id: { [Op.ne]: actuacion.id } } })
      // Los correos de la asignación vuelven a la bandeja; los demás quedan solo sin asociar
      await Correo.update({ estado: 'POR_REGISTRAR', casoId: null, actuacionId: null, proposito: null }, { where: { actuacionId: actuacion.id, proposito: 'ASIGNACION', direccion: 'ENTRANTE' } })
      await Correo.update({ actuacionId: null, ...(otras ? {} : { casoId: null }) }, { where: { actuacionId: actuacion.id } })
      await Alerta.destroy({ where: { actuacionId: actuacion.id } })
      // Las notas de esa etapa se quedan en el caso, sin etapa
      await NotaCaso.update({ actuacionId: null }, { where: { actuacionId: actuacion.id } })
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
        await NotaCaso.destroy({ where: { casoId } })
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
const paso = (permiso: 'RESPONSABLE' | 'REVISOR' | 'INSUMOS', fn: Paso) => async (req: Request, res: Response) => {
  try {
    const a = await Actuacion.findByPk(Number(req.params.id))
    if (!a) throw new ErrorNegocio('La actuación no existe', 404)
    if (permiso === 'REVISOR') exigirRevisor(req, a)
    else if (permiso === 'INSUMOS') exigirQuienPideInsumos(req, a)
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

// Datos faltantes y expediente (reunión 18-nov): los pide la asistencia administrativa, no el auxiliar
// items: los marcados de la lista general de la matriz; otros: lo que no está en la lista, una línea por ítem
router.post('/actuaciones/:id/datos-faltantes', requiereRol(ROLES.ASISTENTE, ROLES.COORDINADOR), param('id').isInt(),
  body('items').optional().isArray(), body('otros').optional({ values: 'null' }).isString().isLength({ max: 4000 }), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.solicitarDatosFaltantes({
    actuacionId: a.id, items: (req.body.items ?? []).map(String), otros: req.body.otros ?? req.body.detalle ?? null, para: req.body.para,
    adjuntarExpediente: req.body.adjuntarExpediente !== false, usuarioId: req.usuario!.id
  })))

// Nulidad (reunión 18-nov): quien la tiene decide en qué etapa queda y el caso pasa al equipo de esa etapa
router.post('/actuaciones/:id/clasificar-nulidad', param('id').isInt(), body('etapa').isIn(ETAPAS_PROCESO).withMessage('Indique la etapa en que queda'),
  body('nota').optional({ values: 'null' }).isString().isLength({ max: 2000 }), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.clasificarNulidad({ actuacionId: a.id, etapa: req.body.etapa, nota: req.body.nota, usuario: { id: req.usuario!.id!, nombre: req.usuario!.nombre } })))

// Ficha técnica del caso en Word (modelo de la firma), a pedido: queda en la carpeta del escrito vigente
router.post('/actuaciones/:id/ficha', param('id').isInt(), manejarErroresEntrada,
  paso('RESPONSABLE', async (req, a) => {
    const archivo = await generarFicha({ actuacionId: a.id, usuarioId: req.usuario!.id })
    return { id: archivo.id, nombre: archivo.nombre }
  }))

router.post('/actuaciones/:id/insumos', param('id').isInt(), body('insumos').isArray({ min: 1 }).withMessage('Indique al menos un insumo'), manejarErroresEntrada,
  paso('INSUMOS', (req, a) => flujo.solicitarInsumos({ actuacionId: a.id, insumos: req.body.insumos, usuarioId: req.usuario!.id })))

router.post('/actuaciones/:id/insumos/recibidos', param('id').isInt(), body('insumoIds').isArray(), body('fecha').optional({ values: 'falsy' }).isISO8601(), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.confirmarInsumos({
    actuacionId: a.id, insumoIds: req.body.insumoIds.map(Number), correoId: req.body.correoId ? Number(req.body.correoId) : null,
    fecha: fechaOpcional(req.body.fecha), enviarAcuse: !!req.body.enviarAcuse, usuarioId: req.usuario!.id
  })))

// Reunión 23-nov: al enviar a revisión el auxiliar completa la ficha técnica (hechos, derechos y
// petición al despacho) y la ficha se genera con eso
router.post('/actuaciones/:id/revision', param('id').isInt(),
  body('ficha.resumenHechos').optional({ values: 'null' }).isString().isLength({ max: 4000 }).withMessage('El resumen va hasta 4.000 caracteres'),
  body('ficha.derechosIds').optional().isArray(), body('ficha.peticionIds').optional().isArray(),
  body('ficha.loQueSePide').optional({ values: 'null' }).isString().isLength({ max: 4000 }), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.enviarARevision({ actuacionId: a.id, ficha: req.body.ficha, usuarioId: req.usuario!.id })))

// Escrito de emergencia con el modelo de la firma (reunión 23-nov): exige insumos pedidos y deja
// pendiente el alcance
router.post('/actuaciones/:id/emergencia', param('id').isInt(), manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.generarEmergencia({ actuacionId: a.id, usuarioId: req.usuario!.id })))

router.post('/actuaciones/:id/devolver-auxiliar', param('id').isInt(), body('observacion').isString(), manejarErroresEntrada,
  paso('REVISOR', (req, a) => flujo.devolverAlAuxiliar({ actuacionId: a.id, observacion: req.body.observacion, usuarioId: req.usuario!.id })))

router.post('/actuaciones/:id/entregar', param('id').isInt(), body('documentos').optional().isArray(), body('anexos').optional().isArray(),
  body('otroDocumento').optional({ values: 'null' }).isString().isLength({ max: 500 }), body('otrosAnexos').optional({ values: 'null' }).isString().isLength({ max: 4000 }), manejarErroresEntrada,
  paso('REVISOR', async (req, a) => {
    await flujo.entregar({
      actuacionId: a.id, documentos: (req.body.documentos ?? []).map(String), otroDocumento: req.body.otroDocumento ?? null,
      anexos: (req.body.anexos ?? []).map(String), otrosAnexos: req.body.otrosAnexos ?? null, usuarioId: req.usuario!.id
    })
  }))

router.post('/actuaciones/:id/respuesta', param('id').isInt(),
  body('tipo').isIn(['ACUSE', 'APROBACION', 'DEVOLUCION']),
  body('devolucion.tipo').if(body('tipo').equals('DEVOLUCION')).isIn(flujo.TIPOS_DEVOLUCION).withMessage('Indique el tipo de devolución'),
  body('fecha').optional({ values: 'falsy' }).isISO8601(),
  manejarErroresEntrada,
  paso('RESPONSABLE', (req, a) => flujo.registrarRespuesta({
    actuacionId: a.id, tipo: req.body.tipo, correoId: req.body.correoId ? Number(req.body.correoId) : null,
    fecha: fechaOpcional(req.body.fecha), devolucion: req.body.devolucion, usuarioId: req.usuario!.id
  })))

// La radicación en el juzgado la registra la asistencia administrativa (reunión del 23-nov)
router.post('/actuaciones/:id/radicacion', requiereRol(ROLES.ASISTENTE, ROLES.COORDINADOR), param('id').isInt(), body('fecha').isISO8601().withMessage('Indique la fecha de radicación'), manejarErroresEntrada,
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
