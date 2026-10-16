const startButton = document.querySelector('#preparar');
let lastState;

function list(title, values) {
  if (!Array.isArray(values) || !values.length) return;
  const heading = document.createElement('h2'); heading.textContent = title;
  const ul = document.createElement('ul');
  for (const value of values) { const li = document.createElement('li'); li.textContent = typeof value === 'string' ? value : JSON.stringify(value); ul.append(li); }
  document.querySelector('#resultado').append(heading, ul);
}
function render(value) {
  if (!value) return;
  lastState = value;
  startButton.disabled = ['comprobando', 'preparando'].includes(value.fase);
  document.querySelector('#estado').textContent = value.mensaje;
  document.querySelector('#resultado').replaceChildren();
  list('Cambios realizados', value.resultado?.changes);
  list('Pendientes', value.resultado?.warnings);
  document.querySelector('#informe').hidden = false;
}
chrome.storage.local.get('estado').then(data => render(data.estado));
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.estado) render(changes.estado.newValue); });
startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  document.querySelector('#estado').textContent = 'Iniciando…';
  try {
    const response = await chrome.runtime.sendMessage({ action: 'preparar', sesiones: document.querySelector('#sesiones').value.trim(), costos: document.querySelector('#costos').value.trim() });
    if (!response?.ok) document.querySelector('#estado').textContent = response?.message || 'No se completó la operación.';
  } catch { document.querySelector('#estado').textContent = 'La ejecución no pudo iniciarse. Vuelve a abrir la herramienta para consultar el estado.'; }
  const data = await chrome.storage.local.get('estado'); render(data.estado);
});
document.querySelector('#informe').addEventListener('click', async () => {
  if (lastState) { await navigator.clipboard.writeText(JSON.stringify(lastState, null, 2)); document.querySelector('#informe').textContent = 'Informe copiado'; }
});
document.querySelector('#copias').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(null);
  const copies = Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('copia_')));
  if (!Object.keys(copies).length) { document.querySelector('#estado').textContent = 'Aún no hay copias previas guardadas.'; return; }
  const url = URL.createObjectURL(new Blob([JSON.stringify(copies, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'GreenCharge-copias-previas.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
});
