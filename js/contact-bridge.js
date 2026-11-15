// Configurado por PAUT
/*
 * Puente de contacto: navegador -> Google Apps Script -> Dropbox.
 *
 * Responsabilidades:
 *  - Validar el archivo antes de enviarlo (tamaño, extensión y vacío).
 *  - Convertirlo a Base64.
 *  - Enviar JSON con "Content-Type: text/plain" (evita el preflight CORS,
 *    que Apps Script no soporta).
 *  - Interpretar correctamente errores HTTP, redirecciones y páginas HTML
 *    (por ejemplo, un despliegue eliminado o privado).
 *  - Ofrecer un plan B por Dropbox si el servicio no responde.
 *
 * No contiene credenciales. No usa innerHTML con datos del usuario.
 */
(function () {
    'use strict';

    var DEFAULTS = {
        appsScriptUrl: '',
        maxFileMB: 10,
        timeoutMs: 180000,
        dropboxFileRequestUrl: ''
    };

    var config = Object.assign({}, DEFAULTS, window.CONTACT_CONFIG || {});
    var SAFE_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'webp'];

    function extensionOf(name) {
        var match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
        return match ? match[1] : '';
    }

    function maxBytes(options) {
        var mb = options && options.maxMB ? Number(options.maxMB) : Number(config.maxFileMB);
        if (!isFinite(mb) || mb <= 0) mb = DEFAULTS.maxFileMB;
        return mb * 1024 * 1024;
    }

    function validateFile(file, options) {
        if (!file) {
            throw new Error('Selecciona un archivo antes de enviar.');
        }
        if (file.size === 0) {
            throw new Error('El archivo está vacío.');
        }
        if (file.size > maxBytes(options)) {
            throw new Error('El archivo supera el límite de ' + (options && options.maxMB ? options.maxMB : config.maxFileMB) + ' MB.');
        }

        var allowed = (options && options.allowedExt) || SAFE_EXTENSIONS;
        var ext = extensionOf(file.name);
        if (allowed.indexOf(ext) === -1) {
            throw new Error('Formato no permitido. Usa: ' + allowed.join(', ').toUpperCase() + '.');
        }

        var allowedMime = options && options.allowedMime;
        if (allowedMime && file.type && allowedMime.indexOf(file.type) === -1) {
            throw new Error('El tipo real del archivo no coincide con un formato permitido.');
        }
    }

    function fileToBase64(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                var result = String(reader.result || '');
                var comma = result.indexOf(',');
                if (comma === -1) {
                    reject(new Error('No se pudo leer el archivo.'));
                    return;
                }
                resolve(result.slice(comma + 1));
            };
            reader.onerror = function () {
                reject(new Error('No se pudo leer el archivo.'));
            };
            reader.onabort = function () {
                reject(new Error('La lectura del archivo fue cancelada.'));
            };
            reader.readAsDataURL(file);
        });
    }

    function setStatus(element, type, message) {
        if (!element) return;

        var palettes = {
            info: ['#e8f0fe', '#0b3d91'],
            success: ['#d4edda', '#155724'],
            warning: ['#fff3cd', '#856404'],
            error: ['#f8d7da', '#721c24']
        };
        var palette = palettes[type] || palettes.info;

        element.style.display = 'block';
        element.style.backgroundColor = palette[0];
        element.style.color = palette[1];
        element.style.border = '1px solid rgba(0, 0, 0, 0.08)';
        element.textContent = message;
    }

    function clearFallback() {
        var old = document.getElementById('contact-fallback');
        if (old && old.parentNode) {
            old.parentNode.removeChild(old);
        }
    }

    function isHttpUrl(value) {
        try {
            var url = new URL(value);
            return url.protocol === 'https:' || url.protocol === 'http:';
        } catch (error) {
            return false;
        }
    }

    function showFallback(statusElement) {
        if (!statusElement || !statusElement.parentNode) return;

        clearFallback();

        var box = document.createElement('div');
        box.id = 'contact-fallback';
        box.style.cssText = 'margin-top:14px;padding:14px 16px;border:1px solid rgba(255,255,255,.15);' +
            'border-radius:10px;background:rgba(255,255,255,.04);color:#cbd5e1;font-size:.9rem;' +
            'line-height:1.6;text-align:left;';

        var text = document.createElement('p');
        text.style.margin = '0 0 10px';
        text.textContent = 'No se pudo completar el envío. Inténtalo más tarde' +
            (config.dropboxFileRequestUrl ? ' o sube el archivo a Dropbox.' : '.');
        box.appendChild(text);

        var actions = document.createElement('div');
        actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';

        if (config.dropboxFileRequestUrl && isHttpUrl(config.dropboxFileRequestUrl)) {
            var dropboxLink = document.createElement('a');
            dropboxLink.href = config.dropboxFileRequestUrl;
            dropboxLink.target = '_blank';
            dropboxLink.rel = 'noopener noreferrer';
            dropboxLink.textContent = '📤 Subir archivo a Dropbox';
            dropboxLink.style.cssText = 'display:inline-block;padding:9px 14px;border-radius:8px;' +
                'background:#0061ff;color:#fff;text-decoration:none;font-weight:600;';
            actions.appendChild(dropboxLink);
        }

        box.appendChild(actions);
        statusElement.insertAdjacentElement('afterend', box);
    }

    function normalizeError(error) {
        if (!error) return 'No se pudo completar el envío.';
        if (error.name === 'AbortError') {
            return 'El servidor tardó demasiado en responder. Inténtalo de nuevo.';
        }
        if (error instanceof TypeError) {
            return 'No se pudo conectar con el servicio de envío. Revisa tu conexión e inténtalo de nuevo.';
        }
        return error.message || 'No se pudo completar el envío.';
    }

    async function send(data) {
        var url = String(config.appsScriptUrl || '').trim();

        if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
            throw new Error('El servicio de envío no está configurado. Revisa js/contact-config.js.');
        }

        var file = data && data.file;
        var payload = {
            nombre: String((data && data.nombre) || '').trim(),
            email: String((data && data.email) || '').trim(),
            mensaje: String((data && data.mensaje) || '').trim(),
            website: String((data && data.website) || ''),
            archivoNombre: file ? file.name : '',
            archivoTipo: file ? (file.type || '') : '',
            archivoBase64: ''
        };

        if (file) {
            payload.archivoBase64 = await fileToBase64(file);
        }

        var controller = new AbortController();
        var timer = setTimeout(function () {
            controller.abort();
        }, Number(config.timeoutMs) || DEFAULTS.timeoutMs);

        var response;
        var text = '';

        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload),
                redirect: 'follow',
                cache: 'no-store',
                credentials: 'omit',
                signal: controller.signal
            });

            text = await response.text();
        } catch (error) {
            throw new Error(normalizeError(error));
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('El servicio de carga no existe o fue despublicado (HTTP 404). ' +
                    'Hay que volver a desplegar Google Apps Script.');
            }
            if (response.status === 401 || response.status === 403) {
                throw new Error('El servicio de carga rechazó la petición (HTTP ' + response.status + '). ' +
                    'Comprueba que el Web App esté desplegado para "Cualquier usuario".');
            }
            throw new Error('El servicio de envío respondió con un error (HTTP ' + response.status + ').');
        }

        if (!text || !text.trim()) {
            throw new Error('El servicio de envío no devolvió respuesta.');
        }

        // Apps Script devuelve HTML cuando el despliegue es privado, no existe
        // o requiere iniciar sesión. Nunca mostramos ese HTML al visitante.
        if (/^\s*<!doctype|^\s*<html/i.test(text)) {
            throw new Error('El servicio de envío devolvió una página HTML en lugar de datos. ' +
                'El Web App de Google Apps Script no está público o fue despublicado.');
        }

        var result;
        try {
            result = JSON.parse(text);
        } catch (error) {
            throw new Error('El servicio de envío devolvió una respuesta inválida.');
        }

        if (!result || result.ok !== true) {
            throw new Error(result && result.error ? String(result.error) : 'No se pudo completar el envío.');
        }

        return result;
    }

    window.ContactBridge = {
        config: config,
        validateFile: validateFile,
        fileToBase64: fileToBase64,
        send: send,
        setStatus: setStatus,
        showFallback: showFallback,
        clearFallback: clearFallback,
    };
})();
