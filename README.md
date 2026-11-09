# Nodex Tutelas (GPA Legal): gestión de tutelas, acciones de cumplimiento y PQRS

Aplicación para gestionar las tutelas, acciones de cumplimiento y PQRS de las entidades que asignan los casos a la firma: registro desde el buzón de Microsoft 365, reparto, escritos, devoluciones, decisiones judiciales, alertas y ANS del contrato.

Es independiente de Nodex: tiene repositorio, backend, base de datos y servidor propios. Usa el mismo stack y el mismo diseño (el de Nodex Gastos), con el ámbar como color propio.

## Contenido

| Carpeta | Qué es | Puerto |
|---|---|---|
| `backend/` | API Express 5 + Sequelize-typescript + Postgres | 4100 |
| `backend/src/worker.ts` | Lector del buzón (BullMQ + Redis), proceso aparte | — |
| `frontend/` | Next 16 + React 19 + Tailwind | 3100 |
| `Docs/PLAN.md` | Plan por fases, modelo y **supuestos en uso** mientras llegan las respuestas del abogado | — |
| `Docs/Flujo proceso - sabana.xlsx` | Flujo del proceso, campos por etapa, ANS y volumen del plan de choque | — |

## Arranque en desarrollo

1. Crear la base `gpa_legal` (mismo servidor Postgres de Nodex, base propia).
2. `backend/.env` a partir de `backend/.env.example`. Sin credenciales del buzón, dejar `BUZON_ACTIVO=false`.
3. `cd backend && npm install && npm run dev`. Al arrancar se crean las tablas y se siembran los roles y los parámetros.
4. Primer administrador: `npm run crear-admin -- correo@gomezpinedaabogados.com "Nombre"`. El comando imprime una contraseña temporal.
5. `frontend/.env` con `API_URL=http://localhost:4100/api`, y luego `cd frontend && npm install && npm run dev`.
6. Con el buzón configurado, lanzar el lector: `cd backend && npm run worker`.

## Acceso

Login propio con correo y contraseña, igual que Nodex: misma política de contraseñas, bloqueo de 15 minutos después de 5 intentos fallidos y sin registro público. El administrador crea cada usuario en **Usuarios** y le entrega la contraseña temporal, que se cambia al primer ingreso. Si alguien la olvida, el administrador se la restablece.

Microsoft 365 **no** se usa para entrar. Entra ID solo da la credencial con la que la app lee y envía correo del buzón de tutelas.

## Reglas pendientes de confirmar

Los plazos y ANS dependen de dudas que el abogado aún no ha respondido (D1 a D30). Cada una está en la pantalla **Parámetros** con el valor propuesto, marcada como *Supuesto*. Cuando llegue la respuesta, se cambia el valor y se marca como confirmado. No hay que tocar el código. Ver `Docs/PLAN.md` §5.

## Validación antes de subir

- Backend: `npm run tipos`
- Frontend: `npx tsc --noEmit`, `npx eslint .` y `npx next build` (con el servidor de desarrollo apagado)
