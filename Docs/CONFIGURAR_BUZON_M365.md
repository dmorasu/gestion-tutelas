# Configurar el buzón de tutelas en Microsoft 365

Para: el administrador de Microsoft 365 de la firma. Tiempo estimado: 30 a 45 minutos.

La app **Nodex Tutelas** lee un buzón compartido para recibir las asignaciones y envía desde él los correos de la gestión. **Los usuarios no entran a la app con su cuenta de 365**: Entra ID solo se usa para que la app lea y envíe correo de ese buzón, y de ningún otro.

Cambie `gomezpinedaabogados.com` y los nombres de los alias si se eligen otros.

## 1. Buzón compartido y alias

En **Exchange Online PowerShell** (`Connect-ExchangeOnline`):

```powershell
New-Mailbox -Shared -Name "Tutelas" -DisplayName "Tutelas" -PrimarySmtpAddress tutelas@gomezpinedaabogados.com

# Un alias por etapa: todos llegan al mismo buzón
Set-Mailbox tutelas@gomezpinedaabogados.com -EmailAddresses @{add=
  "tutelas.acciones@gomezpinedaabogados.com",
  "tutelas.impugnaciones@gomezpinedaabogados.com",
  "tutelas.cumplimiento@gomezpinedaabogados.com"}

# Si la entidad escribe desde fuera de la firma (lo normal), el buzón debe aceptar correo externo
Set-Mailbox tutelas@gomezpinedaabogados.com -RequireSenderAuthenticationEnabled $false
```

## 2. Reglas de flujo de correo (marcan la etapa)

Cada regla agrega el encabezado `X-Tutelas-Etapa` según el alias. La regla ve también los destinatarios en copia oculta. El campo "Para:" no los muestra.

```powershell
New-TransportRule -Name "Tutelas - etapa ACCION" `
  -RecipientAddressContainsWords "tutelas.acciones@" `
  -SetHeaderName "X-Tutelas-Etapa" -SetHeaderValue "ACCION"

New-TransportRule -Name "Tutelas - etapa IMPUGNACION" `
  -RecipientAddressContainsWords "tutelas.impugnaciones@" `
  -SetHeaderName "X-Tutelas-Etapa" -SetHeaderValue "IMPUGNACION"

New-TransportRule -Name "Tutelas - etapa CUMPLIMIENTO" `
  -RecipientAddressContainsWords "tutelas.cumplimiento@" `
  -SetHeaderName "X-Tutelas-Etapa" -SetHeaderValue "CUMPLIMIENTO"
```

Si una regla no marca el correo, la app usa el alias que aparece en "Para:" o "CC:". El paso 6 comprueba cuál de los dos funcionó.

## 3. Registrar la app en Entra ID

En **https://entra.microsoft.com** → Aplicaciones → Registros de aplicaciones → **Nuevo registro**:

1. Nombre: `Nodex Tutelas - Buzón`. Tipos de cuenta: **Solo cuentas de este directorio**. Sin URI de redirección.
2. **Permisos de API** → Agregar → Microsoft Graph → **Permisos de aplicación**: `Mail.ReadWrite` y `Mail.Send`.
3. **Conceder consentimiento de administrador**.
4. **Certificados y secretos** → Nuevo secreto de cliente (vigencia de 24 meses). Copie el **valor** de inmediato, porque no se vuelve a mostrar.
5. En **Información general**, anote el **Id. de directorio (inquilino)** y el **Id. de aplicación (cliente)**.

## 4. Limitar la app a ese buzón (obligatorio)

Sin este paso, la app podría leer **todos** los buzones de la firma.

```powershell
# Grupo de seguridad con correo que contiene solo el buzón de tutelas
New-DistributionGroup -Name "App Nodex Tutelas" -Type Security `
  -PrimarySmtpAddress app-nodex-tutelas@gomezpinedaabogados.com `
  -Members tutelas@gomezpinedaabogados.com

New-ApplicationAccessPolicy -AppId <Id-de-aplicación> `
  -PolicyScopeGroupId app-nodex-tutelas@gomezpinedaabogados.com `
  -AccessRight RestrictAccess -Description "Nodex Tutelas solo lee el buzón de tutelas"

# Comprobación: el primero debe decir Granted y el segundo Denied
Test-ApplicationAccessPolicy -Identity tutelas@gomezpinedaabogados.com -AppId <Id-de-aplicación>
Test-ApplicationAccessPolicy -Identity <cualquier-otro-buzon>@gomezpinedaabogados.com -AppId <Id-de-aplicación>
```

La política puede tardar hasta una hora en aplicarse.

Microsoft también ofrece **RBAC para aplicaciones** de Exchange (`New-ManagementScope` y `New-ManagementRoleAssignment`), que reemplaza a las políticas de acceso. Cualquiera de las dos sirve; lo importante es que la prueba dé *Denied* en otros buzones.

## 5. Datos para la app

Escríbalos **directamente en `backend/.env`** del servidor. No los envíe por chat ni por correo, porque el secreto da acceso al buzón.

```
ENTRA_TENANT_ID=<Id. de directorio (inquilino)>
ENTRA_CLIENT_ID=<Id. de aplicación (cliente)>
ENTRA_CLIENT_SECRET=<valor del secreto>
BUZON_CORREO=tutelas@gomezpinedaabogados.com
ALIAS_ACCION=tutelas.acciones@gomezpinedaabogados.com
ALIAS_IMPUGNACION=tutelas.impugnaciones@gomezpinedaabogados.com
ALIAS_CUMPLIMIENTO=tutelas.cumplimiento@gomezpinedaabogados.com
BUZON_LEER_DESDE=<fecha de hoy, AAAA-MM-DD>
```

Ponga en el calendario el vencimiento del secreto: cuando vence, la app deja de leer el buzón.

## 6. Prueba

1. Desde una cuenta **externa** (un Gmail, por ejemplo), envíe un correo a `tutelas.acciones@…`, con un radicado de 23 dígitos en el asunto y, si quiere, un PDF adjunto.
2. Envíe otro a `tutelas.impugnaciones@…` con el alias en **copia oculta**. Este correo prueba la regla de Exchange.
3. En el equipo de desarrollo: `cd backend` y `npm run leer-buzon`.
4. En la app, abra **Correos por registrar** y revise:
   - que la etapa diga "(por regla de Exchange)";
   - que el radicado se haya encontrado;
   - que los adjuntos aparezcan.
5. Si todo está bien, active la lectura automática: `BUZON_ACTIVO=true` en el `.env`, Redis en marcha y `npm run worker`.
