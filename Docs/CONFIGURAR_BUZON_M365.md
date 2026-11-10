# Configurar los buzones y SharePoint del servicio en Microsoft 365

Para: el administrador de Microsoft 365 de la firma. Tiempo estimado: 45 minutos.

La app **Nodex Tutelas** lee tres buzones, envía desde ellos los correos de la gestión y guarda los expedientes en un sitio de SharePoint (el manual operativo, §23, exige SharePoint o Teams). **Los usuarios no entran a la app con su cuenta de 365**: Entra ID solo se usa para que la app lea y envíe correo de esos tres buzones, y de ningún otro.

| Buzón | Función |
|---|---|
| `asignacionsdmc@gomezpinedaabogados.com` | Entran las asignaciones y la información faltante. Sale la confirmación de recibido con el número interno |
| `insumosdmc@gomezpinedaabogados.com` | Salen las solicitudes de insumos. Entran los insumos |
| `entregasdmc@gomezpinedaabogados.com` | Salen las entregas V1 y V2. Entran el acuse, la aprobación o la devolución |

Cada buzón tiene su función, así que **no hacen falta reglas de flujo de correo**: la app sabe qué es cada correo por el buzón al que llegó y por el asunto normalizado.

## 1. Crear los buzones compartidos

Los buzones compartidos no requieren licencia. En **Exchange Online PowerShell** (`Connect-ExchangeOnline`):

```powershell
New-Mailbox -Shared -Name "Asignaciones tutelas" -PrimarySmtpAddress asignacionsdmc@gomezpinedaabogados.com
New-Mailbox -Shared -Name "Insumos tutelas" -PrimarySmtpAddress insumosdmc@gomezpinedaabogados.com
New-Mailbox -Shared -Name "Entregas tutelas" -PrimarySmtpAddress entregasdmc@gomezpinedaabogados.com

# El cliente escribe desde fuera de la firma: los buzones deben aceptar correo externo
"asignacionsdmc","insumosdmc","entrega" | ForEach-Object {
  Set-Mailbox "$_@gomezpinedaabogados.com" -RequireSenderAuthenticationEnabled $false
}
```

Los tres siguen el mismo patrón de nombre (`asignacionsdmc@`, `insumosdmc@`, `entregasdmc@`). Ninguno debe ser el buzón de una persona ni tener otro uso: la app lee todo lo que llega a ellos.

El manual operativo (§23) exige **bloquear el reenvío automático externo** en estos buzones. Si la firma no lo tiene bloqueado para todos, hágalo en la política de correo no deseado saliente.

## 2. Registrar la app en Entra ID

En **https://entra.microsoft.com** → Aplicaciones → Registros de aplicaciones → **Nuevo registro**:

1. Nombre: `Nodex Tutelas - Buzones`. Tipos de cuenta: **Solo cuentas de este directorio**. Sin URI de redirección.
2. **Permisos de API** → Agregar → Microsoft Graph → **Permisos de aplicación**: `Mail.ReadWrite`, `Mail.Send` y `Sites.Selected`. `Sites.Selected` no da acceso a ningún sitio por sí solo: el paso 4 le abre solo el de los expedientes.
3. **Conceder consentimiento de administrador**.
4. **Certificados y secretos** → Nuevo secreto de cliente (vigencia de 24 meses). Copie el **valor** de inmediato, porque no se vuelve a mostrar.
5. En **Información general**, anote el **Id. de directorio (inquilino)** y el **Id. de aplicación (cliente)**.

## 3. Limitar la app a esos tres buzones (obligatorio)

Sin este paso, la app podría leer **todos** los buzones de la firma.

```powershell
# Grupo de seguridad con correo que contiene solo los tres buzones
New-DistributionGroup -Name "App Nodex Tutelas" -Type Security `
  -PrimarySmtpAddress app-nodex-tutelas@gomezpinedaabogados.com `
  -Members asignacionsdmc@gomezpinedaabogados.com, insumosdmc@gomezpinedaabogados.com, entregasdmc@gomezpinedaabogados.com

New-ApplicationAccessPolicy -AppId <Id-de-aplicación> `
  -PolicyScopeGroupId app-nodex-tutelas@gomezpinedaabogados.com `
  -AccessRight RestrictAccess -Description "Nodex Tutelas solo lee los buzones del servicio"

# Comprobación: los tres primeros deben decir Granted y el último Denied
Test-ApplicationAccessPolicy -Identity asignacionsdmc@gomezpinedaabogados.com -AppId <Id-de-aplicación>
Test-ApplicationAccessPolicy -Identity insumosdmc@gomezpinedaabogados.com -AppId <Id-de-aplicación>
Test-ApplicationAccessPolicy -Identity entregasdmc@gomezpinedaabogados.com -AppId <Id-de-aplicación>
Test-ApplicationAccessPolicy -Identity <cualquier-otro-buzon>@gomezpinedaabogados.com -AppId <Id-de-aplicación>
```

La política puede tardar hasta una hora en aplicarse.

Microsoft también ofrece **RBAC para aplicaciones** de Exchange (`New-ManagementScope` y `New-ManagementRoleAssignment`), que reemplaza a las políticas de acceso. Cualquiera de las dos sirve; lo importante es que la prueba dé *Denied* en otros buzones.

## 4. Sitio de SharePoint de los expedientes

1. Cree un sitio de grupo (o de Teams) privado, por ejemplo **Tutelas**, con el equipo del servicio como miembros. Así los abogados abren los escritos en Word con su cuenta de la firma.
2. Dele a la app permiso de escritura **solo sobre ese sitio** (PowerShell con PnP, como administrador de SharePoint):

```powershell
Connect-PnPOnline -Url https://gomezpinedaabogados.sharepoint.com/sites/Tutelas -Interactive
Grant-PnPAzureADAppSitePermission -AppId <Id-de-aplicación> -DisplayName "Nodex Tutelas" -Site https://gomezpinedaabogados.sharepoint.com/sites/Tutelas -Permissions Write
```

3. **Compartir con el cliente.** Las entregas van por enlace (manual §23: compartición externa solo con los dominios del cliente y enlaces con caducidad). En el Centro de administración de SharePoint → Sitios activos → Tutelas → Uso compartido: permita **invitados nuevos y existentes** y, en Directivas → Uso compartido, limite los dominios permitidos a los del cliente. La app invita a los correos de la entrega con permiso de lectura que vence a los `DIAS_VIGENCIA_ENLACE` días.
4. Bloquee la sincronización con OneDrive personal de esa biblioteca si la política de la firma no lo hace ya.

La app crea sola esta estructura:

```
Bandeja/AAAA/MM/<correo>          adjuntos que aún no se asocian a un caso
Cargues/AAAA/MM                   Excel de asignaciones subidos a mano
Casos/GPA-2026-00001 <radicado>/<etapa>/
    Entrada  ·  Insumos  ·  Soportes  ·  Escritos/V1  ·  Escritos/V2
```

## 5. Datos para la app

Escríbalos **directamente en `backend/.env`** del servidor. No los envíe por chat ni por correo, porque el secreto da acceso a los buzones.

```
ENTRA_TENANT_ID=<Id. de directorio (inquilino)>
ENTRA_CLIENT_ID=<Id. de aplicación (cliente)>
ENTRA_CLIENT_SECRET=<valor del secreto>
BUZON_ASIGNACIONES=asignacionsdmc@gomezpinedaabogados.com
BUZON_INSUMOS=insumosdmc@gomezpinedaabogados.com
BUZON_ENTREGAS=entregasdmc@gomezpinedaabogados.com
BUZON_LEER_DESDE=<fecha de hoy, AAAA-MM-DD>
# Dejar en false hasta aprobar las plantillas: los correos de salida quedan simulados
CORREO_ENVIO_ACTIVO=false
SHAREPOINT_SITIO=gomezpinedaabogados.sharepoint.com:/sites/Tutelas
# Vacío = la biblioteca "Documentos" del sitio
SHAREPOINT_BIBLIOTECA=
```

Ponga en el calendario el vencimiento del secreto: cuando vence, la app deja de leer los buzones.

## 6. Espacio de los buzones

Cada buzón compartido sin licencia tiene 50 GB. La app guarda los adjuntos en SharePoint y, pasados 30 días, los quita del buzón (el correo queda). Para que eso libere espacio:

- Revise si hay **retención o retención por litigio** sobre estos buzones (`Get-Mailbox <buzón> | fl LitigationHoldEnabled,InPlaceHolds`). Con retención, lo borrado se guarda en "Elementos recuperables" y no libera cuota.
- Si un buzón se acerca al límite (la app avisa al 80 %), asígnele una licencia **Exchange Online Plan 2** o **Exchange Online Archiving**: 100 GB y archivo automático.

## 7. Prueba

1. Desde una cuenta **externa** (un Gmail, por ejemplo), envíe a `asignacionsdmc@` un correo con este asunto, y un PDF adjunto si quiere:
   `[GPA-SDM-PST] [ALTO] [76001310300120260012300] [Actuación: TUTELA] [Vence: 20/11/2026 5:00 p. m.]`
2. En el equipo de desarrollo: `cd backend` y `npm run leer-buzon`.
3. En la app, abra **Correos** y revise que el correo diga buzón "Asignaciones", etapa "Contestación (del asunto)", criticidad "Alto", el vencimiento y los adjuntos. En SharePoint, el PDF debe estar en `Bandeja/…`; al registrar el caso pasa a `Casos/…/Contestación/Entrada`.
4. Regístrelo. Con `CORREO_ENVIO_ACTIVO=false`, el caso muestra la confirmación de recibido como "Simulado". Para probar el envío real, póngalo en `true`, reinicie la API y registre otro correo de prueba: la confirmación debe llegar al Gmail, en el mismo hilo.
5. Si todo está bien, active la lectura automática: `BUZON_ACTIVO=true` en el `.env`, Redis en marcha y `npm run worker`.
