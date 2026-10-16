# Green Charge · automatización temporal para Chrome

Esta extensión local ejecuta operaciones en el editor WordPress donde ya iniciaste sesión. No instala plugins en WordPress, no contrata servicios y no solicita ni exporta contraseñas, cookies o tokens. No utiliza el campo WORDPRESS_ACCESS_TOKEN de Codex.

## Ejecutar una vez

1. Descomprime `GreenCharge-Automatico.zip`.
2. En Google Chrome, abre `chrome://extensions` y activa **Modo de desarrollador** arriba a la derecha.
3. Pulsa **Cargar descomprimida** y selecciona la carpeta **GreenCharge-Automatico**, la que contiene `manifest.json`.
4. Abre tu sitio y entra en **Páginas → Inicio → Editar**. Espera a que termine de cargar el editor. Guarda primero cualquier cambio que estés editando.
5. En el icono de extensiones de Chrome (pieza de puzle), abre **Green Charge · Preparar WordPress** y pulsa **Preparar mi sitio**. Mantén la pestaña abierta mientras trabaja. Si cierras el cuadro, puedes volver a abrirlo para consultar el estado.

Si la extensión no identifica el sitio, las cuatro páginas o una sesión con permisos, se detiene antes de modificar contenido. No cambies ajustes de seguridad para forzar que funcione. Copia el informe si aparece un error.

## Alcance

- Hace una comprobación previa y guarda en el almacenamiento local de la extensión una copia del contenido objetivo antes de aplicar los cambios. Puedes descargarla con **Guardar mis copias previas**.
- Busca las páginas ya importadas y evita crear duplicados.
- Reutiliza imágenes que identifica en la biblioteca y sube las ausentes desde este mismo paquete.
- Conserva cambios existentes y coloca imágenes en marcadores o posiciones que identifica con seguridad. Informa lo que no puede colocar.
- Configura título, portada y los elementos de navegación que permita la API del tema. Conserva otras partes de las plantillas.
- No elimina páginas ni medios. No cambia planes, dominios, usuarios o facturación.
- No crea cuentas ni visualizaciones en Flourish. Las dos visualizaciones reales siguen siendo un requisito pendiente. Si ya tienes sus enlaces públicos, puedes indicarlos antes de ejecutar.

La lógica se prueba localmente con una simulación de las API y en un navegador real. La instalación completa de la extensión no se pudo probar en el navegador de este entorno porque una política de administrador impide cargar extensiones descomprimidas. No se intentó eludirla. Eso no demuestra que tu Chrome tenga la misma restricción, ni que todos los endpoints estén disponibles en tu cuenta gratuita: el informe distingue cambios y pendientes. No se ha ejecutado en tu sitio desde Codex. Si tu equipo también indica que un administrador bloquea la instalación, no cambies su seguridad para forzarla.

## Después

Revisa el informe y el sitio público. Si necesitas compartir el resultado de la ejecución, usa **Copiar informe**, que no incluye credenciales. Guarda tus copias previas antes de quitar la extensión; su almacenamiento se elimina al desinstalarla. Puedes quitarla desde `chrome://extensions` cuando termine el trabajo.

Los datos, precios, equipo y resultados del proyecto son ficticios. Las imágenes son conceptuales generadas con IA.
