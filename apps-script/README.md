# Puente de contacto: Apps Script y Dropbox

## Qué hace `Codigo.gs`

El sitio envía el formulario y el adjunto al Web App de Apps Script. El script
guarda en Dropbox:

- el archivo adjunto original;
- un archivo `.txt` con nombre basado en el correo, por ejemplo
  `ejemplosinarrobagmail.com.txt`, con nombre, correo, asunto, descripción,
  fecha y ruta del adjunto.

Las credenciales de Dropbox no se incluyen en el código ni en GitHub. Se
guardan en las propiedades privadas del proyecto de Apps Script.

## Actualizar el proyecto existente

1. Abre el proyecto de Apps Script que tiene el despliegue actual.
2. Abre el archivo `Codigo.gs` de este repositorio y copia todo su contenido.
3. En el proyecto de Apps Script, abre el archivo existente `Codigo.gs`,
   selecciona todo su contenido, reemplázalo por el código copiado y guarda.
   No crees un segundo archivo con funciones duplicadas.
4. No borres `Configurar.gs` si contiene las funciones para intercambiar el
   código OAuth. No vuelvas a ejecutar esa función: el refresh token ya está
   guardado en las propiedades del proyecto.
5. En Apps Script, selecciona y ejecuta `verificarConfiguracion`. Confirma que
   `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET` y `DROPBOX_REFRESH_TOKEN` estén
   definidas. El registro solo muestra su estado, nunca los valores.
6. Ejecuta `probarSubida` y confirma que Dropbox recibe el archivo de prueba.
7. En **Implementar → Gestionar implementaciones**, edita la implementación
   actual, selecciona **Nueva versión** y pulsa **Implementar**. Esto permite
   conservar la URL `/exec` que ya usa el sitio.
8. Comprueba la URL `/exec` en un navegador; debe responder con JSON y mostrar
   `"dropboxConfigurado":true`.

La URL pública `/exec` usada por el frontend está en
[`../js/contact-config.js`](../js/contact-config.js). Si Google entrega otra
URL, actualiza `appsScriptUrl` en ese archivo antes de publicar el sitio.

## Prueba de los formularios

Después de desplegar el backend y publicar los cambios del sitio:

1. Envía el formulario de `index.html` con un PDF pequeño.
2. Confirma en Dropbox que aparezcan el adjunto y el `.txt` con el correo
   convertido a nombre de archivo (`@` se reemplaza por `sinarroba`).
3. Envía también el formulario de `formulario.html` con un archivo permitido y
   confirma que se guarden ambos archivos.

Si un correo vuelve a enviar el formulario, Dropbox evita sobrescribir el `.txt`
anterior y le asigna un sufijo al nuevo archivo.
