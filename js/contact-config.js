// Configurado por PAUT
/*
 * Configuración del puente de contacto.
 *
 * El formulario del sitio envía los datos al backend de apps-script/Codigo.gs.
 * El despliegue de Apps Script se comprobó y respondió correctamente.
 * Sus credenciales permanecen en las propiedades privadas del proyecto.
 *
 * Este archivo es público (GitHub Pages): nunca pongas aquí tokens,
 * contraseñas ni claves de Dropbox.
 */
window.CONTACT_CONFIG = {
    // Ejemplo: 'https://script.google.com/macros/s/AKfy.../exec'
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbxzf9oujjCxJOVa34G2vpDXM9DXhCU9isBa7Xb9aDZGmhfDQ-MmVl654yIthgAD3Rzy/exec',

    // Límite real por envío. Apps Script y Dropbox trabajan bien con 8-10 MB.
    maxFileMB: 10,

    // Tiempo máximo de espera para la subida (milisegundos).
    timeoutMs: 180000,

    // Opcional: enlace "File request" de Dropbox para que el visitante suba el
    // archivo directamente si el formulario falla. Déjalo vacío si no lo usas.
    // Ejemplo: 'https://www.dropbox.com/request/XXXXXXXXXXXX'
    dropboxFileRequestUrl: ''
};
