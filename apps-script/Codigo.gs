/**
 * Backend de recepción de reportes para tincanipablo.github.io/miperfil
 *
 * Qué hace:
 *  - Recibe un POST (JSON) desde index.html / formulario.html.
 *  - Guarda el archivo adjunto (base64) en una carpeta de Google Drive.
 *  - Envía un email de aviso al propietario.
 *  - Devuelve siempre JSON: { "ok": true, ... } o { "ok": false, "error": "..." }
 *
 * No contiene credenciales de Dropbox ni de ningún otro servicio.
 * Los permisos se otorgan a la cuenta que despliega el script (Drive + Gmail).
 *
 * Despliegue: ver README.md en esta misma carpeta.
 */

const CARPETA_DESTINO = 'Reportes Web';
const EMAIL_DESTINO = 'tincanipablo@gmail.com';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function doPost(e) {
  try {
    const data = parsear_(e);
    const nombre = limpiar_(data.nombre, 200);
    const email = limpiar_(data.email, 200);
    const mensaje = limpiar_(data.mensaje, 5000);
    const archivoNombre = limpiar_(data.archivoNombre, 200);
    const archivoBase64 = String(data.archivoBase64 || '');

    if (!mensaje && !archivoBase64) {
      throw new Error('No se recibieron datos.');
    }

    let enlace = '';
    if (archivoBase64) {
      const bytes = Utilities.base64Decode(archivoBase64);
      if (bytes.length > MAX_BYTES) {
        throw new Error('El archivo supera el límite de 10 MB.');
      }
      const nombreSeguro = (archivoNombre || 'archivo')
        .replace(/[^\w.\- ]+/g, '_')
        .slice(0, 150);
      const blob = Utilities.newBlob(bytes, 'application/octet-stream', nombreSeguro);
      const archivo = carpeta_().createFile(blob);
      enlace = archivo.getUrl();
    }

    MailApp.sendEmail({
      to: EMAIL_DESTINO,
      subject: 'Nuevo reporte desde el sitio web',
      body: [
        'Nombre: ' + (nombre || '(sin nombre)'),
        'Email: ' + (email || '(sin email)'),
        '',
        'Mensaje:',
        mensaje,
        '',
        enlace ? 'Archivo: ' + enlace : 'Sin archivo adjunto.'
      ].join('\n')
    });

    return json_({ ok: true, archivo: enlace });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: err.message || 'Error interno' });
  }
}

function doGet() {
  return json_({ ok: true, servicio: 'reportes', version: 1 });
}

function parsear_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (_) {
      // Si no es JSON, seguimos con los parámetros del formulario.
    }
  }
  return (e && e.parameter) || {};
}

function limpiar_(valor, max) {
  return String(valor == null ? '' : valor).slice(0, max);
}

function carpeta_() {
  const iter = DriveApp.getFoldersByName(CARPETA_DESTINO);
  return iter.hasNext() ? iter.next() : DriveApp.createFolder(CARPETA_DESTINO);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
