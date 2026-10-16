/* All code and images are packaged locally. No external code, credentials or telemetry. */
importScripts('engine.js');

const ALLOWED = new Set(['sjjsjdjsdotblog.wordpress.com', 'greenchargeudd.wordpress.com']);
let running = false;

async function state(value) {
  await chrome.storage.local.set({ estado: { ...value, fecha: new Date().toISOString() } });
}

async function runInEditor(tabId, bundle) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    world: 'MAIN',
    func: greenChargeSync,
    args: [bundle]
  });
  const result = results[0]?.result;
  if (!result || typeof result !== 'object') throw new Error('El editor no devolvió un resultado. Mantén la pestaña abierta.');
  if (!result.ok) {
    const error = new Error(result.error?.message || result.error || 'WordPress no permitió continuar.');
    error.result = result;
    throw error;
  }
  return result;
}

async function start(message) {
  if (running) throw new Error('Ya hay una preparación en curso.');
  running = true;
  let backupKey;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab?.url || 'about:blank');
    if (!ALLOWED.has(url.hostname) || url.protocol !== 'https:' || !/^\/wp-admin\/(post\.php|post-new\.php|site-editor\.php)$/.test(url.pathname)) {
      throw new Error('Abre Inicio → Editar en tu sitio Green Charge y ejecuta la herramienta desde esa pestaña.');
    }
    await state({ fase: 'comprobando', mensaje: 'Comprobando el sitio y las páginas. Todavía no se modifica nada.' });
    const response = await fetch(chrome.runtime.getURL('bundle.json'));
    const bundle = await response.json();
    if (bundle.schema !== 1 || bundle.allowedHosts.join('|') !== [...ALLOWED].join('|')) throw new Error('El paquete local no es válido.');
    bundle.flourish = { sesiones: message.sesiones || '', costos: message.costos || '' };
    const inspected = await runInEditor(tab.id, { ...bundle, mode: 'inspect' });
    if (!inspected.snapshot) throw new Error('No se obtuvo una copia previa; no se aplicaron cambios.');
    backupKey = 'copia_' + new Date().toISOString().replace(/[^0-9]/g, '');
    await chrome.storage.local.set({ [backupKey]: { fecha: new Date().toISOString(), snapshot: inspected.snapshot } });
    await state({ fase: 'preparando', mensaje: 'Copia previa guardada. Colocando imágenes y preparando el contenido…', copia: backupKey });
    const result = await runInEditor(tab.id, { ...bundle, mode: 'apply', expected: inspected.snapshot });
    await state({ fase: 'terminado', mensaje: 'La ejecución terminó. Revisa los cambios y los pendientes indicados.', resultado: result, copia: backupKey });
    try { await chrome.tabs.reload(tab.id); } catch { /* The saved report remains available if the tab was closed. */ }
    return result;
  } catch (error) {
    const message = String(error?.message || 'La operación se detuvo.').slice(0, 700);
    await state({ fase: 'detenido', mensaje: message, ...(error.result ? { resultado: error.result } : {}), ...(backupKey ? { copia: backupKey } : {}) });
    throw new Error(message);
  } finally { running = false; }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.action !== 'preparar') return;
  start(message).then(result => reply({ ok: true, result })).catch(error => reply({ ok: false, message: error.message }));
  return true;
});
