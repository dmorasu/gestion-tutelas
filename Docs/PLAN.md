# Plan de construcción: GPA Legal (tutelas)

_Actualizado: 2026-11-09_

## 1. Decisión de arranque

Se construye **sin esperar las respuestas del abogado** (D1 a D30). Cada duda que define un plazo, una regla o un catálogo queda como **parámetro editable** (tabla `parametros`) o **catálogo**, con el valor propuesto como supuesto. Cuando lleguen las respuestas se cambia el valor en la pantalla de Parámetros, sin tocar el código.

Las únicas respuestas que podrían obligar a cambiar el modelo son D16 (revisión de abogado), D18 (varios accionantes) y D12 (actuaciones simultáneas), y el modelo ya contempla los tres casos (ver §4).

## 2. Arquitectura (todo aparte de Nodex)

| Pieza | Tecnología (igual que Nodex) | Dónde |
|---|---|---|
| Backend API | Express 5 + Sequelize-typescript + Postgres | `backend/`, puerto 4100 |
| Lector del buzón | BullMQ + Redis (proceso aparte: `npm run worker`) | `backend/src/workers` |
| Frontend | Next 16 + React 19 + Tailwind | `frontend/`, puerto 3100 |
| Base de datos | Mismo servidor Postgres de Nodex, **base propia** `gpa_legal` | — |
| Redis | El mismo Redis, con `REDIS_DB` propio (no comparte colas con Nodex) | — |
| Archivos | Azure Blob, contenedor propio | — |
| Login | Propio, con correo y contraseña (como Nodex). **No se entra con Microsoft 365** | — |
| Correo | Microsoft Graph sobre un buzón compartido con 3 alias (Entra ID solo para esto) | — |

Piezas copiadas de Nodex y adaptadas: días hábiles de Colombia, historial por hooks con el contexto de la petición (quién hizo el cambio), política de contraseñas, límite de intentos del login, respuesta de errores, estructura de routers, middlewares y servicios.

## 3. Fase 1 (meta: 17-nov-2026, arranque del plan de choque)

Lo mínimo para recibir el volumen sin perder la hora de asignación:

1. **Login propio** (sin registro público, contraseña temporal al crear el usuario) y perfiles: Administrador, Coordinador, Asistente, Auxiliar y Abogado.
2. **Lectura del buzón** cada 2 minutos: guarda cada correo con sus adjuntos y busca el radicado de 23 dígitos en el asunto, el cuerpo y los PDF. Identifica la etapa por el encabezado de la regla de Exchange y, si no lo tiene, por el alias.
3. **Bandeja "Correos por registrar"**: si el radicado no existe, el asistente confirma el formulario precargado. La fecha de asignación es la hora de llegada del correo.
4. **Casos y actuaciones**: una actuación por etapa (acción, impugnación, cumplimiento, requerimiento previo, desacato). Cálculo de vencimiento y fecha límite ANS con los parámetros.
5. **Reparto** al auxiliar con menos carga abierta y asignación manual.
6. **Tablero** con semáforo por tiempo restante.

**Contingencia:** si algo de la infraestructura de 365 no está listo el 17 (registro de la app en Entra, regla de Exchange, permiso sobre el buzón), se trabaja en el Excel y después se carga en la app con el cargue masivo (fase 2). La fecha de asignación del Excel se respeta.

### Fase 2 (diciembre)
Escritos y devoluciones (forma o fondo), envío de correos desde la app (solicitar insumos, entregar al abogado, entregar a la entidad) emparejados por hilo, radicación en el juzgado, decisiones e impugnación, cargue masivo desde Excel y archivo maestro de otros operadores (ANS-13).

### Fase 3 (enero)
ANS-01 a ANS-13 calculados, alertas tempranas (ANS-08), informes semanal y mensual, asistencia del equipo (ANS-11) y reglas de descuento (D29).

### Fase 4 (si se activa el ámbito 2)
PQRS (D21 a D24).

## 4. Modelo de datos

- **Caso** (un radicado): tipo (tutela, acción de cumplimiento, PQRS), juzgado, calidad de la entidad, etapa inicial (no cambia), etapa actual, estado y alerta de otro operador.
- **Parte**: varios accionantes por caso (D18).
- **Actuación**: una por etapa, con fechas de asignación (llegada y efectiva), notificación, término (valor y unidad), vencimiento, fecha límite ANS, auxiliar, abogado y si requiere revisión. Un caso puede tener **varias actuaciones abiertas a la vez** (D12: cumplimiento mientras corre la impugnación).
- **Solicitud de insumos**: una o varias por actuación, con hora de solicitud y de recepción.
- **Escrito** (con versiones) y **devolución** (forma, fondo o sin clasificar, y motivo del catálogo de lineamientos, D19).
- **Radicación en el juzgado** (por correo de constancia o manual con evidencia, D17).
- **Decisión** (instancia, sentido y si es favorable según el parámetro de D13).
- **Correo** y **archivo**: todo lo que entra y sale del buzón, con hilo (`conversationId`).
- **Historial del caso**: cada cambio con quién lo hizo y desde dónde (pantalla, buzón o cargue).
- **Días no hábiles** con las etapas a las que aplican (D3).
- **Parámetros**: los supuestos de abajo.

## 5. Supuestos en uso (cambiar en Parámetros cuando haya respuesta)

| Duda | Supuesto | Parámetro |
|---|---|---|
| D1 Hora de corte | Lo que llega después de las 17:00, o en día no hábil, cuenta como asignado el siguiente día hábil a las 08:00 | `HORA_CORTE_ASIGNACION`, `HORA_INICIO_JORNADA` |
| D2 Fin del día hábil para ANS | Hasta las 23:59 | `HORA_FIN_DIA_ANS` |
| D3 Días no hábiles | Festivos de Colombia más la tabla de días no hábiles, cada uno con las etapas a las que aplica | tabla `dias_no_habiles` |
| D4 Términos | El asistente elige horas, días hábiles o días calendario. Las horas son corridas desde la notificación. El término en días vence a las 17:00 del último día | `HORA_VENCIMIENTO_TERMINO` |
| D5 Impugnación | 3 días hábiles desde el día siguiente a la notificación del fallo | `DIAS_TERMINO_IMPUGNACION` |
| D6 Insumos mínimos | El ANS-02 cuenta desde que llega el último insumo pedido; sin insumos, desde la asignación. Se aplica la misma hora de corte | `ANS_INICIO_CON_INSUMOS` |
| D11 ANS-01 | Meta 95 % | `META_ANS` |
| D13 Favorable | Favorables: Niega, Improcedente, Confirma (si la primera fue favorable) y Revoca (si fue desfavorable). Concede, Concede parcialmente y Modifica son desfavorables | `SENTIDOS_FAVORABLES` |
| D12 Simultáneas | Permitido. Por defecto no se abre cumplimiento mientras corre la impugnación | `CUMPLIMIENTO_DURANTE_IMPUGNACION` |
| D15 Origen de la impugnación | Nace del correo de la entidad al alias de impugnaciones | — |
| D16 Revisión del abogado | Obligatoria en impugnación y desacato. En las demás etapas la marca el asistente | `ETAPAS_REVISION_OBLIGATORIA` |
| D17 Radicación | La constancia llega al buzón y se asocia sola. Si no llega, el asistente la marca y adjunta la evidencia | — |
| D10 Responsable del desacato | Auxiliar proyecta y abogado revisa (según la hoja de Flujo) | (en `ETAPAS_REVISION_OBLIGATORIA`) |
| ANS-01 y ANS-03 | 1 día hábil de antelación al vencimiento | `DIAS_ANTELACION_ANS01`, `DIAS_ANTELACION_ANS03` |
| ANS-02 y ANS-07 | Dentro del día hábil siguiente a la asignación | `DIAS_ANS02`, `DIAS_ANS07` |
| Semáforo | Rojo con menos de 4 horas o vencido; amarillo con menos de 24 horas | `SEMAFORO_HORAS_ROJO`, `SEMAFORO_HORAS_AMARILLO` |

Errores de texto del Excel ya resueltos en el modelo: D7 (fila 61: es la fecha de asignación del cumplimiento), D8, D9 (respuesta a requerimiento) y D10 (una sola fecha de asignación del desacato).

## 6. Lo que hay que pedir a infraestructura (no depende del abogado)

1. **Base de datos** `gpa_legal` en el servidor Postgres, con un usuario propio.
2. **Registro de la app en Entra ID, solo para el buzón** (no para el login): permisos de aplicación `Mail.ReadWrite` y `Mail.Send`, con una **política de acceso de la aplicación** (`New-ApplicationAccessPolicy`) que lo limite al buzón de tutelas.
3. **Buzón compartido** con los alias por etapa y una **regla de flujo de correo** que agregue `X-Tutelas-Etapa: ACCION | IMPUGNACION | CUMPLIMIENTO` según el alias.
4. **Contenedor de Azure Blob** para los adjuntos.
5. **Servidor** propio con Nginx, PM2 y Redis (o el Redis de Nodex con otro `REDIS_DB`).
