# Plan de construcción: Nodex Tutelas · GPA Legal

_Replanteado: 2026-11-09, con el correo de roles y buzones (`Docs/informacion_correo.txt`, `Docs/cuerpo_correo_informacion_2.txt`) y el manual operativo v1.1 (`Docs/20261103_Manual_Operativo_…docx`)._

## 1. Qué cambió con la información del cliente

| Tema | Antes (supuesto) | Ahora (cliente) | En la app |
|---|---|---|---|
| Buzones | Uno compartido con un alias por etapa y reglas de Exchange | **Tres buzones, uno por función**: asignaciones, insumos y entregas | `BUZON_ASIGNACIONES`, `BUZON_INSUMOS`, `BUZON_ENTREGAS`. Ya no hacen falta reglas de transporte |
| Etapa del correo | Por alias o encabezado | **Asunto normalizado**: `[Prefijo] [CRÍTICO/ALTO/ORDINARIO] [Radicado 23] [Actuación] [Vence: fecha y hora]` | `utils/asunto.ts` lee los bloques en cualquier orden; sin asunto normalizado, adivina por el texto y el asistente confirma |
| Identificador | Radicado | Radicado de 23 dígitos **y número interno** | `GPA-AAAA-NNNNN`, secuencia de Postgres, va en el acuse |
| Vencimiento | Calculado con notificación y término | La entidad lo **informa** en el asunto (§12.1) | `fechaVencimientoInformada` manda sobre el cálculo |
| Roles | Asistente, auxiliar, abogado | **Coordinador, revisor, auxiliar jurídico, asistente administrativo** | `ABOGADO` pasó a `REVISOR` |
| Equipos | No existían | **4 equipos** de 1 revisor y 4 auxiliares: 2 de contestaciones, 1 de impugnaciones y cumplimientos, 1 de requerimientos y desacatos. 5 asistentes transversales | Tabla `equipos` con sus etapas; reparto por equipo |
| Revisión (D16) | Solo impugnación y desacato | **Todo escrito** lo revisa el revisor del equipo y él entrega | Se quitó `ETAPAS_REVISION_OBLIGATORIA` |
| Hora de corte (D1) | 17:00 | **15:00**, también para insumos (§3) | Parámetro confirmado |
| Criticidad | No existía | Crítico, alto, ordinario (§13) | Calculada (etapa y horas al vencimiento) o la del asunto, la mayor |
| ANS-01 | 1 día antes del vencimiento | 1 día antes **si median 2 o más días hábiles**; si no, día hábil siguiente (§21) | `DIAS_MINIMOS_ANS01` |
| ANS-02 | Etapas de cumplimiento, requerimiento y desacato | Todo lo **crítico** | Por criticidad |
| Insumos | Reinician el ANS | **Suspenden** el ANS del componente (§12.3); el cliente tiene 2 días hábiles (mismo día si es crítico) | El tablero cae al vencimiento judicial mientras se esperan |
| Devoluciones (D19) | Forma o fondo | **Fondo, falta de soporte, criterio institucional o estilo**; la entidad tiene 2 días hábiles; corregir al día hábil siguiente (§17) | Modelo listo; flujo en el bloque 2 |
| Entrega | Adjunto | **Por enlace** al repositorio (punto 3.2 y §23); sin acuse el mismo día, la constancia de envío vale como recibo | `escritos.enlace`, `fechaAcuse` |
| Plantillas | — | Pendientes del cliente ("en rojo") | Tabla `plantillas_correo` editable; borradores de la firma mientras tanto |

## 2. Flujo por buzón

| Buzón | Entra | Sale (plantilla) | Qué hace la app |
|---|---|---|---|
| Asignaciones | Asignación (individual o en paquete) | Confirmación de recibido con el número interno | Lee el asunto, precarga el registro, reparte y responde en el mismo hilo |
| | Información faltante | Solicitud de datos faltantes y su confirmación | Empareja por hilo; queda "por revisar" |
| Insumos | Insumos del cliente | Solicitud de insumos (matriz de insumos y anexos) y confirmación | La hora de llegada es la recepción del insumo (cuenta para el ANS) |
| Entregas | Acuse, aprobación o devolución | Entrega V1 y V2 (con enlace) | Empareja por hilo o radicado; la devolución se clasifica (tipo y motivo) |

Sin 365 configurado, o con `CORREO_ENVIO_ACTIVO` distinto de `true`, los correos de salida quedan **simulados**: se registran en el caso pero no salen. Así se prueba todo el flujo antes de encender el envío.

## 3. Estados de la actuación

Por asumir → En análisis → (Esperando insumos) → En proyección → Con el revisor → (Ajuste pedido por el revisor) → Entregado → (Devuelto por la entidad → V2) → Aprobado → Radicado → Cerrada.

## 4. Bloques de trabajo

### Bloque 1: cimientos (hecho el 2026-11-09)
- Tres buzones, lector del asunto normalizado y enlaces del cuerpo.
- Número interno, criticidad, vencimiento informado y las reglas ANS-01 y ANS-02 nuevas.
- Roles del cliente, equipos y reparto por equipo (auxiliar del equipo de la etapa y revisor de su equipo).
- Plantillas editables y envío desde el buzón de cada función, con modo simulado. Acuse automático al registrar.
- Pantallas: Equipos, Plantillas de correo, bandeja con buzón, criticidad y "respuestas por revisar", tablero con número interno, criticidad y equipo.

### Bloque 2: flujo del escrito y expediente (hecho el 2026-11-09)
1. **Expediente en SharePoint** (repositorio único, ver §6): la app sube, muestra, descarga y mueve los documentos; cada uno se abre en SharePoint para editarlo en Word. Sin SharePoint, carpeta local de desarrollo.
2. Datos faltantes (en el hilo de la asignación) e insumos (buzón de insumos, con fecha límite del cliente: 2 días hábiles o el mismo día si es crítico). La respuesta se confirma desde el correo: se marca qué insumos llegaron, con la hora de llegada del correo, y se envía el acuse.
3. Escrito por versiones: el auxiliar sube escrito y anexos, lo envía al revisor; el revisor lo devuelve con observación o lo **entrega** (V1, o V2 tras una devolución) compartiendo la carpeta del escrito con los destinatarios.
4. Respuesta de la entidad: se asocia por hilo o radicado, la app sugiere acuse, aprobación o devolución por el texto y la persona confirma. La devolución lleva tipo (fondo, soporte, criterio, estilo), motivo, si fue extemporánea y el plazo de corrección (ANS-06), que pasa a mandar en el tablero.
5. Radicación informada por la entidad y cierre con las causales del manual (§27).
6. **Asignación manual** (un caso) y **cargue desde Excel sin estructura fija**: la app lee la hoja, adivina las columnas, el asistente corrige el emparejamiento, se registra por tandas y sale una sola confirmación con el número interno de cada radicado.

Cierre del bloque (2026-11-09, noche):
- **Expediente del juzgado** (opción A, la que permite el manual §4): se le pide al cliente con "Pedir expediente del juzgado", que abre la solicitud de datos faltantes con el texto escrito.
- **Correo libre** desde el caso (pestaña Correos): buzón a elegir, asunto normalizado y destinatarios sugeridos, en el hilo de un correo recibido si se responde; sale con el diseño corporativo y queda en el caso.
- **Varios radicados en un correo**: el correo ofrece registrarlos todos en la pantalla de varios casos, con un solo acuse.
- **Detalle del caso como en Nodex**: pestañas Actuación, Información, Documentos (expediente por etapa y carpeta), Correos e Historial (línea de tiempo por día, con filtros), y columna lateral de plazos y responsables.
- **Formulario de asignación** por pasos en tarjetas, con validación del radicado, aviso de caso existente y resumen.

**Ajustes del 2026-11-09 (noche):**
- **Correos con diseño corporativo** (grafito y el dorado del logo, logo incrustado de 16 KB, ficha del caso con la criticidad en color, botón al enlace de la entrega) y **vista previa** en la administración de plantillas, más "Enviarme una prueba" cuando el envío real esté encendido. El título del correo también se edita.
- **Identificación por número de caso**: los asuntos de salida llevan "Caso GPA-AAAA-NNNNN" y la app asocia la respuesta por el hilo, por ese número (aunque llegue en otro hilo y sin radicado) o por el radicado. Los insumos quedan en `Insumos` y se ven en el caso como "Insumos recibidos"; lo que adjunta la entidad al responder una entrega queda en la carpeta de esa versión y ligado a ella.
- **Espacio de los buzones**: ver §7.

### Bloque 3: seguimiento y reportes (hecho el 2026-11-09)
- **Tablero diario** (Seguimiento → Tablero diario) por perfil: el auxiliar ve sus casos, el revisor los de su equipo y los que revisa, coordinación y asistencia toda la operación. Indicadores del día (abiertas, asignadas hoy, críticas, vencidas sin entregar, esperando insumos, entregadas en 7 días, sin auxiliar, de otro operador), matriz etapa × estado (cada celda abre el listado filtrado), carga por auxiliar y por equipo.
- **Indicadores ANS** por periodo (este mes, mes anterior, semana anterior o rango): ANS-01 a 08, 10 y 13 calculados con las reglas y exclusiones del manual; 11 y 12 se miden fuera de la app. Cada uno con su regla y los casos que no cumplen. Las entregas guardan la fecha límite vigente al entregar (`escritos.limiteAns`).
- **Alertas** (términos próximos o vencidos, desacato o requerimiento, insumos vencidos, duplicidad): las detecta el worker cada 30 minutos; el coordinador las emite al cliente con la plantilla ALERTA o las descarta con motivo. ANS-08 mide la emisión el mismo día hábil.
- **Informes** semanal y mensual en Excel (resumen y ANS, por equipo, matriz de casos abiertos, entregas, devoluciones, ANS incumplidos y, en el mensual, la relación para la factura), guardados en SharePoint. Sin datos personales de los accionantes.
- **Archivo maestro** de otros operadores: carga en Excel, marca los casos, alerta de duplicidad y ANS-13.

Lo anterior del bloque 3 que estaba planeado y no se hizo: cargue masivo (ya está desde el bloque 2) y asistencia del equipo (ANS-11) y descuentos (D29), que se llevan fuera de la app.

### Bloque 3 original (referencia)
- Tablero diario del manual (asignados, en análisis, pendientes de insumos, entregados, devueltos, aprobados, radicados, críticos y duplicados).
- Alertas inmediatas por escrito (términos vencidos o próximos, desacatos, sanciones, falta de insumos, duplicidad) y ANS-08.
- Informe semanal (segundo día hábil) y mensual (quinto día hábil) con la matriz de casos abiertos; exportación a Excel para el Power BI de la firma.
- ANS-01 a ANS-13 calculados; cargue masivo y archivo maestro de otros operadores (ANS-13).

### Bloque 4: producción (siguiente)
Servidor propio, usuario propio de base, ajustes de esquema sin `alter`, HTTPS, almacenamiento de adjuntos (ver §6) y encender el envío real.

## 5. Respuestas a las dudas de TI (D1–D30) y lo que sigue abierto

Fuente: `Docs/Dudas TI .docx` (respuestas del abogado, 2026-11-10). Todo está en la pantalla Parámetros: lo respondido lleva la marca de confirmado y la fuente "Dudas TI".

**Aplicado en la app:**

| Duda | Respuesta | Dónde |
|---|---|---|
| D1 | Corte a las 3:00 p. m. para asignaciones e insumos | `HORA_CORTE_ASIGNACION` |
| D2 | Nuestra actividad vence a las 3:00 p. m.; los juzgados, a las 5:00 p. m. | `HORA_FIN_DIA_ANS` = 15:00, `HORA_VENCIMIENTO_TERMINO` = 17:00 |
| D3 | La vacancia no suspende el servicio. El 24 y el 31 de diciembre son medios días: entre los dos restan un día hábil | Días no hábiles con `medioDia` (se siembran solos) y `HORA_CORTE_MEDIO_DIA`. Solo para los ANS: los términos del juzgado cuentan el día entero |
| D4 | Todo en días hábiles: 24 h = 1 día, 48 h = 2 | `TERMINO_HORAS_EN_DIAS` |
| D5 | 3 días hábiles desde el día siguiente a la notificación | `DIAS_TERMINO_IMPUGNACION` |
| D6 | Los insumos mínimos son los documentos de la asignación; si faltan, el asistente los pide | `ANS_DESDE_DATOS_COMPLETOS`: el ANS no corre mientras se esperan los datos faltantes y cuenta desde su llegada |
| D11 | 90 % mientras se negocian; ANS-09 propuesto para eliminar | `META_ANS` |
| D12 | Todo fallo desfavorable lleva memorial de cumplimiento, aunque se impugne | `CUMPLIMIENTO_DURANTE_IMPUGNACION` = sí |
| D13 | Favorables: niega, improcedente, hecho superado. Concede y concede parcialmente son desfavorables. En segunda: confirma lo favorable o revoca lo que concedió | `SENTIDOS_FAVORABLES` y sentido `HECHO_SUPERADO` |
| D16 | Todos los casos los revisa un abogado | Ya era así en el flujo |
| D20 | Las devoluciones no usan la hora de corte | ANS-06 cuenta desde la hora del correo de devolución |
| D10, D15, D17, D18, D19, D30 | Coinciden con lo propuesto | Ya construido |

**Abierto:**

| Duda | Qué falta | Parámetro o trabajo |
|---|---|---|
| D3 | Hora exacta del medio día | `HORA_CORTE_MEDIO_DIA` = 12:00 (supuesto) |
| D5 | Si se suman 2 días cuando el fallo se notifica por correo (Ley 2213 de 2022) | `DIAS_ADICIONALES_NOTIFICACION_CORREO` = 0 |
| D6 | Si los insumos para preparar el escrito también suspenden el ANS | `ANS_INICIO_CON_INSUMOS` = último insumo |
| D7, D9, D14 | Etiqueta "Fecha asignación impugnación"; separar memorial de cumplimiento y respuesta a requerimiento previo; impugnación de la entidad o respuesta a la del accionante (descorre) | Por construir |
| D11 | Porcentajes definitivos y si se elimina ANS-09 | `META_ANS` |
| D19 | Lineamientos de fondo de la entidad (aún no comunicados) | Catálogo de motivos cuando lleguen |
| D21–D24 | PQRS: no está en la fase inicial, pero se puede activar en cualquier momento | Por construir (término de 15, 10 o 30 días; tutela por derecho de petición crea PQRS ligada) |
| D25 | PST (contratante, fideicomitente y supervisor) también da insumos y recibe alertas | `CORREOS_INSUMOS`, `CORREOS_ALERTAS` |
| D26 | El archivo maestro es de **PQRS** que responde otro equipo, no de tutelas. Aún no lo entregan | Reorientar el archivo maestro |
| D27 | Equipo mínimo: 5 asistentes, 15 auxiliares, 3 revisores y 1 coordinador | Asistencia diaria para ANS-11 |
| D28 | Tablero en Power BI para PST y la entidad, y el mismo tablero dentro de la app | Vistas en Postgres y pantalla del tablero |
| D29 | Descuentos: leve 0,5 %, moderado 1,5 %, grave 3 %, tope 10 %; sanción atribuible y reincidencia | Parámetros, alertas internas y tablero |
| Destinatarios | Los define el cliente en la fase inicial | `CORREOS_INSUMOS`, `CORREOS_ENTREGA`, `CORREOS_COPIA_ENTREGA` |

## 6. Decisiones pendientes

1. **Prefijo del asunto.** El cliente pide `GPA-SDM-PST`. Por la regla de no nombrar a la entidad en el código, el valor no está en el código: se escribe en Parámetros (`PREFIJO_ASUNTO`).
2. **Repositorio: SharePoint, sin Azure Blob** (decidido el 2026-11-09). El manual (§23) exige biblioteca de SharePoint o Teams, enlaces con caducidad y supresión certificada de todas las copias al terminar: una copia en Azure Blob sería un segundo lugar que custodiar y borrar, y otro servicio que declarar en el anexo de seguridad. La app usa el mismo registro de Entra con `Sites.Selected` (solo ese sitio).
3. **Envío por SendGrid: no.** Se puede autenticar el dominio en SendGrid y enviar "como" `asignacionsdmc@…`, pero: el correo no queda en Enviados del buzón (se pierde la trazabilidad que pide el manual), el hilo de Exchange no se arma igual (la respuesta del cliente se empareja peor), hay que tocar el SPF/DKIM del dominio de la firma, y SendGrid sería un tercero con datos personales fuera del anexo de seguridad (manual §5.4 y §23). Como la app ya necesita Graph para leer los buzones, enviar por Graph no cuesta nada más.
4. **Adjuntos de la entidad.** Por definir si llegan como adjunto o enlace: la app guarda los dos.
5. **Plantillas del cliente** (las "en rojo"): se cargan en Plantillas de correo y se marcan como definitivas.
6. **Asignación en paquete sin Excel** (varios radicados en el cuerpo del correo): hoy se registra uno desde el correo y los demás como asignación manual con la misma fecha.

## 7. Límite de 50 GB de los buzones

Un buzón compartido sin licencia tiene 50 GB. Lo que lo llena son los adjuntos que manda el cliente (expedientes y PDF escaneados); lo que sale de la app pesa poco porque las entregas van por enlace y el logo pesa 16 KB.

1. **El expediente vive en SharePoint**, no en el buzón: la app guarda cada adjunto en la carpeta del caso al leer el correo.
2. **Limpieza diaria** (worker, 2:00 a. m.; también `npm run limpiar-buzon`): pasados `DIAS_RETENER_ADJUNTOS_BUZON` días (30), quita el adjunto del correo en el buzón si la copia de SharePoint existe y tiene el mismo tamaño. El correo (texto, fecha, hilo) se queda. Se apaga con `LIMPIAR_ADJUNTOS_BUZON`.
3. **Medición**: cada hora la app suma el tamaño de las carpetas de cada buzón y lo muestra en Correos e Inicio, en ámbar al pasar `ALERTA_BUZON_PORCENTAJE` (80 %) de `CUOTA_BUZON_GB`.
4. **Si aun así no alcanza**: asignar una licencia Exchange Online Plan 2 (o Exchange Online Archiving) al buzón da 100 GB más archivo automático, que crece hasta 1,5 TB.
5. **Ojo con la retención**: si la firma tiene una política de retención o una retención por litigio sobre esos buzones, lo que se borra pasa a "Elementos recuperables" (cuota aparte de 30 GB) y no libera espacio. Hay que revisarlo con el administrador de 365.
