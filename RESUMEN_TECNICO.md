# Nodex Tutelas: resumen técnico para continuar

_Actualizado: 2026-11-09_

App para gestionar las tutelas, acciones de cumplimiento y PQRS que una entidad le asigna a la firma (GPA, Gómez Pineda Abogados). El cliente que origina el proyecto es la SDM (Secretaría Distrital de Movilidad), pero **la app no la nombra**: en pantalla y en el código es "la entidad". En pantalla la app se llama **Nodex Tutelas** y en el pie dice "GPA Legal".

Fuentes del negocio:
- `Docs/Flujo proceso - sabana.xlsx`: flujo, campos por etapa, ANS y volumen del plan de choque. Es documento del cliente: no se modifica.
- `Docs/PLAN.md`: fases, modelo y la tabla de **supuestos** en uso (§5).
- `Docs/CONFIGURAR_BUZON_M365.md`: guía para el administrador de 365 (buzón, alias, reglas, app de Entra, política de acceso).

## Arquitectura

Independiente de Nodex (repositorio, backend, base y servidor propios), con el mismo stack y el mismo diseño.

| Pieza | Ruta | Puerto | Tecnología |
|---|---|---|---|
| API | `backend/` | 4100 | Express 5 + Sequelize-typescript + Postgres. `nodemon src/index.ts` |
| Lector del buzón | `backend/src/worker.ts` | — | BullMQ + Redis, proceso aparte (`npm run worker`) |
| Frontend | `frontend/` | 3100 | Next 16.4 (Turbopack) + React 19 + Tailwind 3 + headlessui + lucide |
| Base | servidor Postgres de Nodex (10.0.4.4), base **`gpa_legal`** | 5432 | Usuario de desarrollo de Nodex por ahora |
| Redis | el de cada equipo, `REDIS_DB=5` (Nodex usa 0) | 6379 | Solo el worker y el botón "Leer buzón ahora" |
| Archivos | Azure Blob (contenedor propio) | — | **Sin configurar** aún: los adjuntos quedan con `rutaBlob` null |
| Correo | Microsoft Graph sobre un buzón compartido con 3 alias | — | **Sin configurar** aún (ver la guía de 365) |

Los puertos (4100/3100) no chocan con Nodex (4000, 3000-3002).

**Arranque del backend** (`server.ts`): `activarHistorialCasos()` → `authenticate` → `db.sync({ alter: true })` fuera de producción → `sembrarBase()` (roles y parámetros, idempotente) → `cargarCalendario`. Si algo falla, imprime "Falló la conexión a la base de datos" y **el servidor sigue arriba**: revisar el log. En producción `alter` está apagado: hará falta un mecanismo de ajustes de esquema (ALTER idempotentes, como en Nodex).

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
- `models/`: `usuarios.ts` (Usuario, Rol, UsuarioRol), `catalogos.ts` (Juzgado, MotivoDevolucion, DiaNoHabil, Parametro, RadicadoOtroOperador, SincronizacionBuzon), `casos.ts` (Caso, Parte, Actuacion, SolicitudInsumo, Escrito, Devolucion, RadicacionJuzgado, Decision), `correos.ts` (Correo, Archivo, HistorialCaso).
- `services/`
  - `constantes.ts`: roles, etapas, estados, unidades de término y sentidos de decisión.
  - `parametros.ts`: `PARAMETROS_BASE` con los supuestos D1–D20, en caché de 1 minuto.
  - `plazos.ts`: asignación efectiva (hora de corte), vencimiento judicial (horas, días hábiles o calendario), fecha límite ANS por etapa y semáforo. **Toda regla sale de parámetros.**
  - `calendario.ts` y `utils/diasHabiles.ts`: festivos de Colombia (copiado de Nodex) más la tabla de días no hábiles por etapa (D3).
  - `registroCasos.ts`: `registrarAsignacion` (correo o manual → caso + actuación + reparto + plazos, en transacción) y `recalcularPlazos`.
  - `reparto.ts`: el auxiliar o abogado activo con menos actuaciones abiertas, respetando su capacidad diaria.
  - `historialCasos.ts`: bitácora por hooks (patrón de `historialTramites` de Nodex). El usuario sale de `utils/contextoPeticion.ts`.
  - `buzon/graph.ts`: cliente de Graph con credenciales de la app; `enviarCorreo` crea el borrador para tener el id y el hilo.
  - `buzon/sincronizarBuzon.ts`: consulta delta del inbox; guarda el correo y los adjuntos; busca el radicado en asunto, cuerpo y PDF (3 páginas); toma la etapa del encabezado `X-Tutelas-Etapa` o del alias. `asociarCorreo` empareja por hilo (respuesta de insumos → fecha de recepción) o por radicado.
  - `almacenamiento.ts`: Azure Blob. Sin la cadena de conexión no sube nada.
- `utils/`: `radicado.ts` (23 dígitos con guiones, puntos o espacios), `fechaColombia.ts` (UTC-5 fijo), `politicaContrasena.ts`, `intentosLogin.ts` y `contrasenas.ts` (copiados de Nodex).
- `routes/`:
  - `authRouter` (login, me, cambiar-contraseña, salir);
  - `correosRouter` (bandeja, detalle con sugerencia, registrar, asociar, descartar, estado-buzon, sincronizar);
  - `casosRouter` (tablero con filtros y semáforo, resumen, registro manual, detalle, historial, PATCH de actuación, asumir);
  - `catalogosRouter` (parámetros, días no hábiles, juzgados, motivos, usuarios con contraseña temporal, restablecer y desbloquear);
  - `archivosRouter`.
- `worker.ts` y `queues/buzonQueue.ts`: lectura programada (`upsertJobScheduler`, concurrencia 1).
- `scripts/`:
  - `crearAdmin.ts` (`npm run crear-admin -- correo "Nombre"`);
  - `correoPrueba.ts` (`npm run correo-prueba [-- ETAPA RADICADO]`): simula una asignación con remitente `prueba@nodex.local`;
  - `leerBuzon.ts` (`npm run leer-buzon`): lee el buzón una vez, sin Redis.

### Acceso
- **Login propio** (correo y contraseña con bcrypt). **Los usuarios no entran con Microsoft 365**: el usuario lo pidió explícitamente.
- Sin registro público: el administrador crea al usuario y la app muestra la contraseña temporal una sola vez. Se cambia obligatoriamente al primer ingreso; el middleware bloquea todo menos `/api/auth/*`.
- Bloqueo de 15 minutos tras 5 fallos por cuenta (30 por IP). La IP real llega en `X-IP-Cliente` desde Next.
- JWT de 10 horas con `versionSesion`: cerrar sesión, cambiar contraseña o cambiar perfiles invalida los tokens.
- Perfiles: ADMIN, COORDINADOR, ASISTENTE, AUXILIAR, ABOGADO. Auxiliar y abogado solo ven y editan sus actuaciones.

### Supuestos (dudas D1–D30 sin respuesta del abogado)

Todo lo que define plazos está en la tabla `parametros`, en la pantalla Parámetros, marcado "Supuesto" hasta que se confirme. Cuando llegue una respuesta, se cambia el valor; si cambia el valor por defecto, también en `PARAMETROS_BASE`. **No se reescribe la lógica.**

Valores por defecto:
- corte a las 17:00 y la jornada empieza a las 08:00 (D1);
- el "día hábil siguiente" llega hasta las 23:59 (D2);
- un término en días vence a las 17:00 (D4);
- para impugnar hay 3 días hábiles (D5);
- el ANS cuenta desde el último insumo recibido (D6);
- en impugnación y desacato siempre revisa un abogado (D16);
- semáforo rojo con menos de 4 horas y amarillo con menos de 24.

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
  - las descargas pasan por `app/archivos/[id]/route.ts`.
- **Pantallas:**
  - `inicio`;
  - `correos` y `correos/[id]` (formulario precargado y acciones asociar o descartar);
  - `casos` (tablero) y `casos/[id]` (detalle, `PanelActuacion` editable, historial);
  - `parametros` (editor y días no hábiles);
  - `usuarios`;
  - `auth/login` y `auth/cambiar-contrasena`.
- `AGENTS.md` lo genera `next dev`; se deja en git.

## Estado (2026-11-09)

**Probado:**
- Tipos y lint sin errores en las dos apps, y build de producción del frontend (antes del rediseño; repetirlo con el servidor apagado).
- 17 pruebas del motor de plazos y del radicado.
- 7 pruebas de contraseñas y bloqueo.
- 13 rutas GET con sesión real, más registro, PATCH y asumir con un caso de prueba (borrado después).
- Capturas de todas las pantallas en Edge.

**En la base `gpa_legal`:**
- El administrador `dmora@gomezpinedaabogados.com`.
- Los roles y los 18 parámetros.
- El correo de prueba #1 (acción, por registrar).
- No hay auxiliares ni abogados: crearlos en Usuarios para probar el reparto.

**Sin probar:** lectura real del buzón y envío por Graph (falta la configuración de 365), Azure Blob y el worker con Redis.

## Pendientes y próximos pasos

1. **Infraestructura de 365** (guía en `Docs/CONFIGURAR_BUZON_M365.md`): buzón y alias, reglas `X-Tutelas-Etapa`, app de Entra solo con `Mail.ReadWrite` y `Mail.Send`, y política de acceso limitada al buzón. Después: `npm run leer-buzon`.
2. **Respuestas del abogado** (cuestionario D1–D30). Bloquean el diseño fino D1, D6, D16, D17 y D30.
3. **Botón de registro manual** en pantalla. La API ya existe: `POST /api/casos` con `fechaAsignacion`.
4. **Fase 2:**
   - escritos y versiones, devoluciones (forma o fondo, con motivo);
   - envío de correos desde la app (pedir insumos, entregar al abogado, entregar a la entidad) emparejados por hilo;
   - radicación en el juzgado y decisiones con la regla de favorable (D13);
   - impugnación y cumplimiento;
   - cargue masivo desde Excel y archivo maestro de otros operadores (ANS-13).
5. **Fase 3:** ANS-01 a 13 calculados, alertas tempranas (ANS-08), informes semanal y mensual, asistencia del equipo (ANS-11) y reglas de descuento (D29).
6. **Producción:**
   - servidor propio con Nginx y PM2 (API, worker y frontend);
   - usuario propio de base de datos, no el de Nodex;
   - Azure Blob;
   - `alter` apagado, con ajustes de esquema;
   - HTTPS para la cookie `secure`.
7. Decidir dónde usar el logo de la firma (`Docs/logogpa.png`).

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
#   BUZON_ACTIVO=false hasta tener la configuración de 365
npm run dev        # → "Conexión exitosa a la base de tutelas" y "API de tutelas en el puerto 4100"

cd ../frontend && npm ci
echo "API_URL=http://localhost:4100/api" > .env
npm run dev        # → http://localhost:3100
```

- **Base:** la `gpa_legal` vive en 10.0.4.4, que solo se alcanza desde la red de la oficina o la VPN. Sin acceso, usar un Postgres local (Postgres.app o `brew install postgresql`), crear la base `gpa_legal` y correr `npm run crear-admin -- correo "Nombre"`. Las tablas se crean solas al arrancar.
- **Contraseña olvidada:** `npm run crear-admin -- dmora@gomezpinedaabogados.com "Diego Mora"` da una temporal nueva.
- **Worker:** necesita Redis (`~/redis/bin/redis-server --daemonize yes --dir ~/redis`; comprobar con `redis-cli ping`), `BUZON_ACTIVO=true` y `npm run worker` en otra terminal.
- **Regenerar el logo:** `Docs/herramientas/crear_logo.js`, ver las instrucciones del encabezado. En Mac no existe la fuente Bahnschrift.
