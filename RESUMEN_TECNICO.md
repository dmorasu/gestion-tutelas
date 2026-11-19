# Nodex Tutelas: resumen técnico para continuar

_Actualizado: 2026-11-19 · rama `desarrollo`_

App para recibir, repartir, trabajar, entregar y medir las tutelas, acciones de cumplimiento y PQRS que una entidad le asigna a la firma (GPA, Gómez Pineda Abogados). El cliente que origina el proyecto es la SDM, pero **la app no la nombra**: en pantalla y en el código es "la entidad". En pantalla se llama **Nodex Tutelas** y el pie dice "GPA Legal".

La app está completa en funciones (bloques 1 a 3, bandeja de trabajo, respuestas D1–D30: fallos, tablero para Power BI, descuentos, asistencia y PQRS) y probada con envío de correo **simulado** y almacenamiento **local**. Falta conectarla a Microsoft 365 y montar el servidor de producción (guía lista).

Documentos:
- `Docs/PLAN.md`: qué cambió con la información del cliente, flujo por buzón, bloques, respuestas a D1–D30 y lo que sigue abierto (§5), decisiones (SharePoint, no SendGrid) y el límite de 50 GB de los buzones.
- `Docs/CONFIGURAR_BUZON_M365.md`: guía para el administrador de 365 (tres buzones, app de Entra, política de acceso, sitio de SharePoint, retención).
- `Docs/tablero/POWER_BI.md` y `USUARIO_LECTURA.sql`: vistas del tablero, conexión de Power BI y usuario de solo lectura.
- `Docs/PRODUCCION.md`: servidor, PM2 (`ecosystem.config.cjs`), Nginx con HTTPS, variables y verificación antes de abrir.
- Fuentes del cliente (no se modifican): `Docs/Flujo proceso - sabana.xlsx`, `Docs/informacion_correo.txt`, `Docs/cuerpo_correo_informacion_2.txt` y el manual operativo v1.1 (`Docs/20261103_Manual_Operativo_…docx`) y las respuestas a las dudas (`Docs/Dudas TI .docx`).
- Manual de funcionamiento para leer (no técnico): documento "Nodex Tutelas · Cómo funciona" en claude.ai.

## Arquitectura

Independiente de Nodex (repositorio, backend, base y servidor propios), con el mismo stack y el mismo diseño.

| Pieza | Dónde | Puerto | Tecnología / estado |
|---|---|---|---|
| API | `backend/` | 4100 | Express 5 + Sequelize-typescript + Postgres. `npm run dev` (nodemon) |
| Worker | `backend/src/worker.ts` | — | BullMQ + Redis, proceso aparte (`npm run worker`). Ver "Tareas programadas" |
| Frontend | `frontend/` | 3100 | Next 16.4 (Turbopack) + React 19 + Tailwind 3 + headlessui + lucide |
| Base | Postgres de Nodex (10.0.4.4), base **`gpa_legal`** | 5432 | Usuario de desarrollo de Nodex por ahora |
| Redis | el de cada equipo, `REDIS_DB=5` (Nodex usa 0) | 6379 | Solo el worker y el botón "Leer buzón ahora" |
| Correo | Microsoft Graph sobre **tres buzones**: asignaciones, insumos y entregas | — | **Sin configurar**: los correos de salida quedan "simulados" |
| Documentos | **SharePoint** (sitio de los expedientes, Graph con `Sites.Selected`) | — | **Sin configurar**: en desarrollo van a `backend/almacen-local` (en `.gitignore`) |

Los puertos no chocan con Nodex (4000, 3000-3002).

**Arranque del backend** (`server.ts`): `activarHistorialCasos()` → `authenticate` → se quitan las vistas del tablero → `db.sync({ alter: true })` fuera de producción (en producción `sync()` y los ALTER idempotentes de `config/ajustesEsquema.ts`) → `sembrarBase()` → `cargarCalendario` → se recrean las vistas del tablero y se refresca la foto del ANS (cada 30 min). La semilla es idempotente: roles, parámetros, plantillas (actualiza los borradores que nadie editó), los 4 equipos iniciales si no hay ninguno, la secuencia del número interno y el número de los casos que no lo tengan. Contra la base remota el arranque tarda cerca de un minuto. Si algo falla imprime "Falló la conexión a la base de datos" y **el servidor sigue arriba**: revisar el log. Una columna nueva en una tabla existente se agrega también en `ajustesEsquema.ts`; las vistas se quitan antes del sync porque Postgres no deja alterar columnas que usa una vista.

## Reglas del proyecto

Las de `CLAUDE.md` (no se negocian): app aparte de Nodex, login propio (Entra solo para buzones y SharePoint), no nombrar a la SDM, color grafito (ámbar solo para advertencias), sin textos de ayuda bajo los títulos, reglas de plazos en la tabla `parametros`, código y comentarios en español, validar con `npx tsc --noEmit` y `npx eslint .`, rama `desarrollo`.

Convenciones heredadas de Nodex:
- Errores de negocio con `ErrorNegocio(msg, status)` y `responderError`; validaciones con express-validator y `manejarErroresEntrada`.
- Frontend: `fetchApi`/`obtener` (`src/lib/api.ts`) con el token de la cookie; server actions que devuelven `{ ok, datos | errores }`. Lo que sube archivos va por **route handlers** (`app/archivos/subir`, `app/cargues/analizar`, `app/correos-enlaces/[id]/subir`, `app/seguimiento/archivo-maestro`): las server actions tienen un límite de tamaño.
- Listados con includes y límite: un `$anidado$` en el `where` superior falla; se busca primero y se filtra por ids. Al incluir un `belongsTo` dentro de otro include con `attributes`, incluir la llave foránea.
- `{...instancia}` de Sequelize no copia los valores: pasar los campos uno a uno (error real en `recalcularPlazos`, corregido).
- No correr `next build` con el servidor de desarrollo encendido (daña `.next`).
- Imágenes de `public/`: para reemplazar una, cambiarle el nombre (caché).

## Modelo de datos (`backend/src/models`)

- `usuarios.ts`: **Equipo** (va antes de Usuario: los decoradores leen su tipo al cargar), Usuario (con `equipoId` y `capacidadDiaria`), Rol, UsuarioRol.
- `catalogos.ts`: Juzgado, MotivoDevolucion, DiaNoHabil (con `medioDia`), Parametro, RadicadoOtroOperador (archivo maestro, judicial o PQRS), SincronizacionBuzon (delta y tamaño de cada buzón), PlantillaCorreo, **ItemCatalogo** (catálogos editables: `DERECHO`, `TIPO_RESPUESTA` e `INSUMO`, la matriz de insumos por grupo y clase documento/información; `supuesto` hasta que la firma lo confirme; `codigo` para los ítems con regla, como `EMERGENCIA`). La semilla (`seeds/catalogosBase.ts`) carga cada catálogo solo si está vacío.
- `casos.ts`: Caso (radicado judicial o de PQRS, `numeroInterno` GPA-AAAA-NNNNN, `porDerechoPeticion` y `casoRelacionadoId` de la PQRS ligada, `fechaFacturacion` = primera asignación del radicado, `radicadosAlternos` y `numerosInternosAlternos` de los casos que se le unieron), **CasoRelacion** (pareja de casos: `MISMO_PROCESO`, `TEMERIDAD` o `ANTECEDENTE`; sugerida, confirmada o descartada), Parte, Actuacion (etapa, estado, criticidad, vencimiento informado o calculado, fecha límite ANS, auxiliar, revisor, equipo, datos faltantes pendientes, tipo de petición), SolicitudInsumo (con `fechaLimite` del cliente), Escrito (versiones V1, V2…, estado, enlace, `limiteAns` al entregar), Devolucion (tipo, plazo de corrección, extemporánea), RadicacionJuzgado, Decision (sentido, favorable, término de impugnación, cumplimiento pendiente o ligado, sanción atribuible).
- `correos.ts`: Correo (buzón, lo leído del asunto, enlaces, `porRevisar`, `responsableId`, aviso sin atender), **EnlaceCorreo** (enlaces de SharePoint como pendientes), Archivo (SharePoint o local: `ruta`, `itemId`, `webUrl`, `adjuntoGraphId`), HistorialCaso (bitácora automática por hooks), **NotaCaso** (notas de las personas: autor, etapa opcional, texto; no se editan ni se borran).
- `seguimiento.ts`: Alerta (tipo, detección, plazo y emisión), Informe (semanal o mensual, con su Excel y resumen), AnsPeriodo (foto mensual del ANS con nivel y descuento) y Asistencia (por persona y día).

## Backend (`backend/src`)

**Servicios** (`services/`):

| Archivo | Qué hace |
|---|---|
| `constantes.ts` | Roles, etapas, criticidades, buzones, estados, plantillas (con su buzón y título) |
| `parametros.ts` | `PARAMETROS_BASE` en caché de 1 minuto; los que respondió el cliente llevan `fuente` y reemplazan el supuesto si nadie lo editó |
| `plazos.ts` | Asignación efectiva (corte 15:00), vencimiento (horas pasadas a días hábiles), criticidad (§13), fecha límite (ANS-01/03 con mínimo de días, ANS-02 para lo crítico; vence a las 15:00), ANS suspendido mientras faltan datos de la asignación, semáforo |
| `calendario.ts`, `utils/diasHabiles.ts` | Festivos de Colombia, días no hábiles por etapa y medios días (24 y 31 de diciembre valen medio para los ANS) |
| `registroCasos.ts` | `registrarAsignacion` (caso con número interno, actuación, reparto y plazos en una transacción; después los adjuntos al expediente y el acuse) y `recalcularPlazos` |
| `reparto.ts` | Auxiliar con menos carga entre los equipos de la etapa (respeta capacidad diaria) y el revisor de su equipo |
| `flujoEscritos.ts` | Datos faltantes, insumos, escrito por versiones, revisión, entrega, respuesta de la entidad, radicación y cierre |
| `expediente.ts` | Carpetas del caso en SharePoint y paso de los adjuntos de la bandeja al expediente (`destinoAdjuntos`) |
| `almacenamiento.ts` | SharePoint por Graph (subir, leer, mover, compartir con vencimiento, verificar) o carpeta local |
| `cargueExcel.ts` | Excel o CSV sin estructura fija: emparejamiento sugerido, registro por tandas, acuse único |
| `permisosActuacion.ts` | Quién puede cada paso y `alcanceActuaciones` (qué ve cada perfil) |
| `historialCasos.ts`, `lineaTiempo.ts` | Bitácora por hooks y la línea de tiempo del caso (bitácora, correos, documentos y alertas) |
| `indicadores.ts` | ANS por periodo con reglas y exclusiones del manual, y tablero diario |
| `alertas.ts` | Detección (términos, desacato, insumos vencidos, duplicidad) y emisión al cliente |
| `informes.ts` | Excel semanal y mensual (con relación para la factura) |
| `archivoMaestro.ts` | Radicados judiciales o PQRS de otro operador o equipo (D26), marca de casos y ANS-13 |
| `fallos.ts` | Fallo: favorable según D13, término de impugnación (D5), cumplimiento pendiente (D12) y abrirlo a mano |
| `pqrs.ts` | PQRS ligada a la tutela por derecho de petición (D24) |
| `tablero.ts` | Vistas `tablero.*` (Power BI) y `tablero_interno.*`, foto mensual del ANS con descuentos, datos de la pantalla |
| `descuentos.ts` | Nivel y descuento por ANS, tope mensual y reincidencia (D29) |
| `asistencia.ts` | Asistencia diaria, ANS-11 y aviso de reducción del equipo (D27) |
| `relacionesCasos.ts` | Casos que pueden ser el mismo: sugerencias (raíz de 21 dígitos del radicado, mismo documento del accionante, radicado casi igual con el mismo despacho, mismo nombre sin documento), confirmar o descartar con bitácora en los dos casos, relacionar a mano, **unir casos** (coordinador) y `dondeRadicado`/`dondeNumeroInterno`, que buscan también los alternos |
| `facturacion.ts` | Relación para la factura: cada radicado una vez, en el mes de su `fechaFacturacion`; el mismo proceso confirmado se factura con el que llegó primero; temeridad y antecedentes se facturan cada uno |
| `documentosWord.ts` | Word con el formato de la firma: llena las plantillas de `backend/recursos/plantillas` (marcadores `{clave}`). **Ficha técnica** (casillas, filas nuevas de tipo de respuesta y resumen de los hechos), que se genera sola al entregar y a pedido (`POST /casos/actuaciones/:id/ficha`); **solicitud del expediente al despacho** (modelo 1.1), que va adjunta a la solicitud de datos faltantes y queda en Soportes. Las plantillas salen de los Word de `Docs/insumos` con `Docs/herramientas/plantillas-word.ts` (volver a correrlo si la firma cambia un modelo) |
| `cierreDia.ts` | Cierre del día: lo que movió cada persona (desde los cambios de estado de la bitácora), respondidas frente a su capacidad diaria y tiempo de respuesta por caso |

**Correo y buzones** (`services/buzon/`):

| Archivo | Qué hace |
|---|---|
| `graph.ts` | Cliente de Graph con la credencial de la app; ids inmutables en los buzones; `enviarCorreo(buzon, …)` |
| `sincronizarBuzon.ts` | Consulta delta de los tres buzones; guarda correo, adjuntos y enlaces; lee el asunto; asocia por hilo, número interno o radicado; mide el tamaño de cada buzón |
| `correosSalida.ts` | Plantillas con los textos de los modelos de la firma (`Docs/insumos`): asunto `CRITICIDAD - RAD. radicado - ACTUACIÓN - vence - TIPO`, con `PREFIJO_ASUNTO` adelante si tiene valor; `{{ficha}}` ubica el bloque de datos (estado, radicado, número interno, accionante, despacho, actuación, vencimiento; en las entregas, también elaboró, revisó, versión y fecha). Los borradores sin editar se actualizan solos al arrancar. Envío desde el buzón de su función, vista previa, prueba, correo libre; modo simulado |
| `disenoCorreo.ts` | HTML corporativo (tablas y estilos en línea para Outlook) con el logo de la firma incrustado (`backend/recursos/logo-correo.png`, 16 KB) |
| `atencion.ts` | Qué está "por atender" y el aviso al coordinador de asignaciones con más de 30 minutos sin registrar |
| `enlaces.ts` | Enlaces de SharePoint del correo: traerlos (Graph `/shares` o descarga directa), subirlos a mano o descartarlos |
| `limpiezaBuzon.ts` | Quita del buzón los adjuntos con copia verificada en SharePoint |

Al asociar un correo por radicado, primero se busca el del asunto y después los del cuerpo y los PDF.

**Utilidades** (`utils/`): `asunto.ts` (lee `[Prefijo] [Criticidad] [Radicado] [Actuación] [Vence: …]` en cualquier orden y con o sin tildes), `radicado.ts`, `fechaColombia.ts` (UTC-5 fijo), y las de contraseñas e intentos de login copiadas de Nodex.

**Rutas** (`routes/`):
- `authRouter`: login, me (con `equipoId`), cambiar contraseña, salir.
- `correosRouter`: bandeja (`POR_ATENDER`, `MIOS`, `ASOCIADO`, `DESCARTADO`), detalle con sugerencias y contexto, registrar, asociar con propósito, tomar, trasladar, soltar, enlaces (descargar, subir, descartar), datos faltantes recibidos, atendido, descartar, estado de los buzones, sincronizar.
- `casosRouter`: listado con filtros, resumen del inicio, registro manual, búsqueda por radicado (con `mismoProceso`: otra instancia o recurso), relaciones (`POST /:id/relaciones`, `PATCH /relaciones/:id`), unir (`POST /:id/unir`), detalle (con relacionados), historial, fallos (`POST /actuaciones/:id/decision`, `PATCH /decisiones/:id`, `POST /decisiones/:id/cumplimiento`), PQRS ligada (`POST /:id/pqrs-ligada`), PATCH de actuación, asumir, borrador y envío de correo libre, y los pasos del flujo (`POST /actuaciones/:id/{datos-faltantes|insumos|insumos/recibidos|revision|devolver-auxiliar|entregar|respuesta|radicacion|cerrar|correo}`).
- `catalogosRouter`: ámbito de PQRS, parámetros, días no hábiles, juzgados, motivos, **ítems de catálogo** (`GET /items?catalogo=&todos=1`, `POST /items`, `PUT /items/:id`; no se borran, se apagan), usuarios, equipos e integrantes, plantillas (con vista previa y prueba).
- `archivosRouter`: ver o descargar; subir al expediente (multer en memoria, 60 MB por archivo).
- `carguesRouter`: analizar Excel, cargar los radicados de un correo, registrar por tandas, acuse del paquete.
- `seguimientoRouter`: tablero diario, ANS, alertas (detectar, emitir, descartar), informes, archivo maestro, asistencia.
- `tableroRouter`: tablero de la operación (lo interno solo para la firma) y refresco del ANS.

**Tareas programadas** (worker, una sola cola, concurrencia 1):
- Cada `BUZON_INTERVALO_SEGUNDOS` (120): leer los buzones y, después, avisar las asignaciones sin atender.
- Cada 30 minutos: detectar alertas.
- 2:00 a. m. (Bogotá): limpiar adjuntos de los buzones.

**Scripts** (`npm run …`): `crear-admin -- correo "Nombre"`, `correo-prueba [-- ETAPA RADICADO HORAS]`, `leer-buzon`, `limpiar-buzon`.

## Acceso y perfiles

- **Login propio** con correo y contraseña (bcrypt). Sin registro público: el administrador crea al usuario y la app muestra la contraseña temporal una sola vez; se cambia al primer ingreso.
- Bloqueo de 15 minutos tras 5 fallos por cuenta (30 por IP). JWT de 10 horas con `versionSesion`.
- Perfiles: ADMIN, COORDINADOR, ASISTENTE (administrativo), AUXILIAR (jurídico), REVISOR y CONSULTA (PST y la entidad: solo el tablero, sin descuentos; el backend le niega todo lo demás). El auxiliar ve lo suyo; el revisor, su equipo y lo que revisa; asistencia, coordinación y administrador, todo.
- El reparto es automático (`REPARTO_AUTOMATICO`). Solo el coordinador escoge a mano auxiliar o revisor al registrar (`responsablesDelRegistro`: a otros perfiles se les ignora) y reasigna cualquier responsable; el revisor reasigna entre los auxiliares de su equipo, sin cambiar equipo ni revisor (`exigirQuienReasigna`). Todo queda en la bitácora.
- Datos faltantes y pedido del expediente: asistente y coordinador. Insumos: el auxiliar de la actuación y su revisor.
- Eliminar una actuación registrada por error (con motivo, solo si no se entregó nada): el coordinador; el asistente, solo mientras está por asumir. Lo que no es caso se descarta desde el correo.
- El coordinador entrega junto con el revisor, emite alertas y genera informes. El asistente toma y traslada correos.

## Frontend (`frontend/`)

- Diseño de Nodex Gastos (login partido, encabezado con menús agrupados, inicio con tarjetas) y del detalle de trámites de Nodex (pestañas, `components/ui/Seccion` y `Dato`, historial en línea de tiempo).
- **Color grafito (slate).** Ámbar solo para advertencias ("Supuesto", pendientes, "Sin asignar", semáforo próximo).
- Menú: Inicio · Correos · Casos · **Seguimiento** (Tablero, Tablero diario, Cierre del día, Indicadores ANS, Alertas, Informes, Asistencia) · **Configuración** (Equipos, Catálogos, Plantillas de correo, Archivo maestro, Parámetros, Usuarios).
- Semáforo: rojo con `SEMAFORO_HORAS_ROJO` horas **o menos** (8, reunión 18-nov), igual en `plazos.semaforo`, el filtro del listado y la vista del tablero.
- Prioridad: casos por fecha límite; la bandeja de correos pendientes pone primero lo crítico o lo que vence dentro del rojo, luego por vencimiento y antigüedad.
- Búsqueda de casos: radicado, número interno, nombre del accionante con las palabras en cualquier orden y documento parcial o con puntos.

Pantallas:

| Ruta | Qué hay |
|---|---|
| `inicio` | Saludo, módulos con pendientes en vivo, semáforo, etapas, criticidad y estado de los buzones |
| `correos` | Bandeja de trabajo: por atender (qué falta, quién lo atiende, espera en rojo a los 30 min), mis pendientes, asociados, descartados; uso de cada buzón |
| `correos/[id]` | Barra de quién lo atiende (tomar, trasladar, soltar), el correo, enlaces de SharePoint, registro por pasos, asociar a cualquier caso, descartar, atender respuestas |
| `casos` | Listado compacto (semáforo, caso y accionante, etapa y estado, criticidad, límite, responsables) con acciones rápidas por fila: ver, editar (modal) y eliminar |
| `casos/nuevo` | Un caso a mano (formulario por pasos con resumen), varios casos (Excel o radicados de un correo) o una PQRS (con el ámbito activo) |
| `casos/[id]` | Pestañas Actuación (`PanelTrabajo`, con la ruta de pasos `componentes/RutaActuacion`: hecho, en curso, pendiente ahora con responsable y plazo, y el último envío con sus documentos), Información (con la PQRS ligada), Documentos, Correos, **Bitácora** (notas de las personas y movimientos en una línea de tiempo; la URL sigue siendo `?tab=historial`) y columna de plazos y responsables |
| `cierre-dia` | Cierre del día (`GET /seguimiento/cierre-dia?dia=`): por persona y por caso, con selector de día |
| `tablero` | Tablero de la operación (mismas vistas que Power BI); descuentos internos |
| `seguimiento`, `indicadores`, `alertas`, `informes`, `asistencia` | Tablero diario por perfil, ANS por periodo, alertas por emitir, informes en Excel, asistencia del equipo |
| `catalogos` | Derechos, tipos de respuesta y matriz de insumos: agregar, renombrar, confirmar el supuesto y apagar |
| `equipos`, `plantillas`, `archivo-maestro`, `parametros`, `usuarios` | Configuración. Usuarios y equipos con el diseño de Nodex: perfiles en columnas, avatar de iniciales, interruptores, menú "⋯" y modales para crear |

## Estado (2026-11-10)

**Hecho:**
- Bloque 1: tres buzones, asunto normalizado, número interno, criticidad, roles y equipos, reparto por equipo, plantillas y acuse.
- Bloque 2: expediente en SharePoint, flujo completo del escrito, asignación manual, en Excel y desde un correo con varios radicados, correo libre. Los insumos los piden solo el auxiliar de la actuación y su revisor; ya no hay botón para pedir el expediente del juzgado.
- Bloque 3: tablero diario, indicadores ANS, alertas, informes y archivo maestro.
- Bandeja de trabajo: por atender, tomar y trasladar, aviso a los 30 minutos y enlaces de SharePoint.
- Diseño: correos corporativos con vista previa, detalle del caso como Nodex, formulario de asignación por pasos.
- Respuestas de las dudas de TI (`Docs/PLAN.md` §5):
  - Parámetros y plazos: corte y fin del día a las 3 p. m., medios días del 24 y el 31, términos en días hábiles, ANS desde los datos completos, devoluciones sin corte.
  - Flujo del fallo: favorable, impugnación, cumplimiento pendiente con alerta, descorre y tipo de escrito.
  - Tablero para Power BI y en la app, con perfil de consulta del cliente.
  - Descuentos por ANS, informes con novedades procesales y bloqueos.
  - Asistencia y ANS-11.
  - PQRS (con el ámbito apagado por parámetro) y PQRS ligada.
  - Archivo maestro de PQRS.
- Producción preparada: ajustes de esquema sin `alter`, PM2 y guía de Nginx.
- Semáforo "Entregado" para lo entregado, aprobado o radicado (ya no cuenta como vencido ni en los contadores).
- Diseño: menú de usuario con avatar, usuarios y equipos al estilo Nodex, casillas en grafito, componentes `ui/Modal` y `ui/Avatar`, clases `.boton-icono`, `.chip` y `.opcion` en `globals.css`.
- Casos: acciones rápidas por fila y `DELETE /casos/actuaciones/:id`.
- Bitácora con notas (`POST /casos/:id/notas`).
- Script de casos de ejemplo: `Docs/herramientas/ejemplos.ts crear | borrar`.

**Probado** con datos temporales (borrados después): flujo completo del escrito de V1 a cierre, cargue de 30 casos en Excel, 3 radicados de un correo, respuestas identificadas por hilo, número interno o radicado, alertas, ANS, informes, archivo maestro, bandeja (tomar, trasladar, enlaces, aviso). Pantallas revisadas con capturas de Chrome sin ventana y permisos por perfil.

**Sin probar** (necesitan 365): lectura y envío reales por Graph, SharePoint (subir, mover, compartir, descargar enlaces del cliente), medición y limpieza de los buzones, y el worker con Redis.

**En la base `gpa_legal`:**
- Usuarios: el administrador (Diego Mora) y Stefany Charria, que todavía no tiene perfiles.
- Los 4 equipos sin integrantes, los parámetros, las plantillas en borrador, los medios días de diciembre y las vistas `tablero.*`.
- Los 2 casos de prueba del 2026-11-09 (GPA-2026-00001 y 00002).
- **24 casos de ejemplo** (GPA-2026-00003 a 00026, 4 por etapa y 4 PQRS ligadas), con 4 juzgados de ejemplo, 2 notas en GPA-2026-00005 y unas 20 alertas.
  - Sus ids están en `Docs/herramientas/salida-ejemplos/ids.json`.
  - Se quitan con `npx ts-node --transpile-only --project tsconfig.json ../Docs/herramientas/ejemplos.ts borrar` desde `backend`, que también devuelve la secuencia.
- La secuencia del número interno está en 26. Hay un registro de archivo huérfano (id 18, un informe semanal cuyo informe y archivo se borraron por error en una limpieza): se puede eliminar.

**Al probar:** borrar solo por id lo que crea la prueba (el usuario usa la app al mismo tiempo), devolver la secuencia del número interno al mayor que exista, y no cargar el archivo maestro en la base real (reemplaza la tabla). Los scripts de prueba van fuera de `backend/src`, porque un archivo nuevo ahí reinicia el nodemon. **No editar el backend mientras el usuario usa la app:** cada cambio reinicia nodemon (cerca de un minuto contra la base remota) y dos reinicios seguidos pueden chocar al recrear las vistas del tablero ("Falló la conexión a la base de datos"). El usuario levanta los servidores a mano.

## Pendientes

**Plan de la reunión del 18-nov** (notas en `Docs/NOTAS NODEX REUNIÓN 18112026[73].docx`, modelos y matriz en `Docs/insumos`). Fases 1 a 5 hechas, y el detalle del caso rediseñado (Actuación con encabezado de indicadores y tarjetas; Información con hechos y derechos primero). **Pendientes:** fase 6 (alertas al cliente en dos cortes al día; en pausa por decisión del usuario el 2026-11-19), fase 7 (tiempos por tramo y productividad diaria) y las plantillas de emergencia y falta de legitimación. Fase 5: etapa excepcional `NULIDAD` (registro manual, Excel o asunto `[NULIDAD]`); ningún equipo la atiende, así que el reparto la da a cualquier auxiliar con cupo; ese auxiliar la clasifica (`POST /casos/actuaciones/:id/clasificar-nulidad`) en una de las cinco etapas (`ETAPAS_PROCESO`), la actuación pasa a esa etapa con `origenNulidad`, se reparte al equipo de la etapa, se recalculan plazos, sus documentos van a la carpeta de la etapa y queda en la bitácora con la nota. No se puede clasificar en una etapa que ya está abierta en el caso ni empezar el escrito antes de clasificar. Fase 4: Fase 4: ficha técnica y solicitud del expediente en Word (`documentosWord.ts`); datos de la entidad y del apoderado en parámetros (`ENTIDAD_NOMBRE_LEGAL`, `ENTIDAD_NIT`, `APODERADO_*`), que hay que llenar. Faltan los modelos de emergencia y falta de legitimación. Fase 3: Fase 3: correos con los modelos; datos faltantes con casillas de la lista general de la matriz (`Actuacion.datosSolicitados`, el ANS corre cuando llega todo lo pedido); insumos de la matriz por grupo (`SolicitudInsumo.itemCatalogoId` y `clase`), que exigen el resumen de los hechos y los derechos del caso (`Caso.resumenHechos`, `Caso.derechosIds`, `PATCH /casos/:id/ficha`); confirmaciones que listan lo que llegó; entrega con documentos entregados y anexos (`Escrito.documentosEntregados` y `anexosEntregados`); tipo de respuesta por actuación (`Actuacion.tipoRespuestaId`); el escrito de emergencia no se empieza ni va a revisión sin insumos pedidos; la observación del revisor se lee en la bitácora; `ENTIDAD_NOMBRE` en parámetros. Antes, fases 1 y 2 (catálogos, semáforo, reasignar, datos faltantes al asistente, eliminar, búsqueda, prioridad; radicado de otra instancia al registrar, casos relacionados con aviso al auxiliar, unir casos, facturación por radicado). La temeridad la propone hoy la app como antecedente: cuando los derechos sean catálogo (fase 4) se sugerirá sola si coinciden. Siguen: 3 correos con los modelos y casillas de la matriz · 4 resumen de hechos, derechos y tipo de respuesta en el caso, ficha técnica y solicitud de expediente en Word · 5 nulidades · 6 alertas en dos cortes · 7 tiempos y productividad. Los modelos de emergencia y falta de legitimación los manda la firma más adelante. Datos de la entidad para los escritos (nombre, NIT, apoderado): parámetros.

**Para mañana (con el usuario):**
- Crear los usuarios reales con perfiles y equipos. Por eso aún no se puede asignar: no hay auxiliares ni revisores.
- Decidir si se agregan **tareas sueltas** dentro del caso, con responsable, vencimiento y aviso (por ejemplo "llamar al juzgado"). Hoy la unidad de trabajo es la actuación y lo demás va en notas de la bitácora.
- Seguir con el diseño estilo Nodex en las pantallas que faltan: detalle del caso, correos, parámetros e informes.
- Decidir si las notas se pueden corregir unos minutos después de escritas (hoy son inmutables).
- Quitar los casos de ejemplo cuando ya no hagan falta.

**Lo demás:**

1. **Microsoft 365** (`Docs/CONFIGURAR_BUZON_M365.md`):
   - Tres buzones: `asignacionsdmc@`, `insumosdmc@` y `entregasdmc@`.
   - App de Entra y política de acceso.
   - Sitio de SharePoint.
   - Después: `npm run leer-buzon`, una entrega de prueba y la descarga de un enlace del cliente.
2. **Servidor de producción** (`Docs/PRODUCCION.md`):
   - Usuario propio de base y `tablero_lectura` para Power BI.
   - PM2, Nginx y HTTPS.
   - Puerta de enlace de Power BI en la red de la oficina.
   - El `next build` del frontend no se ha corrido en esta sesión (el servidor de desarrollo estaba encendido): correrlo antes de publicar.
3. **Configuración en la app:**
   - `FECHA_INICIO_PLAN` (sin ella no se miden ANS-04 ni ANS-11 ni hay descuentos).
   - Destinatarios `CORREOS_*`, con PST (D25).
   - `PREFIJO_ASUNTO`, `VALOR_FACTURA_MENSUAL`.
   - Usuarios, equipos y asistencia.
   - Plantillas definitivas.
   - Activar `AMBITO_PQRS_ACTIVO` cuando el cliente lo pida.
4. **Del cliente** (`Docs/PLAN.md` §5, "Abierto"):
   - Hora del medio día.
   - Días extra por notificación por correo.
   - Si los insumos del escrito suspenden el ANS.
   - Metas definitivas y ANS-09.
   - Lineamientos de fondo.
   - Archivo maestro de PQRS.
   - Política unificada de términos de PQRS.
   - Reglas de ANS-14/15 (PQRS), que la app aún no mide.

## Variables de entorno (`backend/.env`, ver `.env.example`)

| Variable | Para qué |
|---|---|
| `DB_*`, `REDIS_*`, `JWT_SECRET`, `URL_FRONTEND` | Base, cola, sesión y enlaces de los avisos |
| `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET` | App de Entra (solo buzones y SharePoint) |
| `BUZON_ASIGNACIONES`, `BUZON_INSUMOS`, `BUZON_ENTREGAS` | Los tres buzones |
| `BUZON_ACTIVO`, `BUZON_INTERVALO_SEGUNDOS`, `BUZON_LEER_DESDE` | Lectura automática |
| `CORREO_ENVIO_ACTIVO` | `true` = los correos salen de verdad; si no, quedan simulados |
| `SHAREPOINT_SITIO`, `SHAREPOINT_BIBLIOTECA` | Sitio de los expedientes |
| `ALMACEN_LOCAL` | Carpeta de desarrollo sin SharePoint |
| `PREFIJO_ASUNTO` | Solo al crear el parámetro la primera vez |
| `TABLERO_USUARIO_LECTURA` | Usuario de Postgres de Power BI (permisos sobre `tablero.*`) |

En el frontend: `API_URL=http://localhost:4100/api`.

## Continuar en el Mac

Igual que el entorno de Nodex en el Mac: Node v24 en `~/.local/node` y Redis en `~/redis`, sin permisos de administrador.

```bash
git clone https://github.com/dmorasu/gestion-tutelas.git
cd gestion-tutelas && git checkout desarrollo

cd backend && npm ci
cp .env.example .env
#   DB_HOST, DB_USER y DB_PASSWORD: los mismos del Backend/.env de Nodex en el Mac
#   DB_NAME=gpa_legal
#   JWT_SECRET=$(openssl rand -hex 48)
#   BUZON_ACTIVO=false y CORREO_ENVIO_ACTIVO=false hasta tener la configuración de 365
npm run dev        # → "Conexión exitosa a la base de tutelas" y "API de tutelas en el puerto 4100"

cd ../frontend && npm ci
echo "API_URL=http://localhost:4100/api" > .env
npm run dev        # → http://localhost:3100
```

- **Base:** la `gpa_legal` vive en 10.0.4.4, que solo se alcanza desde la red de la oficina o la VPN. Sin acceso, usar un Postgres local, crear la base `gpa_legal` y correr `npm run crear-admin -- correo "Nombre"`. Las tablas se crean solas al arrancar.
- **Contraseña olvidada:** `npm run crear-admin -- dmora@gomezpinedaabogados.com "Diego Mora"` da una temporal nueva.
- **Worker:** Redis (`~/redis/bin/redis-server --daemonize yes --dir ~/redis`; comprobar con `redis-cli ping`), `BUZON_ACTIVO=true` y `npm run worker` en otra terminal.
- **Logo de la app:** `Docs/herramientas/crear_logo.js` (en Mac no existe la fuente Bahnschrift). El logo de la firma va en los correos (`backend/recursos/logo-correo.png`, sacado de `Docs/logogpa.png`).
