# Nodex Tutelas: resumen técnico para continuar

_Actualizado: 2026-11-09 (noche, bloques 1 y 2 del plan replanteado)_

App para gestionar las tutelas, acciones de cumplimiento y PQRS que una entidad le asigna a la firma (GPA, Gómez Pineda Abogados). El cliente que origina el proyecto es la SDM (Secretaría Distrital de Movilidad), pero **la app no la nombra**: en pantalla y en el código es "la entidad". En pantalla la app se llama **Nodex Tutelas** y en el pie dice "GPA Legal".

Fuentes del negocio:
- `Docs/Flujo proceso - sabana.xlsx`: flujo, campos por etapa, ANS y volumen del plan de choque. Es documento del cliente: no se modifica.
- `Docs/informacion_correo.txt` y `Docs/cuerpo_correo_informacion_2.txt`: roles, los tres buzones, convención de asuntos, informes y equipos (respuesta del cliente).
- `Docs/20261103_Manual_Operativo_…docx`: manual operativo v1.1 (flujo, criticidad, insumos, entregas, devoluciones, ANS). Respondió varias dudas (D1, D16, D19).
- `Docs/PLAN.md`: **plan replanteado** (qué cambió, flujo por buzón, bloques de trabajo, supuestos abiertos y decisiones pendientes).
- `Docs/CONFIGURAR_BUZON_M365.md`: guía para el administrador de 365 (tres buzones, app de Entra, política de acceso).

## Arquitectura

Independiente de Nodex (repositorio, backend, base y servidor propios), con el mismo stack y el mismo diseño.

| Pieza | Ruta | Puerto | Tecnología |
|---|---|---|---|
| API | `backend/` | 4100 | Express 5 + Sequelize-typescript + Postgres. `nodemon src/index.ts` |
| Lector del buzón | `backend/src/worker.ts` | — | BullMQ + Redis, proceso aparte (`npm run worker`) |
| Frontend | `frontend/` | 3100 | Next 16.4 (Turbopack) + React 19 + Tailwind 3 + headlessui + lucide |
| Base | servidor Postgres de Nodex (10.0.4.4), base **`gpa_legal`** | 5432 | Usuario de desarrollo de Nodex por ahora |
| Redis | el de cada equipo, `REDIS_DB=5` (Nodex usa 0) | 6379 | Solo el worker y el botón "Leer buzón ahora" |
| Archivos | **SharePoint** (sitio de los expedientes, Graph con `Sites.Selected`) | — | **Sin configurar** aún: en desarrollo van a `backend/almacen-local` (en `.gitignore`). Azure Blob se retiró |
| Correo | Microsoft Graph sobre **tres buzones** (asignaciones, insumos, entregas) | — | **Sin configurar** aún (ver la guía de 365). Sin él, los correos de salida quedan simulados |

Los puertos (4100/3100) no chocan con Nodex (4000, 3000-3002).

**Arranque del backend** (`server.ts`): `activarHistorialCasos()` → `authenticate` → `db.sync({ alter: true })` fuera de producción → `sembrarBase()` (roles, parámetros, plantillas, equipos iniciales, secuencia y número interno de los casos viejos; idempotente) → `cargarCalendario`. Contra la base remota el arranque tarda cerca de un minuto. Si algo falla, imprime "Falló la conexión a la base de datos" y **el servidor sigue arriba**: revisar el log. En producción `alter` está apagado: hará falta un mecanismo de ajustes de esquema (ALTER idempotentes, como en Nodex).

## Convenciones (las de Nodex)

- Código en español; los comentarios explican el porqué.
- Errores de negocio: `ErrorNegocio(msg, status)` y `responderError` (`utils/errores.ts`). Validaciones con express-validator y `manejarErroresEntrada`.
- Frontend: `fetchApi`/`obtener` (`src/lib/api.ts`) con el token de la cookie; server actions que devuelven `{ ok, datos | errores }`.
- **Diseño sin "aspecto de IA"**: nada de textos de ayuda bajo los títulos (solo datos: totales, conteos). Las tarjetas del inicio sí llevan su descripción corta.
- Listados con includes y límite: un `$anidado$` en el `where` superior falla; se busca primero y se filtra por ids (ver `casosRouter` GET `/`). Al incluir un `belongsTo` dentro de otro include con `attributes`, **incluir la llave foránea** (error real del 2026-11-09: `caso.juzgadoId does not exist`).
- No correr `next build` con el servidor de desarrollo encendido (daña `.next`). Validar con `npx tsc --noEmit` y `npx eslint .`.
- Probar servicios con scripts aislados (`TS_NODE_TRANSPILE_ONLY=1 npx ts-node …`) y borrarlos después.
- Imágenes de `public/`: Next y el navegador las guardan en caché. Para reemplazar una, **cambiarle el nombre**.
- Windows PowerShell: `Set-Content -Encoding UTF8` agrega BOM. Para tocar archivos en bloque, mejor un script de Node.

## Backend (`backend/src`)

- `config/`: `db.ts` (lista explícita de modelos), `redis.ts`, `entra.ts` (**solo para el buzón**).
- `models/`: `usuarios.ts` (Equipo, Usuario, Rol, UsuarioRol; **Equipo va antes de Usuario** porque los decoradores leen su tipo al cargar), `catalogos.ts` (Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon, PlantillaCorreo), `casos.ts` (Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision), `correos.ts` (Correo, Archivo, HistorialCaso).
- `services/`
  - `constantes.ts`: roles, etapas, criticidades, buzones, estados, plantillas, unidades de término y sentidos de decisión.
  - `parametros.ts`: `PARAMETROS_BASE`, en caché de 1 minuto. Los que respondió el cliente llevan `fuente` y reemplazan solos el supuesto si nadie lo editó.
  - `plazos.ts`: asignación efectiva (corte de las 15:00), vencimiento judicial, criticidad (§13), fecha límite ANS (ANS-01/03 con el mínimo de días, ANS-02 para lo crítico) y semáforo. **Toda regla sale de parámetros.**
  - `calendario.ts` y `utils/diasHabiles.ts`: festivos de Colombia (copiado de Nodex) más la tabla de días no hábiles por etapa (D3).
  - `registroCasos.ts`: `registrarAsignacion` (correo o manual → caso con número interno + actuación + reparto + plazos, en transacción; después, el acuse) y `recalcularPlazos`.
  - `reparto.ts`: el auxiliar con menos actuaciones abiertas entre los equipos que atienden la etapa (respetando su capacidad diaria) y el revisor de su equipo.
  - `historialCasos.ts`: bitácora por hooks (patrón de `historialTramites` de Nodex). El usuario sale de `utils/contextoPeticion.ts`.
  - `buzon/graph.ts`: cliente de Graph con credenciales de la app; `enviarCorreo(buzon, …)` crea el borrador (o la respuesta en el hilo) para tener el id y el `conversationId`.
  - `buzon/sincronizarBuzon.ts`: consulta delta del inbox de cada buzón; guarda el correo, adjuntos y enlaces; lee el asunto normalizado (etapa, criticidad, radicado, vencimiento). `asociarCorreo` empareja por hilo (insumos → fecha de recepción; entrega → respuesta "por revisar") o por radicado según el buzón.
  - `buzon/correosSalida.ts`: plantillas con marcadores `{{…}}`, `enviarPlantilla` desde el buzón de su función, `vistaPrevia` y `enviarPrueba`, y modo **simulado** (sin 365 o con `CORREO_ENVIO_ACTIVO` distinto de `true`). Los borradores de la firma que nadie editó se actualizan solos al sembrar.
  - `buzon/disenoCorreo.ts`: HTML corporativo de correo (tablas y estilos en línea para Outlook), logo incrustado por `cid` desde `backend/recursos/logo-correo.png` (16 KB).
  - `buzon/atencion.ts`: qué está "por atender" (por registrar, respuesta por revisar o enlaces pendientes) y el aviso al coordinador de las asignaciones con más de `MINUTOS_ALERTA_SIN_ATENDER` (30) sin registrar, en horario hábil (worker, tras cada lectura).
  - `buzon/enlaces.ts`: enlaces de SharePoint de cada correo (`enlaces_correo`) como pendientes: traerlos por Graph (`/shares`) o como descarga directa (`download=1`, enlaces de "cualquier persona"); si piden iniciar sesión en otra organización, se suben a mano.
  - `buzon/limpiezaBuzon.ts`: quita del buzón los adjuntos con copia verificada en SharePoint (worker diario y `npm run limpiar-buzon`).
  - `almacenamiento.ts`: SharePoint por Graph (subir con sesión de carga si pasa de 4 MB, leer, mover, compartir la carpeta invitando a los destinatarios con vencimiento) o carpeta local.
  - `expediente.ts`: carpetas del caso (`Casos/<número> <radicado>/<etapa>/Entrada|Insumos|Soportes|Escritos/Vn`) y paso de los adjuntos de la bandeja al expediente al asociar.
  - `flujoEscritos.ts`: datos faltantes, insumos (solicitud y confirmación), escrito por versiones, revisión, entrega, respuesta de la entidad (acuse, aprobación, devolución), radicación y cierre.
  - `cargueExcel.ts`: lectura de Excel o CSV sin estructura fija (exceljs), emparejamiento sugerido de columnas, registro por tandas y acuse único del paquete.
  - `permisosActuacion.ts`: quién puede cada paso (auxiliar, revisor del equipo, coordinador) y `alcanceActuaciones` (qué ve cada perfil en tableros y listados).
  - `lineaTiempo.ts`: historial del caso como el de Nodex (bitácora, correos, documentos y alertas, con títulos legibles).
  - `indicadores.ts`: ANS por periodo y tablero diario. `alertas.ts`: detección (worker cada 30 min) y emisión. `informes.ts`: Excel semanal y mensual. `archivoMaestro.ts`: radicados de otros operadores.
- `utils/`: `asunto.ts` (lee `[Prefijo] [Criticidad] [Radicado] [Actuación] [Vence: …]` en cualquier orden y con o sin tildes), `radicado.ts` (23 dígitos con guiones, puntos o espacios), `fechaColombia.ts` (UTC-5 fijo), `politicaContrasena.ts`, `intentosLogin.ts` y `contrasenas.ts` (copiados de Nodex).
- `routes/`:
  - `authRouter` (login, me, cambiar-contraseña, salir);
  - `correosRouter` (bandeja por registrar o por revisar y por buzón, detalle con sugerencia, registrar, asociar, atendido, descartar, estado de los buzones, sincronizar);
  - `casosRouter` (tablero con filtros de criticidad y equipo, resumen, registro manual, detalle, historial, PATCH de actuación, asumir);
  - `catalogosRouter` (parámetros, días no hábiles, juzgados, motivos, usuarios con equipo, equipos y sus integrantes, plantillas);
  - `casosRouter` también tiene los pasos del flujo: `POST /actuaciones/:id/{datos-faltantes|insumos|insumos/recibidos|revision|devolver-auxiliar|entregar|respuesta|radicacion|cerrar}`;
  - `archivosRouter` (ver o descargar; subir al expediente con multer en memoria, hasta 60 MB por archivo);
  - `carguesRouter` (`analizar`, `registrar` por tandas de hasta 50 filas, `acuse`);
  - `seguimientoRouter` (`tablero`, `ans`, `alertas` con detectar, emitir y descartar, `informes`, `archivo-maestro`).
- `worker.ts` y `queues/buzonQueue.ts`: lectura programada (`upsertJobScheduler`, concurrencia 1).
- `scripts/`:
  - `crearAdmin.ts` (`npm run crear-admin -- correo "Nombre"`);
  - `correoPrueba.ts` (`npm run correo-prueba [-- ETAPA RADICADO HORAS]`): simula una asignación con el asunto normalizado y remitente `prueba@nodex.local`;
  - `leerBuzon.ts` (`npm run leer-buzon`): lee los buzones una vez, sin Redis.

### Acceso
- **Login propio** (correo y contraseña con bcrypt). **Los usuarios no entran con Microsoft 365**: el usuario lo pidió explícitamente.
- Sin registro público: el administrador crea al usuario y la app muestra la contraseña temporal una sola vez. Se cambia obligatoriamente al primer ingreso; el middleware bloquea todo menos `/api/auth/*`.
- Bloqueo de 15 minutos tras 5 fallos por cuenta (30 por IP). La IP real llega en `X-IP-Cliente` desde Next.
- JWT de 10 horas con `versionSesion`: cerrar sesión, cambiar contraseña o cambiar perfiles invalida los tokens.
- Perfiles (los del cliente): ADMIN, COORDINADOR, ASISTENTE (administrativo), AUXILIAR (jurídico), REVISOR. El auxiliar ve lo suyo; el revisor, lo de su equipo y lo que revisa; asistencia y coordinación, todo. Reasignar responsables es solo del coordinador ("repartir excepcionalmente").
- Equipos: un revisor y sus auxiliares, con las etapas que atienden. La semilla crea los cuatro del correo del cliente si no hay ninguno.

### Supuestos y respuestas

Todo lo que define plazos está en la tabla `parametros`, en la pantalla Parámetros. Los que confirmó el manual o el correo del cliente aparecen como confirmados; el resto dice "Supuesto". Cuando llegue una respuesta, se cambia el valor; si cambia el valor por defecto, también en `PARAMETROS_BASE` (con `fuente`). **No se reescribe la lógica.** La tabla al día está en `Docs/PLAN.md` §1 y §5.

Confirmados: corte a las 15:00 (D1), revisión de todo escrito (D16), clasificación de devoluciones (D19), criticidad, ANS-01/02/03/06/07 y plazos de la entidad (insumos y devoluciones).

## Frontend (`frontend/`)

- **Diseño copiado de Nodex Gastos:**
  - login partido;
  - encabezado con logo, menú con íconos (Configuración agrupa Parámetros y Usuarios) y menú del usuario;
  - menú lateral en el celular;
  - inicio con saludo en degradado y tarjetas de colores con los pendientes en vivo;
  - avisos con la clase `aviso-nodex`.
- **Color de la app: grafito (slate).** El usuario descartó el ámbar y eligió grafito entre vino, cian y grafito. Trámites es azul, Gastos verde y Tramitadores morado. **El ámbar se usa solo para advertencias:** semáforo "Próximo", "Supuesto", pendientes y "Sin asignar".
- Clases base en `app/globals.css`: `campo`, `etiqueta`, `boton-primario`, `boton-secundario`, `boton-peligro`, `enlace`, `tarjeta`, `titulo-pagina` y `tabla`.
- **Logo:**
  - `public/logo-nodex-tutelas.png`, generado desde el de Gastos con `Docs/herramientas/crear_logo.js`; la fuente grande está en `nodextutelas-original.png`;
  - íconos de la pestaña en `app/icon.png`, `apple-icon.png` y `favicon.ico`;
  - `public/nodex.png` es el logo blanco de Nodex, usado en el panel del login;
  - `Docs/logogpa.png` es el logo de la firma, **aún sin usar**.
- **Sesión:**
  - cookie `TOKEN` (httpOnly) en el dominio del frontend;
  - `src/auth/dal.ts` (`obtenerSesion`, `requiereRol`) redirige a cambiar contraseña si es la temporal;
  - las descargas pasan por `app/archivos/[id]/route.ts` y las subidas por `app/archivos/subir` y `app/cargues/analizar` (route handlers: los escritos pasan del límite de las server actions).
- **Pantallas:**
  - `inicio`;
  - `correos` (por registrar, respuestas por revisar, asociados y descartados, por buzón) y `correos/[id]` (formulario precargado con etapa, criticidad y vencimiento del asunto; asociar, descartar o marcar atendido);
  - `casos` (tablero con número interno, criticidad y equipo) y `casos/[id]` (detalle, `PanelActuacion` editable, correos enviados y simulados, historial);
  - `casos/nuevo` (asignación manual o desde Excel; desde un correo con Excel adjunto abre ya leído);
  - `casos/[id]` con pestañas (`?tab=actuacion|informacion|documentos|correos|historial&actuacion=id`) y columna lateral, como el detalle de trámites de Nodex; componentes en `casos/[id]/componentes` (`HistorialCaso`, `DocumentosCaso`, `CorreosCaso`) y `components/ui/Seccion` y `Dato` copiados de Nodex;
  - en la pestaña Actuación, `PanelTrabajo`: escrito por versiones, revisión, entrega, respuesta, insumos, datos faltantes, radicación y cierre. Los botones siguen las mismas reglas de `permisosActuacion` del backend;
  - en `correos/[id]`, `AtenderRespuesta`: clasificar la respuesta a una entrega, marcar insumos recibidos o confirmar datos faltantes desde el correo;
  - grupo Seguimiento: `seguimiento` (tablero diario por perfil), `indicadores` (ANS por periodo), `alertas` e `informes`; en Configuración, `archivo-maestro`;
  - `equipos` (etapas e integrantes) y `plantillas` (correos de salida), las dos del coordinador;
  - `parametros` (editor y días no hábiles; las listas se escriben separadas por comas);
  - `usuarios` (perfiles y equipo);
  - `auth/login` y `auth/cambiar-contrasena`.
- `AGENTS.md` lo genera `next dev`; se deja en git.

## Estado (2026-11-09, noche)

**Bloque 1:** tres buzones, asunto normalizado, número interno, criticidad, vencimiento informado, roles y equipos, reparto por equipo, plantillas y acuse automático.
**Bloque 2:** expediente en SharePoint, flujo completo del escrito (insumos, datos faltantes, revisión, entregas V1 y V2, respuesta y devoluciones, radicación, cierre), asignación manual y cargue desde Excel.

**Probado** (con datos temporales borrados después; la base quedó como estaba):
- Tipos en las dos apps y lint del frontend sin errores (el backend no tiene eslint).
- Lector del asunto con los formatos de fecha del cliente, sin tildes, en otro orden y en respuestas `RE:`.
- Flujo completo por servicios: los adjuntos pasan de la bandeja al expediente; el ANS queda suspendido mientras se esperan insumos y se reanuda al recibirlos; devolución interna; V1, devolución de fondo con su plazo de corrección, V2 que cierra ese plazo; aprobación, radicación y cierre del caso.
- Por HTTP con usuarios reales de prueba: subir y descargar documentos (también por el proxy del frontend), permisos (el auxiliar no puede entregar), validaciones, respuesta de la entidad que llega por otro hilo al buzón de entregas, asociada por radicado y clasificada desde el correo.
- Excel de 30 filas adjunto a un correo: lectura, emparejamiento automático, registro en tandas y un solo acuse del paquete. Contra la base remota tarda unos 2 s por caso.
- Las 11 pantallas cargan con sesión de coordinador y de auxiliar.
- Se corrigió un error que ya existía: `recalcularPlazos` fallaba al editar notificación o término (`{...instancia}` de Sequelize no copia los valores).

**Después (misma noche):** correos con diseño corporativo y vista previa; identificación de respuestas por número interno; documentos de insumos y de respuestas de la entidad agrupados en el caso; medición del tamaño de los buzones y limpieza de adjuntos. Probado: vista previa (capturas con Chrome sin ventana), respuestas en un hilo nuevo y sin radicado identificadas por el número (también en minúsculas) y archivadas en su carpeta. La limpieza de adjuntos y la medición necesitan Graph real: sin probar.

**Bloque 3 (misma noche):** tablero diario, indicadores ANS, alertas, informes en Excel y archivo maestro. Probado con un escenario de 5 casos (a tiempo, próximo, vencido, desacato y devuelto): alertas sin repetirse, ANS esperados, informes con sus hojas y la relación de facturación, archivo maestro que marca el duplicado y hace saltar ANS-13; pantallas capturadas con Chrome sin ventana (se ven bien) y permisos por perfil. Datos de prueba borrados.

**Cierre del bloque 2 y diseño (misma noche):** expediente del juzgado por datos faltantes, correo libre, varios radicados en un correo, detalle del caso por pestañas con historial estilo Nodex y formulario de asignación por pasos. Probado con un caso completo (línea de tiempo de 27 eventos, pestañas y formularios capturados con Chrome sin ventana) y el registro de 3 radicados de un correo con un solo acuse.

**Bandeja de trabajo (2026-11-10):** correos "por atender" con qué les falta, tomar, trasladar y soltar (`correos.responsableId`, sin asociación al modelo de usuarios porque Correo ya tiene una), aviso de asignaciones sin atender, asociar a cualquier caso con propósito y enlaces de SharePoint como pendientes. Probado con datos temporales (tomar, conflicto al tomar uno ajeno, traslado con nota, Mis pendientes, enlace que no responde, subida a mano, asociación como informativo, aviso simulado) y capturas. La descarga real de enlaces del SharePoint del cliente queda por probar con 365.

**Ojo al probar:** borrar solo por id lo que crea la prueba: el usuario usa la app al mismo tiempo (una limpieza amplia ya borró un informe y un correo suyos). un archivo nuevo en `backend/src` reinicia el `nodemon` (y el arranque contra la base remota tarda cerca de un minuto). Los scripts de prueba, mejor fuera de `src`.

**En la base `gpa_legal`:** el administrador, los 4 equipos sin integrantes, los parámetros, las 8 plantillas en borrador y los 2 casos de prueba de la mañana (GPA-2026-00001 y 00002).

**Sin probar:** Graph real (buzones, envío y SharePoint: falta 365) y el worker con Redis.

## Pendientes y próximos pasos

1. **Infraestructura de 365** (guía en `Docs/CONFIGURAR_BUZON_M365.md`): tres buzones compartidos, app de Entra con `Mail.ReadWrite`, `Mail.Send` y `Sites.Selected`, política de acceso limitada a los tres buzones y permiso de escritura sobre el sitio de SharePoint. Después: `npm run leer-buzon` y una entrega de prueba.
2. **En la app:** escribir `GPA-SDM-PST` en el parámetro `PREFIJO_ASUNTO`, los destinatarios (`CORREOS_INSUMOS`, `CORREOS_ENTREGA`, `CORREOS_COPIA_ENTREGA`), crear revisores y auxiliares y armar los equipos.
3. **En Parámetros para el bloque 3:** `FECHA_INICIO_PLAN` (acta de inicio, para ANS-04 y ANS-10), `CORREOS_ALERTAS` y revisar `META_DIARIA_PLAN`. Del bloque 2 quedan la solicitud de expedientes a juzgados y un correo libre desde el caso.
4. **Decisiones tomadas:** SharePoint como único repositorio y envío por Graph, no por SendGrid (razones en `Docs/PLAN.md` §6). Pendiente: plantillas definitivas del cliente.
5. **Producción:** servidor propio con Nginx y PM2, usuario propio de base, `alter` apagado con ajustes de esquema, HTTPS y `CORREO_ENVIO_ACTIVO=true` cuando las plantillas estén aprobadas.
6. Decidir dónde usar el logo de la firma (`Docs/logogpa.png`).

## Continuar en el Mac

Igual que el entorno de Nodex en el Mac: Node v24 en `~/.local/node` y Redis en `~/redis`, sin permisos de administrador.

```bash
git clone https://github.com/dmorasu/gestion-tutelas.git
cd gestion-tutelas && git checkout desarrollo

cd backend && npm ci
cp .env.example .env
#   DB_HOST, DB_USER y DB_PASSWORD: los mismos del Backend/.env de Nodex en el Mac
#   DB_NAME=gpa_legal
#   JWT_SECRET=$(openssl rand -hex 48)    ← uno propio; solo invalida las sesiones abiertas
#   BUZON_ACTIVO=false y CORREO_ENVIO_ACTIVO=false hasta tener la configuración de 365
npm run dev        # → "Conexión exitosa a la base de tutelas" y "API de tutelas en el puerto 4100"

cd ../frontend && npm ci
echo "API_URL=http://localhost:4100/api" > .env
npm run dev        # → http://localhost:3100
```

- **Base:** la `gpa_legal` vive en 10.0.4.4, que solo se alcanza desde la red de la oficina o la VPN. Sin acceso, usar un Postgres local (Postgres.app o `brew install postgresql`), crear la base `gpa_legal` y correr `npm run crear-admin -- correo "Nombre"`. Las tablas se crean solas al arrancar.
- **Contraseña olvidada:** `npm run crear-admin -- dmora@gomezpinedaabogados.com "Diego Mora"` da una temporal nueva.
- **Worker:** necesita Redis (`~/redis/bin/redis-server --daemonize yes --dir ~/redis`; comprobar con `redis-cli ping`), `BUZON_ACTIVO=true` y `npm run worker` en otra terminal.
- **Regenerar el logo:** `Docs/herramientas/crear_logo.js`, ver las instrucciones del encabezado. En Mac no existe la fuente Bahnschrift.
