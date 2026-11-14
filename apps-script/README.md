# Backend de reportes (Google Apps Script)

El formulario de `index.html` y `formulario.html` envía los datos a un **Web App de Google Apps Script**. No hay backend propio ni credenciales en el navegador.

## Por qué falla con "Failed to fetch"

La URL configurada actualmente:

```
https://script.google.com/macros/s/AKfycbwS2lcFIwkkkluk3orwgDjVHvAPkCOsT_Y3PPBXiTFr3uZE39DpOCW-8doJbHgZ7ko/exec
```

devuelve **HTTP 404**. Eso significa que el despliegue del Web App fue eliminado o reemplazado. Cuando `fetch()` recibe un 404 sin cabeceras CORS, el navegador lanza `TypeError: Failed to fetch`. **No es un error del JavaScript**: el servicio ya no existe.

Para que vuelva a funcionar hay que crear un despliegue nuevo y actualizar la URL.

## Despliegue paso a paso (5 minutos)

1. Abrir <https://script.google.com> e iniciar sesión con la cuenta de Gmail que debe recibir los reportes.
2. **Nuevo proyecto**. Ponerle un nombre, por ejemplo `Reportes Web`.
3. Borrar el contenido de `Código.gs` y pegar el contenido de [`Codigo.gs`](./Codigo.gs).
4. Guardar (Ctrl+S).
5. **Implementar → Nueva implementación → Tipo: Aplicación web**.
   - Descripción: `Reportes v1`
   - **Ejecutar como: Yo**
   - **Quién tiene acceso: Cualquier persona** (importante: no "Cualquier persona con cuenta de Google").
6. **Implementar**. La primera vez va a pedir autorización:
   - *Revisar permisos* → elegir la cuenta → *Avanzado* → *Ir a Reportes Web (no seguro)* → *Permitir*.
   - Es normal: el script necesita permiso para crear archivos en Drive y enviar emails.
7. Copiar la **URL del Web App** (termina en `/exec`).
8. Pegarla en `index.html` y `formulario.html`, en la constante:

   ```js
   const URL_APPS_SCRIPT = 'https://script.google.com/macros/s/…/exec';
   ```

9. Probar: abrir esa URL en el navegador. Debe devolver:

   ```json
   {"ok":true,"servicio":"reportes","version":1}
   ```

10. Probar el formulario del sitio. El archivo queda en la carpeta **Reportes Web** de Google Drive y llega un email a `tincanipablo@gmail.com`.

## Si cambiás el código

Los cambios no se aplican solos al despliegue existente:

**Implementar → Gestionar implementaciones → editar (lápiz) → Versión: Nueva versión → Implementar.**

La URL `/exec` se mantiene, pero el código se actualiza.

## Notas

- Límite de archivo: **10 MB** (configurable en `MAX_BYTES`). El formulario de `index.html` acepta PDF; `formulario.html` acepta PDF/DOC/DOCX/TXT/JPG/PNG.
- El endpoint es público (necesario para que el navegador pueda llamarlo). Por eso el script valida tamaño y campos. Si querés más protección, agregá un captcha (Turnstile/reCAPTCHA) o un límite por IP con `CacheService`.
- **No** poner tokens de Dropbox ni claves en este archivo ni en el HTML. Si en el futuro hace falta un secreto, usar **Configuración del proyecto → Propiedades del script**.
- Cuota de Gmail: 100 emails/día en cuentas gratuitas. Para un formulario de contacto es más que suficiente.
