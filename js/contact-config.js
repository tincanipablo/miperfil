/*
 * Configuración del puente de contacto.
 *
 * El formulario del sitio NO habla directamente con Dropbox: envía los datos a
 * un Web App de Google Apps Script, que guarda el archivo en Dropbox usando un
 * token que permanece en las propiedades del script (nunca en el navegador).
 *
 * IMPORTANTE:
 * La URL actual devuelve HTTP 404 porque el despliegue de Apps Script fue
 * eliminado o cambió. Para restaurar el envío:
 *   1. Despliega el código de apps-script/Codigo.gs (ver apps-script/README.md).
 *   2. Copia la URL /exec que te entregue Google.
 *   3. Reemplaza el valor de appsScriptUrl aquí abajo.
 *
 * Este archivo es público (GitHub Pages): nunca pongas aquí tokens,
 * contraseñas ni claves de Dropbox.
 */
window.CONTACT_CONFIG = {
    // Ejemplo: 'https://script.google.com/macros/s/AKfy.../exec'
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbwS2lcFIwkkkluk3orwgDjVHvAPkCOsT_Y3PPBXiTFr3uZE39DpOCW-8doJbHgZ7ko/exec',

    // Límite real por envío. Apps Script y Dropbox trabajan bien con 8-10 MB.
    maxFileMB: 10,

    // Tiempo máximo de espera para la subida (milisegundos).
    timeoutMs: 180000,

    // Correo de respaldo si el servicio de carga no está disponible.
    contactEmail: 'tincanipablo@gmail.com',

    // Opcional: enlace "File request" de Dropbox para que el visitante suba el
    // archivo directamente si el formulario falla. Déjalo vacío si no lo usas.
    // Ejemplo: 'https://www.dropbox.com/request/XXXXXXXXXXXX'
    dropboxFileRequestUrl: ''
};
