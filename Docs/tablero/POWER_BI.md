# Tablero en Power BI

La app publica sus datos en el esquema `tablero` de la base `gpa_legal`. Power BI lee esas vistas y la pantalla **Seguimiento → Tablero de la operación** de la app lee exactamente las mismas, así que las dos muestran siempre las mismas cifras.

## Vistas

| Vista | Una fila por | Para qué |
|---|---|---|
| `tablero.casos` | radicado | Inventario, etapa inicial y actual, juzgado, accionantes |
| `tablero.actuaciones` | etapa de un caso | Estado, criticidad, semáforo, responsables, primera entrega y si fue a tiempo |
| `tablero.entregas` | versión entregada a la entidad | Entregas por día, a tiempo, tipo de escrito, devoluciones de fondo |
| `tablero.devoluciones` | devolución | Forma o fondo, extemporánea, corregida a tiempo (ANS-06) |
| `tablero.alertas` | alerta | Emitida a tiempo (ANS-08) |
| `tablero.fallos` | fallo | Sentido, favorable, cumplimiento pendiente |
| `tablero.ans` | ANS por mes | Resultado, meta y cumplimiento con la misma regla de la app |

- Las fechas vienen con hora (UTC) y, al lado, el día en hora de Colombia (`dia_asignacion`, `dia_entrega`…). Para agrupar por día use las columnas `dia_*`.
- `semaforo` se calcula al momento de la consulta (vencido, urgente, próximo, a tiempo).
- `tablero.ans` se refresca cada 30 minutos (mes en curso y anterior). No recalcule el ANS en Power BI: tome esta vista.
- Los descuentos (D29) están en el esquema `tablero_interno` y **no** se comparten con el cliente.

## Conexión

1. El administrador de Postgres crea el usuario con `USUARIO_LECTURA.sql`.
2. En Power BI Desktop: Obtener datos → Base de datos PostgreSQL. Servidor `10.0.4.4`, base `gpa_legal`, usuario `tablero_lectura`. Modo **Importar**.
3. Elegir las vistas del esquema `tablero`.
4. Publicar en el servicio de Power BI y compartir el informe con PST y la entidad.
5. **Actualización programada:** la base está en la red de la oficina, así que el servicio de Power BI necesita una **puerta de enlace de datos local** (on-premises data gateway) instalada en un equipo de la red que siempre esté encendido. Con la licencia Pro se pueden programar hasta 8 actualizaciones al día.

## Informes que pide el contrato

- **Semanal** (segundo día hábil de cada semana): asignaciones, actividades, respuestas proyectadas y novedades procesales. Validar cifras contra el tablero y anexar bloqueos y acciones.
- **Mensual** (quinto día hábil de cada mes): consolidado de gestión, indicadores, casos abiertos y ANS, con la matriz de casos abiertos y la explicación de las desviaciones.

La app ya genera los dos en Excel (Seguimiento → Informes) con las mismas cifras.

## Acceso del cliente a la app

En vez de (o además de) Power BI, PST y la entidad pueden entrar a la app con el perfil **Consulta del tablero (cliente)**: el administrador les crea el usuario en Configuración → Usuarios y solo ven el tablero, sin descuentos ni datos internos.
