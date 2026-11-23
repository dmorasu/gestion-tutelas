# Salida a producción

Se publica en el servidor de Nodex (§0.2), con Node, Redis, Nginx y PM2 compartidos. Las secciones 0 y 0.1 describen la configuración; los comandos y puertos del servidor son los de §0.2. La base sigue en el Postgres de la oficina (`gpa_legal`), con un usuario propio.

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
   - `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=9100`, `URL_FRONTEND=https://<dirección de pruebas>`
   - `DB_*` con el usuario del paso 2 y `DB_NAME=gpa_legal`
   - `JWT_SECRET=$(openssl rand -hex 48)`: uno nuevo, no el de desarrollo
   - `CORREO_ENVIO_ACTIVO=false`: los correos quedan en el caso, pero no salen
   - `BUZON_ACTIVO=false`: no se leen los buzones; las asignaciones se registran a mano o por Excel
   - `ENTRA_*` y `SHAREPOINT_*`: los reales, si los expedientes de prueba van a SharePoint. Si no, se dejan vacíos y se usa `ALMACEN_LOCAL=/opt/tutelas-archivos`
5. **Build:**
   ```bash
   cd /opt/tutelas/backend && npm run build
   cd ../frontend && npm ci
   echo "API_URL=http://127.0.0.1:9100/api" > .env
   npm run build
   ```
6. **Procesos:** `cd /opt/tutelas && pm2 start ecosystem.config.cjs --only tutelas-api,tutelas-web && pm2 save`. Después, `pm2 logs tutelas-api` debe mostrar "Conexión exitosa a la base de tutelas" y "API de tutelas en el puerto 9100".
   - El worker no se arranca: con `BUZON_ACTIVO=false` se apaga solo y PM2 lo reiniciaría sin parar.
   - Sin worker no hay detección ni cortes automáticos de alertas. En pruebas, el corte se envía a mano desde Alertas ("Enviar corte ahora"), que también detecta las alertas.
7. **Nginx y HTTPS:** §4, con el nombre de la dirección de pruebas. Luego `certbot --nginx -d <dirección de pruebas>`.
8. **Primer administrador:** `cd /opt/tutelas/backend && node dist/scripts/crearAdmin.js correo "Nombre"`. Da una contraseña temporal.
9. **En la app**, antes de dar acceso:
   - Usuarios con perfil y equipo, y la asistencia del día.
   - En Parámetros: `FECHA_INICIO_PLAN`, `CORREOS_*` (también `CORREOS_ALERTAS`), `PREFIJO_ASUNTO`, `ENTIDAD_NOMBRE`, `ENTIDAD_NOMBRE_LEGAL`, `ENTIDAD_NIT`, `ENTIDAD_DIRECCION_NOTIFICACIONES`, `ENTIDAD_CORREO_NOTIFICACIONES`, `APODERADO_*` y `DIAS_TERMINO_EMERGENCIA`. Sin ellos, los escritos de emergencia salen con `[ENTIDAD]`, `[APODERADO]`, etc.
   - En Catálogos: confirmar los derechos, los tipos de respuesta y las peticiones por etapa, que están marcados como "Supuesto".
10. **Comprobar:**
    - Entrar con el administrador.
    - Registrar un caso a mano.
    - Pedir insumos: el correo queda "Simulado".
    - Subir el escrito y enviarlo a revisión: se genera la ficha técnica.
    - Entregarlo.
    - En Alertas, enviar un corte a mano.

Para actualizar la versión de pruebas, ver "Actualizar" al final.

## 0.1 Prueba completa con correos (buzón de la firma en el papel de la entidad)

Igual que la sección 0, pero los correos salen de verdad y se leen los buzones. **Todo lo que sale va solo al buzón de pruebas**, gracias a `CORREO_REDIRIGIR_A`. Así, aunque llegue un correo real de la entidad o algún parámetro tenga una dirección real, nadie fuera de la firma recibe nada. Cada correo lleva arriba un aviso amarillo con los destinatarios que tendría en operación, y la app muestra "Modo prueba".

1. Instalar Redis (`sudo apt install -y redis-server && sudo systemctl enable --now redis-server`).
2. En `backend/.env`, además de lo de la sección 0:
   ```
   CORREO_ENVIO_ACTIVO=true
   BUZON_ACTIVO=true
   CORREO_REDIRIGIR_A=pruebas-entidad@gomezpinedaabogados.com
   BUZON_LEER_DESDE=<fecha de hoy>
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   REDIS_DB=5
   ```
   También `ENTRA_*`, `BUZON_*` y `SHAREPOINT_*`, copiados del `.env` de desarrollo.
3. Una lectura a mano para ver que Graph responde: `cd backend && node dist/scripts/leerBuzon.js`. Después, los tres procesos: `pm2 start ecosystem.config.cjs`.
4. Solo un equipo lee los buzones: en el Mac, `BUZON_ACTIVO=false` y no correr `npm run leer-buzon`, porque el avance de la lectura está en la base compartida.
5. En Parámetros, `CORREOS_INSUMOS`, `CORREOS_ENTREGA` y `CORREOS_ALERTAS` pueden quedar con el buzón de pruebas o con los definitivos: igual salen al de pruebas.
6. Desde el buzón de pruebas se escribe a `asignacionsdmc@` con el asunto `[GPA] [ORDINARIO] [<radicado de 23 dígitos>] [TUTELA] [Vence: dd/mm/aaaa hh:mm]` y se sigue el circuito: acuse, datos faltantes, insumos y su respuesta, entrega, devolución y V2, y corte de alertas.
7. Para pasar a operación se deja `CORREO_REDIRIGIR_A` vacío y se reinicia: `pm2 restart tutelas-api tutelas-worker --update-env`. Nunca `pm2 restart all`: en el servidor de Nodex reiniciaría también Nodex.

## 0.2 En el servidor de Nodex (SRVWEBNOX02) — así se publica

Se sigue la guía del servidor de Nodex ("Servidor de Nodex: guía para montar otro proyecto sin dañar Nodex", 2026-11-23). Nodex está en producción.

**Reglas:**
- Todo como `root` (`sudo -i`), con el PM2 de root.
- Nada que reinicie lo compartido: Nginx solo con `reload`; Postgres y Redis no se tocan.
- No intervenir a las 08:00, 09:00, 13:00 ni 02:30.
- Compilar fuera de horario y una app a la vez: con 2 vCPU, un build sube la CPU al 95 %.

| | Nodex | **Tutelas** |
|---|---|---|
| Carpeta | `/home/desarrolloti/nodex5.0` | **`/home/desarrolloti/tutelas`** |
| Puertos (127.0.0.1) | 9000–9003 (Monitor 9010) | **9100 (API) y 9101 (web)** |
| Redis | base 1, cola `notifications` | **base 5** (comprobar que esté vacía), cola `tutelas-buzon` |
| PM2 | `nodex-*` | **`tutelas-api`, `tutelas-worker`, `tutelas-web`** |
| Postgres | `DB_HOST=10.0.4.4`, base `nodex` | **mismo motor, base `gpa_legal`, usuario `tutelas`**, pool de 5 por proceso |
| Dominio | `*.nodexgpa.com` | **`tutelas.nodexgpa.com`** (registro A → `20.186.19.92`) |

### 1. Revisar antes de tocar nada (solo lectura)
```bash
sudo -i
pm2 list
ss -ltnp | grep -E ':(910[0-9])\b'        # no debe salir nada
ls -l /etc/nginx/sites-enabled/ && nginx -t
cd /tmp && sudo -u postgres psql -Atc "SELECT datname FROM pg_database WHERE NOT datistemplate"
sudo -u postgres psql -Atc "SELECT count(*), current_setting('max_connections') FROM pg_stat_activity"
redis-cli INFO keyspace && redis-cli -n 5 DBSIZE      # la 5 debe dar 0
free -m && df -h / && node -v
```

### 2. Base de datos
Si `gpa_legal` no está en la lista del paso 1:
```bash
cd /tmp
sudo -u postgres psql -c "CREATE ROLE tutelas LOGIN PASSWORD '<clave nueva>';"
sudo -u postgres createdb -O tutelas gpa_legal
sudo -u postgres psql -c "REVOKE CONNECT ON DATABASE gpa_legal FROM PUBLIC;"
```
Si ya existe (la que se usa desde el Mac), se usa esa con su usuario actual o se le pasa a `tutelas`. Lo decide el usuario. Nunca se toca ninguna otra base. El respaldo de las 02:30 la incluye sola desde la noche siguiente.

### 3. Código
```bash
cd /home/desarrolloti
git clone https://github.com/dmorasu/gestion-tutelas.git tutelas
git config --global --add safe.directory /home/desarrolloti/tutelas     # solo esta carpeta
cd tutelas && git checkout main
cd backend && npm ci && cp .env.example .env && nano .env
```

### 4. `backend/.env`
```
NODE_ENV=production
HOST=127.0.0.1
PORT=9100
URL_FRONTEND=https://tutelas.nodexgpa.com
DB_HOST=10.0.4.4
DB_PORT=5432
DB_USER=tutelas
DB_PASSWORD=<clave>
DB_NAME=gpa_legal
DB_POOL_MAX=5
JWT_SECRET=<openssl rand -hex 48>
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=5
```
Además, `ENTRA_*`, `BUZON_*` y `SHAREPOINT_*`, copiados del `.env` de desarrollo de Tutelas (nunca de los `.env` de Nodex). Para la prueba con correos:
```
BUZON_ACTIVO=true
CORREO_ENVIO_ACTIVO=true
CORREO_REDIRIGIR_A=<buzón de pruebas de la firma>
BUZON_LEER_DESDE=<fecha de hoy>
```
Sin correos: `BUZON_ACTIVO=false` y `CORREO_ENVIO_ACTIVO=false`. En ese caso el worker no se arranca (§0).

### 5. Compilar (fuera de horario, una cosa a la vez)
```bash
cd /home/desarrolloti/tutelas/backend && npm run build
cd ../frontend && npm ci
echo "API_URL=http://127.0.0.1:9100/api" > .env
npm run build
cd ../backend && node dist/scripts/leerBuzon.js        # con correos: lee los tres buzones sin error
```

### 6. PM2
```bash
pm2 start /home/desarrolloti/tutelas/ecosystem.config.cjs
pm2 list                         # nodex-* online y sin reinicios nuevos; tutelas-* online
pm2 logs tutelas-api --lines 40 --nostream
pm2 save                         # solo con todos los nodex-* online
```
Prohibidos: `pm2 restart|stop|delete all`, `pm2 kill`, `pm2 update`, `pm2 unstartup` y `pm2 flush` sin nombre.

### 7. Nginx (`/etc/nginx/sites-available/tutelas`, archivo propio)
```nginx
server {
    listen 80;
    server_name tutelas.nodexgpa.com;
    include snippets/seguridad-nodexgpa.conf;
    # Escritos y anexos: la app acepta hasta 60 MB por archivo
    client_max_body_size 70m;

    location / {
        proxy_pass http://127.0.0.1:9101;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 120s;
    }
}
```
- No se declara `map` ni `limit_req_zone`: el `map $connection_upgrade` ya existe en el sitio de Nodex.
- No se usa `default_server`.
- La API (9100) no se publica: solo la llama el frontend por 127.0.0.1.
```bash
ln -s /etc/nginx/sites-available/tutelas /etc/nginx/sites-enabled/tutelas
ls -l /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx        # si -t falla: quitar el enlace y no recargar
certbot --nginx -d tutelas.nodexgpa.com   # solo este dominio, después del registro DNS
```

### 8. Administrador y comprobación de Nodex
```bash
cd /home/desarrolloti/tutelas/backend && node dist/scripts/crearAdmin.js <correo> "<Nombre>"
pm2 list
for s in tramites gastos tramitadores; do curl -s -o /dev/null -w "$s %{http_code}\n" https://$s.nodexgpa.com; done   # 200 o 307
curl -s -o /dev/null -w "tutelas %{http_code}\n" https://tutelas.nodexgpa.com
```
Opcional: agregar `https://tutelas.nodexgpa.com` a `MONITOR_SITIOS` en `/opt/nodex-monitor/.env` (lo hace el usuario). Un `tutelas-*` caído le avisa por WhatsApp.

### Actualizar
```bash
cd /home/desarrolloti/tutelas && git pull
cd backend && npm ci && npm run build
cd ../frontend && npm ci && npm run build
pm2 restart tutelas-api tutelas-worker tutelas-web --update-env
```

### Si algo de Nodex se cae
`pm2 stop tutelas-api tutelas-worker tutelas-web`, quitar el enlace de Nginx de Tutelas, `nginx -t && systemctl reload nginx` y avisar. No arreglar Nodex desde Tutelas.

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
echo "API_URL=http://127.0.0.1:9100/api" > .env
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
pm2 save
```

Tres procesos: `tutelas-api` (9100), `tutelas-worker` (buzones, alertas, limpieza) y `tutelas-web` (9101). Los dos primeros escuchan solo en `127.0.0.1`.

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
        proxy_pass http://127.0.0.1:9101;
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
