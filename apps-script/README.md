# Puente de contacto: Google Apps Script → Dropbox

El sitio es estático (GitHub Pages), así que **no puede** guardar archivos ni
escribir en Dropbox por sí solo. El formulario envía los datos a un Web App de
Google Apps Script y ese script sube el archivo a Dropbox con un token privado.

## Por qué no funcionaba

La URL configurada en `js/contact-config.js` y en el HTML anterior responde
**HTTP 404**:

```
https://script.google.com/macros/s/AKfycbwS2lcFIwkkkluk3orwgDjVHvAPkCOsT_Y3PPBXiTFr3uZE39DpOCW-8doJbHgZ7ko/exec
```

Ese despliegue ya no existe (o fue reemplazado). Hay que desplegar de nuevo el
script y actualizar la URL. Mientras tanto, el formulario muestra un aviso claro
y ofrece enviar la consulta por email.

## 1. Crear la app de Dropbox

1. Entra en <https://www.dropbox.com/developers/apps> y pulsa **Create app**.
2. Elige **Scoped access**.
3. Elige **App folder** (recomendado) o **Full Dropbox**.
4. Ponle un nombre, por ejemplo `miperfil-contacto`, y crea la app.
5. En la pestaña **Permissions**, activa:
   - `files.content.write`
   - `files.content.read`
   - `sharing.write` y `sharing.read` (solo si usarás `DROPBOX_CREATE_LINK`)
6. Pulsa **Submit**.
7. En **Settings** copia el **App key** y el **App secret**.

> Con **App folder**, los archivos quedan dentro de
> `Aplicaciones/miperfil-contacto` en Dropbox. La propiedad `DROPBOX_FOLDER`
> es relativa a esa carpeta.

## 2. Obtener el refresh token

Abre esta URL en el navegador (cambia `TU_APP_KEY`):

```
https://www.dropbox.com/oauth2/authorize?client_id=TU_APP_KEY&token_access_type=offline&response_type=code
```

Autoriza la app y copia el `code` que aparece. Después canjéalo (Windows
PowerShell, cambia los tres valores):

```powershell
$body = @{
  grant_type    = 'authorization_code'
  code          = 'TU_CODE'
  client_id     = 'TU_APP_KEY'
  client_secret = 'TU_APP_SECRET'
}
$r = Invoke-RestMethod -Method Post -Uri 'https://api.dropboxapi.com/oauth2/token' -Body $body
$r.refresh_token
```

Guarda el `refresh_token`. No lo publiques ni lo pegues en GitHub.

> Alternativa solo para pruebas: en la consola de Dropbox puedes generar un
> **access token** de corta duración (4 h) y usar `DROPBOX_ACCESS_TOKEN`.
> Para producción usa el refresh token.

## 3. Crear el proyecto de Apps Script

1. Entra en <https://script.google.com> → **Nuevo proyecto**.
2. Borra el contenido de `Código.gs` y pega todo el contenido de
   [`Codigo.gs`](./Codigo.gs).
3. Abre **Configuración del proyecto** (⚙️) → **Propiedades del script** y
   añade:

| Propiedad | Valor |
|---|---|
| `DROPBOX_APP_KEY` | App key de Dropbox |
| `DROPBOX_APP_SECRET` | App secret de Dropbox |
| `DROPBOX_REFRESH_TOKEN` | Refresh token del paso 2 |
| `DROPBOX_FOLDER` | Opcional. Por defecto `/Contacto Web` |
| `DROPBOX_CREATE_LINK` | Opcional. `true` para crear enlace compartido |
| `SHEET_ID` | Opcional. ID de un Google Sheet para registrar envíos |
| `NOTIFY_EMAIL` | Opcional. Correo que recibe el aviso de cada envío |

4. Ejecuta la función `verificarConfiguracion` y autoriza los permisos.
5. Ejecuta `probarSubida`. Si todo está bien, verás
   `Subida correcta: /Contacto Web/prueba-conexion.txt` en el registro.

## 4. Desplegar el Web App

1. **Implementar** → **Nueva implementación** → tipo **Aplicación web**.
2. Configura:
   - **Ejecutar como:** `Yo`
   - **Quién tiene acceso:** `Cualquier usuario`
3. **Implementar** y autoriza los permisos si te los pide.
4. Copia la URL que termina en `/exec`.

Abre esa URL en el navegador. Debe devolver un JSON parecido a:

```json
{"ok":true,"service":"contacto-dropbox","version":"1.0.0","dropboxConfigurado":true}
```

Si ves una pantalla de inicio de sesión de Google, el acceso **no** está en
`Cualquier usuario` y el formulario no podrá usarlo.

> Cada vez que edites `Codigo.gs`, usa **Implementar → Gestionar
> implementaciones → Editar → Nueva versión** para conservar la misma URL.
> Si creas una implementación nueva, la URL cambia y debes actualizarla en el
> paso 5.

## 5. Conectar el sitio

Edita `js/contact-config.js` y reemplaza `appsScriptUrl` por tu URL `/exec`:

```js
appsScriptUrl: 'https://script.google.com/macros/s/TU_NUEVO_ID/exec',
```

Sube el cambio a GitHub Pages. Prueba el formulario de `index.html` y el de
`formulario.html`. El archivo debe aparecer en Dropbox dentro de
`/Contacto Web` (o la carpeta que hayas configurado).

## 6. Plan B (opcional)

Si quieres que el visitante pueda subir el archivo aunque Apps Script falle:

1. En Dropbox: **Archivos → Solicitar archivos** y crea una solicitud.
2. Copia el enlace público.
3. Pégalo en `dropboxFileRequestUrl` dentro de `js/contact-config.js`.

El formulario mostrará un botón **Subir archivo a Dropbox** junto al de email
cuando el envío falle.

## Seguridad y límites

- El token de Dropbox vive **solo** en las propiedades del script. Nunca se
  envía al navegador ni se guarda en el repositorio.
- Límite de 10 MB por archivo (validado en navegador y servidor).
- Validación de email, longitudes, extensión, tamaño y firma real del archivo
  (`%PDF`, JPEG, PNG, WEBP, DOCX/ZIP).
- Honeypot antispam, límite de 1 envío por minuto y por email y máximo de 30
  envíos por hora para todo el script.
- La carpeta de Dropbox se crea automáticamente si no existe.
- Si el token de acceso en caché fue revocado, se renueva una vez de forma
  automática con el refresh token.
- Los mensajes de error del servidor no exponen tokens ni rutas internas.
- Apps Script tiene un máximo de 6 minutos por ejecución y 50 MB por petición.
- Si usas `NOTIFY_EMAIL`, Apps Script envía el aviso desde tu cuenta de Google
  (consume cuota de correo).

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| HTTP 404 en el formulario | La implementación fue eliminada o cambió la URL | Volver a desplegar y actualizar `appsScriptUrl` |
| HTTP 401/403 | El Web App no está en «Cualquier usuario» | Cambiar el acceso en la implementación |
| El formulario recibe HTML | Despliegue privado o requiere login | Poner acceso público |
| «Dropbox no está configurado» | Faltan propiedades del script | Completar el paso 3 |
| «No se pudo autenticar con Dropbox» | App key/secret o refresh token incorrectos | Regenerar el refresh token |
| «Dropbox rechazó el archivo» | Falta el permiso `files.content.write` | Activar el permiso y volver a autorizar |
| El archivo no aparece | Estás mirando la carpeta equivocada | Revisar `DROPBOX_FOLDER` y la carpeta de la app |
