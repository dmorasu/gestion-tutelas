# Nodex Tutelas

Antes de trabajar, leer `RESUMEN_TECNICO.md`: arquitectura, convenciones, estado, pendientes y cómo arrancar en Windows o Mac.

Reglas que no se negocian (decisiones del usuario):
- App **aparte de Nodex** (repositorio, backend y base `gpa_legal` propios), con el mismo stack y el mismo diseño de Nodex Gastos.
- **Login propio** con correo y contraseña. No usar Microsoft 365 para entrar. Entra ID es solo para el buzón.
- No nombrar a la SDM: en código y pantallas es "la entidad". La app se llama Nodex Tutelas · GPA Legal.
- Color de la app: **grafito (slate)**. El ámbar solo para advertencias.
- Sin textos de ayuda bajo los títulos (estilo Nodex).
- Las reglas de plazos y ANS salen de la tabla `parametros` (supuestos D1–D30). Cuando el abogado responda, se cambia el parámetro, no la lógica.
- Código y comentarios en español; los comentarios explican el porqué.
- Validar con `npx tsc --noEmit` y `npx eslint .`. No correr `next build` con el servidor de desarrollo encendido.
- Rama de trabajo: `desarrollo`.
