/**
 * Puente de contacto: sitio estático (GitHub Pages) -> Google Apps Script -> Dropbox.
 *
 * El navegador solo conoce la URL /exec de este Web App. Las credenciales de
 * Dropbox se guardan en "Configuración del proyecto > Propiedades del script"
 * y NUNCA se envían al cliente.
 *
 * Instalación paso a paso: apps-script/README.md
 *
 * Propiedades del script:
 *   DROPBOX_APP_KEY        (obligatoria)
 *   DROPBOX_APP_SECRET     (obligatoria)
 *   DROPBOX_REFRESH_TOKEN  (obligatoria; recomendada)
 *   DROPBOX_ACCESS_TOKEN   (alternativa temporal de corta duración)
 *   DROPBOX_FOLDER         (opcional, por defecto /Contacto Web)
 *   DROPBOX_CREATE_LINK    (opcional: "true" para crear enlace compartido)
 *   SHEET_ID               (opcional: Google Sheet para registrar envíos)
 *   NOTIFY_EMAIL           (opcional: aviso por email de cada envío)
 *
 * Límites de este puente:
 *   - 10 MB por archivo (el navegador valida lo mismo).
 *   - Apps Script corta la ejecución a los 6 minutos.
 *   - Dropbox /2/files/upload acepta hasta 150 MB por llamada.
 */

var CONFIG = {
    MAX_FILE_BYTES: 10 * 1024 * 1024,
    MAX_NAME: 120,
    MAX_EMAIL: 254,
    MAX_MESSAGE: 5000,
    MAX_FILENAME: 120,
    ALLOWED_EXT: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'webp'],
    RATE_LIMIT_SECONDS: 60,
    TOKEN_CACHE_SECONDS: 3 * 60 * 60
};

function ErrorSeguro(mensaje) {
    this.name = 'ErrorSeguro';
    this.message = mensaje;
}
ErrorSeguro.prototype = Object.create(Error.prototype);
ErrorSeguro.prototype.constructor = ErrorSeguro;

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

function doGet() {
    return json_({
        ok: true,
        service: 'contacto-dropbox',
        version: '1.0.0',
        dropboxConfigurado: Boolean(
            (getProp_('DROPBOX_APP_KEY') && getProp_('DROPBOX_APP_SECRET') && getProp_('DROPBOX_REFRESH_TOKEN')) ||
            getProp_('DROPBOX_ACCESS_TOKEN')
        ),
        hora: new Date().toISOString()
    });
}

function doPost(e) {
    var rateKey = '';

    try {
        if (!e || !e.postData || !e.postData.contents) {
            throw new ErrorSeguro('Solicitud vacía.');
        }

        var data;
        try {
            data = JSON.parse(e.postData.contents);
        } catch (error) {
            throw new ErrorSeguro('Los datos enviados no son JSON válido.');
        }

        // Honeypot: los bots suelen rellenar todos los campos. Respondemos "ok"
        // para no darles pistas, pero no subimos nada.
        if (data.website) {
            return json_({ ok: true, mensaje: 'Reporte recibido.' });
        }

        var nombre = clean_(data.nombre, CONFIG.MAX_NAME) || 'Sin nombre';
        var email = clean_(data.email, CONFIG.MAX_EMAIL);
        var mensaje = clean_(data.mensaje, CONFIG.MAX_MESSAGE);
        var archivoNombre = clean_(data.archivoNombre, CONFIG.MAX_FILENAME);
        var archivoBase64 = typeof data.archivoBase64 === 'string' ? data.archivoBase64 : '';

        if (!isEmail_(email)) {
            throw new ErrorSeguro('El email no es válido.');
        }
        if (mensaje.length < 5) {
            throw new ErrorSeguro('El mensaje es demasiado corto.');
        }
        if (!archivoBase64) {
            throw new ErrorSeguro('Falta el archivo adjunto.');
        }

        var extension = extension_(archivoNombre);
        if (CONFIG.ALLOWED_EXT.indexOf(extension) === -1) {
            throw new ErrorSeguro('Extensión de archivo no permitida.');
        }

        // Base64 ocupa ~4/3 del tamaño real. Validamos antes de decodificar
        // para evitar picos de memoria.
        var maxBase64 = Math.ceil(CONFIG.MAX_FILE_BYTES * 4 / 3) + 2048;
        if (archivoBase64.length > maxBase64) {
            throw new ErrorSeguro('El archivo supera el límite de 10 MB.');
        }

        var bytes;
        try {
            bytes = Utilities.base64Decode(archivoBase64);
        } catch (error) {
            throw new ErrorSeguro('El archivo adjunto está dañado o mal codificado.');
        }

        if (bytes.length === 0) {
            throw new ErrorSeguro('El archivo está vacío.');
        }
        if (bytes.length > CONFIG.MAX_FILE_BYTES) {
            throw new ErrorSeguro('El archivo supera el límite de 10 MB.');
        }
        if (!firmaValida_(bytes, extension)) {
            throw new ErrorSeguro('El contenido del archivo no coincide con el formato declarado.');
        }

        // Límite anti-spam: 1 envío por minuto y por email.
        var cache = CacheService.getScriptCache();
        rateKey = 'rl_' + hash_(email.toLowerCase());
        if (cache.get(rateKey)) {
            throw new ErrorSeguro('Espera un minuto antes de enviar otro mensaje.');
        }

        // Límite global: evita que un bot sature la cuota de Dropbox cambiando
        // de email en cada intento.
        var horaActual = Math.floor(Date.now() / 3600000);
        var globalKey = 'rl_global_' + horaActual;
        var enviadosEnLaHora = Number(cache.get(globalKey) || 0);
        if (enviadosEnLaHora >= 30) {
            throw new ErrorSeguro('Se alcanzó el límite temporal de envíos. Inténtalo más tarde.');
        }

        cache.put(rateKey, '1', CONFIG.RATE_LIMIT_SECONDS);
        cache.put(globalKey, String(enviadosEnLaHora + 1), 3600);

        var carpeta = normalizarCarpeta_(getProp_('DROPBOX_FOLDER') || '/Contacto Web');
        var nombreSeguro = nombreArchivoSeguro_(archivoNombre, extension);
        var ruta = carpeta + '/' + marcaTiempo_() + '_' + nombreSeguro;
        var mime = mimePorExtension_(extension);
        var blob = Utilities.newBlob(bytes, mime, nombreSeguro);

        asegurarCarpeta_(carpeta);
        var subido = subirADropbox_(ruta, blob);
        var rutaFinal = subido.path_display || ruta;

        var enlace = '';
        if (String(getProp_('DROPBOX_CREATE_LINK')).toLowerCase() === 'true') {
            enlace = crearEnlaceCompartido_(rutaFinal);
        }

        registrarEnSheet_([new Date(), nombre, email, mensaje, rutaFinal, enlace]);
        notificarPorEmail_(nombre, email, mensaje, rutaFinal, enlace);

        return json_({
            ok: true,
            mensaje: 'Reporte enviado correctamente.',
            archivo: rutaFinal,
            enlace: enlace
        });

    } catch (error) {
        if (rateKey) {
            try {
                CacheService.getScriptCache().remove(rateKey);
            } catch (ignore) { /* sin acción */ }
        }

        console.error(error && error.stack ? error.stack : error);

        var mensajePublico = error && error.name === 'ErrorSeguro'
            ? error.message
            : 'No se pudo procesar la solicitud. Inténtalo más tarde.';

        return json_({ ok: false, error: mensajePublico });
    }
}

/* ------------------------------------------------------------------ */
/* Dropbox                                                             */
/* ------------------------------------------------------------------ */

function tokenDropbox_() {
    var props = PropertiesService.getScriptProperties();
    var directo = props.getProperty('DROPBOX_ACCESS_TOKEN');
    if (directo) return directo;

    var cache = CacheService.getScriptCache();
    var enCache = cache.get('dropbox_access_token');
    if (enCache) return enCache;

    var appKey = props.getProperty('DROPBOX_APP_KEY');
    var appSecret = props.getProperty('DROPBOX_APP_SECRET');
    var refreshToken = props.getProperty('DROPBOX_REFRESH_TOKEN');

    if (!appKey || !appSecret || !refreshToken) {
        throw new ErrorSeguro('Dropbox no está configurado en el servidor.');
    }

    var response = UrlFetchApp.fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'post',
        payload: {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: appKey,
            client_secret: appSecret
        },
        muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code !== 200) {
        console.error('Dropbox token HTTP ' + code + ': ' + body);
        throw new ErrorSeguro('No se pudo autenticar con Dropbox. Revisa las credenciales del servidor.');
    }

    var token = '';
    try {
        token = JSON.parse(body).access_token || '';
    } catch (error) {
        token = '';
    }
    if (!token) {
        throw new ErrorSeguro('Dropbox devolvió una respuesta de autenticación inválida.');
    }

    cache.put('dropbox_access_token', token, CONFIG.TOKEN_CACHE_SECONDS);
    return token;
}

function asegurarCarpeta_(ruta) {
    var response = UrlFetchApp.fetch('https://api.dropboxapi.com/2/files/create_folder_v2', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + tokenDropbox_() },
        payload: JSON.stringify({ path: ruta, autorename: false }),
        muteHttpExceptions: true
    });

    var code = response.getResponseCode();

    // 200 = creada; 409 = ya existía. Cualquier otro código es un problema real.
    if (code !== 200 && code !== 409) {
        console.error('Dropbox create_folder HTTP ' + code + ': ' + response.getContentText());
        throw new ErrorSeguro('No se pudo preparar la carpeta de Dropbox.');
    }
}

function subirADropbox_(ruta, blob) {
    var intento = 0;
    var response;
    var code;
    var body;

    while (intento < 2) {
        intento++;

        response = UrlFetchApp.fetch('https://content.dropboxapi.com/2/files/upload', {
            method: 'post',
            contentType: 'application/octet-stream',
            headers: {
                Authorization: 'Bearer ' + tokenDropbox_(),
                'Dropbox-API-Arg': JSON.stringify({
                    path: ruta,
                    mode: 'add',
                    autorename: true,
                    mute: false,
                    strict_conflict: false
                })
            },
            payload: blob.getBytes(),
            muteHttpExceptions: true
        });

        code = response.getResponseCode();
        body = response.getContentText();

        // Si el token estaba en caché y fue revocado, se renueva una vez.
        if (code === 401 && intento === 1 && !getProp_('DROPBOX_ACCESS_TOKEN')) {
            CacheService.getScriptCache().remove('dropbox_access_token');
            continue;
        }

        break;
    }

    if (code !== 200) {
        console.error('Dropbox upload HTTP ' + code + ': ' + body);
        throw new ErrorSeguro('Dropbox rechazó el archivo (HTTP ' + code + ').');
    }

    try {
        return JSON.parse(body);
    } catch (error) {
        throw new ErrorSeguro('Dropbox devolvió una respuesta inválida.');
    }
}

function crearEnlaceCompartido_(ruta) {
    try {
        var response = UrlFetchApp.fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
            method: 'post',
            contentType: 'application/json',
            headers: { Authorization: 'Bearer ' + tokenDropbox_() },
            payload: JSON.stringify({ path: ruta }),
            muteHttpExceptions: true
        });

        if (response.getResponseCode() === 200) {
            return JSON.parse(response.getContentText()).url || '';
        }

        // Si ya existe un enlace, lo recuperamos.
        var listado = UrlFetchApp.fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
            method: 'post',
            contentType: 'application/json',
            headers: { Authorization: 'Bearer ' + tokenDropbox_() },
            payload: JSON.stringify({ path: ruta, direct_only: true }),
            muteHttpExceptions: true
        });

        if (listado.getResponseCode() === 200) {
            var links = JSON.parse(listado.getContentText()).links || [];
            return links.length ? (links[0].url || '') : '';
        }
    } catch (error) {
        console.error('No se pudo crear el enlace de Dropbox: ' + error);
    }
    return '';
}

/* ------------------------------------------------------------------ */
/* Registro / avisos opcionales                                        */
/* ------------------------------------------------------------------ */

function registrarEnSheet_(fila) {
    var sheetId = getProp_('SHEET_ID');
    if (!sheetId) return;

    try {
        var spreadsheet = SpreadsheetApp.openById(sheetId);
        var sheet = spreadsheet.getSheetByName('Contactos') || spreadsheet.insertSheet('Contactos');

        if (sheet.getLastRow() === 0) {
            sheet.appendRow(['Fecha', 'Nombre', 'Email', 'Mensaje', 'Archivo', 'Enlace']);
        }

        sheet.appendRow(fila);
    } catch (error) {
        console.error('No se pudo registrar en Google Sheets: ' + error);
    }
}

function notificarPorEmail_(nombre, email, mensaje, ruta, enlace) {
    var destino = getProp_('NOTIFY_EMAIL');
    if (!destino) return;

    try {
        MailApp.sendEmail({
            to: destino,
            replyTo: email,
            subject: 'Nuevo contacto web: ' + nombre.replace(/[\r\n]+/g, ' ').slice(0, 80),
            body: [
                'Nombre: ' + nombre,
                'Email: ' + email,
                '',
                'Mensaje:',
                mensaje,
                '',
                'Archivo en Dropbox: ' + ruta,
                enlace ? 'Enlace: ' + enlace : ''
            ].join('\n')
        });
    } catch (error) {
        console.error('No se pudo enviar el aviso por email: ' + error);
    }
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function json_(objeto) {
    return ContentService
        .createTextOutput(JSON.stringify(objeto))
        .setMimeType(ContentService.MimeType.JSON);
}

function getProp_(clave) {
    return PropertiesService.getScriptProperties().getProperty(clave);
}

function clean_(valor, maximo) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\r\n?/g, '\n')
        .trim()
        .slice(0, maximo);
}

function isEmail_(email) {
    if (!email || email.length > CONFIG.MAX_EMAIL) return false;
    if (/[\r\n]/.test(email)) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function extension_(nombre) {
    var match = String(nombre || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
}

function nombreArchivoSeguro_(nombre, extension) {
    var base = String(nombre || '')
        .replace(/\.[^.]+$/, '')
        .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-')
        .replace(/\s+/g, '_')
        .replace(/^[.\s]+|[.\s]+$/g, '')
        .slice(0, CONFIG.MAX_FILENAME - 20);

    if (!base) base = 'archivo';
    return base + '.' + extension;
}

function normalizarCarpeta_(carpeta) {
    var limpia = String(carpeta || '/Contacto Web')
        .replace(/\\/g, '/')
        .split('/')
        .filter(function (parte) {
            return parte && parte !== '.' && parte !== '..';
        })
        .join('/');
    return '/' + limpia;
}

function marcaTiempo_() {
    return Utilities.formatDate(new Date(), 'UTC', 'yyyyMMdd-HHmmss');
}

function hash_(texto) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
    return bytes.map(function (b) {
        var v = (b < 0 ? b + 256 : b).toString(16);
        return v.length === 1 ? '0' + v : v;
    }).join('');
}

function mimePorExtension_(extension) {
    var tipos = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        txt: 'text/plain',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp'
    };
    return tipos[extension] || 'application/octet-stream';
}

/**
 * Comprobación básica de firma (magic bytes). Evita que alguien suba un
 * ejecutable renombrado como .pdf o .jpg.
 */
function firmaValida_(bytes, extension) {
    function b(i) { return bytes[i] & 0xFF; }

    if (extension === 'pdf') {
        return b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46; // %PDF
    }
    if (extension === 'jpg' || extension === 'jpeg') {
        return b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF;
    }
    if (extension === 'png') {
        return b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47;
    }
    if (extension === 'webp') {
        return b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && // RIFF
            b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50; // WEBP
    }
    if (extension === 'docx') {
        return b(0) === 0x50 && b(1) === 0x4B; // ZIP (PK)
    }
    // .doc y .txt no tienen una firma fiable; se validan por extensión.
    return true;
}

/* ------------------------------------------------------------------ */
/* Diagnóstico manual (ejecutar desde el editor de Apps Script)        */
/* ------------------------------------------------------------------ */

/**
 * Muestra qué propiedades faltan. No imprime ningún secreto.
 */
function verificarConfiguracion() {
    var props = PropertiesService.getScriptProperties();
    var claves = ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN', 'DROPBOX_ACCESS_TOKEN',
        'DROPBOX_FOLDER', 'SHEET_ID', 'NOTIFY_EMAIL'];

    claves.forEach(function (clave) {
        console.log(clave + ': ' + (props.getProperty(clave) ? 'definida' : 'vacía'));
    });
}

/**
 * Sube un archivo de prueba a Dropbox para validar credenciales y permisos.
 */
function probarSubida() {
    var contenido = 'Prueba de conexión del formulario web. ' + new Date().toISOString();
    var bytes = Utilities.newBlob(contenido, 'text/plain', 'prueba.txt').getBytes();
    var carpeta = normalizarCarpeta_(getProp_('DROPBOX_FOLDER') || '/Contacto Web');
    var resultado = subirADropbox_(carpeta + '/prueba-conexion.txt', Utilities.newBlob(bytes, 'text/plain', 'prueba.txt'));
    console.log('Subida correcta: ' + (resultado.path_display || resultado.id));
}
