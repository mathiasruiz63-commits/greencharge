# Verificación de la automatización

16 de octubre de 2026. No se inició sesión ni se modificó el WordPress real del usuario.

## Pruebas ejecutadas

`node automation/tests/engine.cjs`: **11 casos aprobados** con API simulada. Comprueba inspección sin escrituras; seis imágenes de catálogo y tres de noticia; preservación de imagen y texto alternativo manuales; conservación de párrafos con atributos; reutilización de medios; repetición sin nuevas escrituras; carga multipart de una imagen ausente; bloqueo ante cambios concurrentes, páginas ausentes o duplicadas, PNG incorrecto, sitio ajeno, cambios sin guardar e identidad de API distinta.

`node automation/tests/browser_extension.cjs`: flujo probado en Chromium con API de WordPress y APIs de extensión simuladas. Se utiliza el código original del popup y del worker, y se serializa la función como exige `chrome.scripting`. La copia previa se guarda antes de las mutaciones, el flujo de cambios finaliza y solicita recarga. Se comprueba el bloqueo de un sitio ajeno. No hubo solicitudes o escrituras externas.

El resultado detallado está en `tests/browser-extension-report.json`. Los archivos JavaScript pasan la comprobación de sintaxis de Node.

## Límites

- El navegador administrado del entorno impide cargar extensiones descomprimidas. No se intentó eludir esa política. La instalación real y la concesión de `activeTab` no están verificadas aquí.
- La sesión del usuario y los permisos de su WordPress.com gratuito todavía no se han probado. La herramienta se detiene si no identifica sitio, contenidos o una API autorizada.
- La simulación del navegador no registra todas las herramientas Gutenberg de navegación. Esa parte requiere la comprobación en el sitio real; el informe comunica restricciones.
- No se crean cuentas ni visualizaciones de Flourish. La noticia puede publicarse con las tablas y una redacción que no afirma tener gráficos interactivos. El requisito de Flourish sigue pendiente hasta crear e insertar los dos gráficos reales.
- La herramienta no envía mensajes de prueba por el formulario ni verifica la recepción de correo.

## Permisos y datos

El manifiesto solicita exclusivamente `activeTab`, `scripting` y `storage`. No contiene permisos permanentes de dominios ni código remoto. Las imágenes se incluyen dentro del ZIP. Las solicitudes de edición usan `wp.apiFetch` en el contexto del editor que el usuario ya abrió; no se leen ni exportan cookies, nonces o contraseñas. Las copias locales contienen solo los contenidos y ajustes que puede modificar la automatización. No hay llamadas a facturación, usuarios, planes o dominios.
