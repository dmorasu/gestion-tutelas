# Nodex Tutelas: resumen técnico para continuar

_Actualizado: 2026-11-10 (noche) · rama `desarrollo`_

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
- `catalogos.ts`: Juzgado, MotivoDevolucion, DiaNoHabil (con `medioDia`), Parametro, RadicadoOtroOperador (archivo maestro, judicial o PQRS), SincronizacionBuzon (delta y tamaño de cada buzón), PlantillaCorreo.
- `casos.ts`: Caso (radicado judicial o de PQRS, `numeroInterno` GPA-AAAA-NNNNN, `porDerechoPeticion` y `casoRelacionadoId` de la PQRS ligada), Parte, Actuacion (etapa, estado, criticidad, vencimiento informado o calculado, fecha límite ANS, auxiliar, revisor, equipo, datos faltantes pendientes, tipo de petición), SolicitudInsumo (con `fechaLimite` del cliente), Escrito (versiones V1, V2…, estado, enlace, `limiteAns` al entregar), Devolucion (tipo, plazo de corrección, extemporánea), RadicacionJuzgado, Decision (sentido, favorable, término de impugnación, cumplimiento pendiente o ligado, sanción atribuible).
- `correos.ts`: Correo (buzón, lo leído del asunto, enlaces, `porRevisar`, `responsableId`, aviso sin atender), **EnlaceCorreo** (enlaces de SharePoint como pendientes), Archivo (SharePoint o local: `ruta`, `itemId`, `webUrl`, `adjuntoGraphId`), HistorialCaso (bitácora).
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

**Correo y buzones** (`services/buzon/`):

| Archivo | Qué hace |
|---|---|
| `graph.ts` | Cliente de Graph con la credencial de la app; ids inmutables en los buzones; `enviarCorreo(buzon, …)` |
| `sincronizarBuzon.ts` | Consulta delta de los tres buzones; guarda correo, adjuntos y enlaces; lee el asunto; asocia por hilo, número interno o radicado; mide el tamaño de cada buzón |
| `correosSalida.ts` | Plantillas con marcadores, envío desde el buzón de su función, vista previa, prueba, correo libre; modo simulado |
| `disenoCorreo.ts` | HTML corporativo (tablas y estilos en línea para Outlook) con el logo de la firma incrustado (`backend/recursos/logo-correo.png`, 16 KB) |
| `atencion.ts` | Qué está "por atender" y el aviso al coordinador de asignaciones con más de 30 minutos sin registrar |
| `enlaces.ts` | Enlaces de SharePoint del correo: traerlos (Graph `/shares` o descarga directa), subirlos a mano o descartarlos |
| `limpiezaBuzon.ts` | Quita del buzón los adjuntos con copia verificada en SharePoint |

**Utilidades** (`utils/`): `asunto.ts` (lee `[Prefijo] [Criticidad] [Radicado] [Actuación] [Vence: …]` en cualquier orden y con o sin tildes), `radicado.ts`, `fechaColombia.ts` (UTC-5 fijo), y las de contraseñas e intentos de login copiadas de Nodex.

**Rutas** (`routes/`):
- `authRouter`: login, me (con `equipoId`), cambiar contraseña, salir.
- `correosRouter`: bandeja (`POR_ATENDER`, `MIOS`, `ASOCIADO`, `DESCARTADO`), detalle con sugerencias y contexto, registrar, asociar con propósito, tomar, trasladar, soltar, enlaces (descargar, subir, descartar), datos faltantes recibidos, atendido, descartar, estado de los buzones, sincronizar.
- `casosRouter`: listado con filtros, resumen del inicio, registro manual, búsqueda por radicado, detalle (con relacionados), historial, fallos (`POST /actuaciones/:id/decision`, `PATCH /decisiones/:id`, `POST /decisiones/:id/cumplimiento`), PQRS ligada (`POST /:id/pqrs-ligada`), PATCH de actuación, asumir, borrador y envío de correo libre, y los pasos del flujo (`POST /actuaciones/:id/{datos-faltantes|insumos|insumos/recibidos|revision|devolver-auxiliar|entregar|respuesta|radicacion|cerrar|correo}`).
- `catalogosRouter`: ámbito de PQRS, parámetros, días no hábiles, juzgados, motivos, usuarios, equipos e integrantes, plantillas (con vista previa y prueba).
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
- Solo el coordinador reasigna responsables de un caso, entrega junto con el revisor, emite alertas y genera informes. El asistente toma y traslada correos.

## Frontend (`frontend/`)

- Diseño de Nodex Gastos (login partido, encabezado con menús agrupados, inicio con tarjetas) y del detalle de trámites de Nodex (pestañas, `components/ui/Seccion` y `Dato`, historial en línea de tiempo).
- **Color grafito (slate).** Ámbar solo para advertencias ("Supuesto", pendientes, "Sin asignar", semáforo próximo).
- Menú: Inicio · Correos · Casos · **Seguimiento** (Tablero diario, Indicadores ANS, Alertas, Informes) · **Configuración** (Equipos, Plantillas de correo, Archivo maestro, Parámetros, Usuarios).

Pantallas:

| Ruta | Qué hay |
|---|---|
| `inicio` | Saludo, módulos con pendientes en vivo, semáforo, etapas, criticidad y estado de los buzones |
| `correos` | Bandeja de trabajo: por atender (qué falta, quién lo atiende, espera en rojo a los 30 min), mis pendientes, asociados, descartados; uso de cada buzón |
| `correos/[id]` | Barra de quién lo atiende (tomar, trasladar, soltar), el correo, enlaces de SharePoint, registro por pasos, asociar a cualquier caso, descartar, atender respuestas |
| `casos` | Listado con número interno, criticidad, equipo y semáforo |
| `casos/nuevo` | Un caso a mano (formulario por pasos con resumen), varios casos (Excel o radicados de un correo) o una PQRS (con el ámbito activo) |
| `casos/[id]` | Pestañas Actuación (`PanelTrabajo`), Información, Documentos, Correos, Historial (`?tab=…&actuacion=id`) y columna de plazos y responsables |
| `tablero` | Tablero de la operación (mismas vistas que Power BI); descuentos internos |
| `seguimiento`, `indicadores`, `alertas`, `informes`, `asistencia` | Tablero diario por perfil, ANS por periodo, alertas por emitir, informes en Excel, asistencia del equipo |
| `equipos`, `plantillas`, `archivo-maestro`, `parametros`, `usuarios` | Configuración |

## Estado (2026-11-10)

**Hecho:**
- Bloque 1: tres buzones, asunto normalizado, número interno, criticidad, roles y equipos, reparto por equipo, plantillas y acuse.
- Bloque 2: expediente en SharePoint, flujo completo del escrito, asignación manual, en Excel y desde un correo con varios radicados, correo libre, expediente del juzgado pedido al cliente.
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

**Probado** con datos temporales (borrados después): flujo completo del escrito de V1 a cierre, cargue de 30 casos en Excel, 3 radicados de un correo, respuestas identificadas por hilo, número interno o radicado, alertas, ANS, informes, archivo maestro, bandeja (tomar, trasladar, enlaces, aviso). Pantallas revisadas con capturas de Chrome sin ventana y permisos por perfil.

**Sin probar** (necesitan 365): lectura y envío reales por Graph, SharePoint (subir, mover, compartir, descargar enlaces del cliente), medición y limpieza de los buzones, y el worker con Redis.

**En la base `gpa_legal`:** el administrador, los 4 equipos sin integrantes, los parámetros, las plantillas en borrador, los medios días de diciembre, las vistas `tablero.*` y los 2 casos de prueba del 2026-11-09 (GPA-2026-00001 y 00002; la secuencia quedó en 2). Hay un registro de archivo huérfano (id 18, un informe semanal cuyo informe y archivo se borraron por error en una limpieza): se puede eliminar.

**Al probar:** borrar solo por id lo que crea la prueba (el usuario usa la app al mismo tiempo), devolver la secuencia del número interno al mayor que exista, y no cargar el archivo maestro en la base real (reemplaza la tabla). Los scripts de prueba van fuera de `backend/src`, porque un archivo nuevo ahí reinicia el nodemon.

## Pendientes

Lo que dependía del desarrollo está hecho. Falta:

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
