# Salida a producción

Servidor propio (aparte del de Nodex) con Node 24, Redis, Nginx y PM2. La base sigue en el Postgres de la oficina (`gpa_legal`), con un usuario propio.

## 0. Versión de pruebas (paso a paso)

Para que la firma pruebe con datos reales sin que salga nada al cliente: los correos quedan **simulados** y no se leen los buzones. Se publica desde la rama `main`.

1. **Servidor:** Linux con Node 24, Git, Nginx y PM2 (`npm i -g pm2`). Redis no hace falta en pruebas (solo lo usa el worker). Debe alcanzar el Postgres de la oficina (10.0.4.4) por la red o la VPN.
2. **Base:** el administrador de Postgres crea el usuario de la app, dueño de `gpa_legal` (§1). Si las pruebas van en una base aparte, se crea vacía: la API hace las tablas al arrancar.
3. **Código:**
   ```bash
   git clone https://github.com/dmorasu/gestion-tutelas.git /opt/tutelas
   cd /opt/tutelas && git checkout main
   cd backend && npm ci && cp .env.example .env
   ```
4. **`backend/.env`** (ver §2). Lo propio de pruebas:
   - `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=4100`, `URL_FRONTEND=https://<dirección de pruebas>`
   - `DB_*` con el usuario del paso 2 y `DB_NAME=gpa_legal`
   - `JWT_SECRET=$(openssl rand -hex 48)`: uno nuevo, no el de desarrollo
   - `CORREO_ENVIO_ACTIVO=false`: los correos quedan en el caso, pero no salen
   - `BUZON_ACTIVO=false`: no se leen los buzones; las asignaciones se registran a mano o por Excel
   - `ENTRA_*` y `SHAREPOINT_*`: los reales, si los expedientes de prueba van a SharePoint. Si no, se dejan vacíos y se usa `ALMACEN_LOCAL=/opt/tutelas-archivos`
5. **Build:**
   ```bash
   cd /opt/tutelas/backend && npm run build
   cd ../frontend && npm ci
   echo "API_URL=http://127.0.0.1:4100/api" > .env
   npm run build
   ```
6. **Procesos:** `cd /opt/tutelas && pm2 start ecosystem.config.cjs --only tutelas-api,tutelas-web && pm2 save && pm2 startup`. Después, `pm2 logs tutelas-api` debe mostrar "Conexión exitosa a la base de tutelas" y "API de tutelas en el puerto 4100".
   - El worker no se arranca: con `BUZON_ACTIVO=false` se apaga solo y PM2 lo reiniciaría sin parar.
   - Sin worker no hay detección ni cortes automáticos de alertas. En pruebas, el corte se envía a mano desde Alertas ("Enviar corte ahora"), que también detecta las alertas.
7. **Nginx y HTTPS:** §4, con el nombre de la dirección de pruebas. Luego `certbot --nginx -d <dirección de pruebas>`.
8. **Primer administrador:** `cd /opt/tutelas/backend && node dist/scripts/crearAdmin.js correo "Nombre"`. Da una contraseña temporal.
9. **En la app**, antes de dar acceso:
   - Usuarios con perfil y equipo, y la asistencia del día.
   - En Parámetros: `FECHA_INICIO_PLAN`, `CORREOS_*` (también `CORREOS_ALERTAS`), `PREFIJO_ASUNTO`, `ENTIDAD_NOMBRE_LEGAL`, `ENTIDAD_NIT` y `APODERADO_*`.
   - En Catálogos: confirmar los derechos, los tipos de respuesta y las peticiones por etapa, que están marcados como "Supuesto".
10. **Comprobar:**
    - Entrar con el administrador.
    - Registrar un caso a mano.
    - Pedir insumos: el correo queda "Simulado".
    - Subir el escrito y enviarlo a revisión: se genera la ficha técnica.
    - Entregarlo.
    - En Alertas, enviar un corte a mano.

Para actualizar la versión de pruebas, ver "Actualizar" al final.

## 1. Base de datos

1. El administrador de Postgres crea el usuario de la app, dueño de la base `gpa_legal` (no el de desarrollo de Nodex).
2. Para Power BI, el usuario de solo lectura: `Docs/tablero/USUARIO_LECTURA.sql`.
3. En producción **no** se usa `sync({ alter })`. Al arrancar, la API crea las tablas nuevas y aplica los ajustes idempotentes de `backend/src/config/ajustesEsquema.ts`. Toda columna nueva en una tabla existente se agrega ahí.

## 2. Código y variables

```bash
git clone https://github.com/dmorasu/gestion-tutelas.git /opt/tutelas
cd /opt/tutelas && git checkout main

cd backend && npm ci && cp .env.example .env   # completar .env
npm run build

cd ../frontend && npm ci
echo "API_URL=http://127.0.0.1:4100/api" > .env
npm run build
```

En `backend/.env`:

| Variable | Valor en producción |
|---|---|
| `NODE_ENV` | `production` |
| `HOST` | `127.0.0.1` (Nginx delante) |
| `URL_FRONTEND` | la dirección pública, por ejemplo `https://tutelas.gomezpinedaabogados.com` |
| `DB_*` | el usuario propio de la base |
| `JWT_SECRET` | `openssl rand -hex 48` (nuevo, no el de desarrollo) |
| `REDIS_DB` | `5` |
| `ENTRA_*`, `BUZON_*`, `SHAREPOINT_*` | los de `Docs/CONFIGURAR_BUZON_M365.md` |
| `BUZON_ACTIVO` | `true` |
| `CORREO_ENVIO_ACTIVO` | `true` solo cuando el cliente apruebe las plantillas |
| `BUZON_LEER_DESDE` | la fecha del acta de inicio |
| `TABLERO_USUARIO_LECTURA` | `tablero_lectura` |

Primer administrador: `node dist/scripts/crearAdmin.js correo "Nombre"` (desde `backend`).

## 3. Procesos (PM2)

```bash
cd /opt/tutelas
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

Tres procesos: `tutelas-api` (4100), `tutelas-worker` (buzones, alertas, limpieza) y `tutelas-web` (3100). Los dos primeros escuchan solo en `127.0.0.1`.

## 4. Nginx y HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name tutelas.gomezpinedaabogados.com;

    ssl_certificate     /etc/letsencrypt/live/tutelas.gomezpinedaabogados.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tutelas.gomezpinedaabogados.com/privkey.pem;

    # Escritos y anexos: la app acepta hasta 60 MB por archivo
    client_max_body_size 70m;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}

server {
    listen 80;
    server_name tutelas.gomezpinedaabogados.com;
    return 301 https://$host$request_uri;
}
```

El navegador solo habla con el frontend (Next), que llama a la API por `127.0.0.1`: la API no se publica.

Certificado: `certbot --nginx -d tutelas.gomezpinedaabogados.com`.

## 5. Antes de abrir

1. `npm run leer-buzon` lee los tres buzones sin errores.
2. Una entrega de prueba con `CORREO_ENVIO_ACTIVO=false` (queda simulada) y otra real a un buzón interno.
3. Un enlace de SharePoint del cliente se descarga al expediente.
4. En Parámetros: `FECHA_INICIO_PLAN`, `CORREOS_*`, `PREFIJO_ASUNTO` y las metas.
5. Usuarios y equipos creados; asistencia del primer día registrada.
6. Las vistas del tablero existen (`SELECT * FROM tablero.ans LIMIT 1`) y Power BI se conecta con `tablero_lectura`.

## Actualizar

```bash
cd /opt/tutelas && git pull
cd backend && npm ci && npm run build
cd ../frontend && npm ci && npm run build
pm2 restart tutelas-api tutelas-worker tutelas-web
```
