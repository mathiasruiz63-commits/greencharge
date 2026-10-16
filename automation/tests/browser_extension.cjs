'use strict';

/* Local Chromium integration test. All WordPress APIs below are simulated.
 * No real WordPress session, cookies, credentials or external writes are used.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');

const extensionPath = path.resolve(__dirname, '../extension');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'greencharge-browser-test-'));
const bundle = JSON.parse(fs.readFileSync(path.join(extensionPath, 'bundle.json'), 'utf8'));
const initialObjects = bundle.pages.map((item, index) => ({
  id: index + 10, type: 'page', slug: item.slug, status: 'publish',
  title: { raw: item.title, rendered: item.title },
  content: { raw: item.content, rendered: item.content },
  modified: '2026-10-16T10:00:00', modified_gmt: '2026-10-16T13:00:00',
  link: `https://greenchargeudd.wordpress.com/${item.slug}/`,
}));
initialObjects.push({
  id: 50, type: 'post', slug: bundle.article.slug, status: 'draft',
  title: { raw: bundle.article.title, rendered: bundle.article.title },
  content: { raw: bundle.article.content, rendered: bundle.article.content },
  modified: '2026-10-16T10:00:00', modified_gmt: '2026-10-16T13:00:00',
  link: `https://greenchargeudd.wordpress.com/${bundle.article.slug}/`,
  featured_media: 0, categories: [7],
});

function createFixture({ objects, origin, settings }) {
  const state = {
    objects: structuredClone(objects), settings: structuredClone(settings),
    calls: [], media: [], categories: [{ id: 7, slug: 'articulos', name: 'Artículos' }],
    templateParts: [], navigation: [], nextMedia: 100,
  };
  window.__greenChargeTestState = state;
  const clone = value => JSON.parse(JSON.stringify(value));
  const error = (code, message, status = 404) => Object.assign(new Error(message), { code, data: { status } });
  window.wp = {
    data: {
      select: () => ({
        isEditedPostDirty: () => false, isSavingPost: () => false,
        getCurrentPostId: () => 10, getCurrentPostType: () => 'page',
      }),
      dispatch: () => ({ resetBlocks() {}, editPost() {}, receiveEntityRecords() {}, invalidateResolution() {} }),
    },
    apiFetch: async options => {
      const method = (options.method || 'GET').toUpperCase();
      const url = new URL(options.path, origin);
      const pathname = url.pathname.replace(/^\/wp-json/, '');
      state.calls.push({ method, path: url.pathname + url.search, time: Date.now() });
      if (typeof window.__saveWPTestState === 'function') await window.__saveWPTestState(clone(state));
      if (pathname === '/wp/v2/settings') {
        if (method === 'GET') return clone(state.settings);
        Object.assign(state.settings, options.data || {}); return clone(state.settings);
      }
      if (pathname === '/wp/v2/users/me') return { id: 1, roles: ['administrator'], capabilities: { edit_pages: true, edit_posts: true, upload_files: true, manage_options: true, edit_theme_options: true } };
      if (pathname === '/wp/v2/themes') return [{ id: 'twentytwentyfour', stylesheet: 'twentytwentyfour', status: 'active' }];
      if (pathname === '/wp/v2/categories') {
        if (method === 'GET') return clone(state.categories.filter(item => !url.searchParams.has('slug') || item.slug === url.searchParams.get('slug')));
        const item = { id: 8, ...options.data }; state.categories.push(item); return clone(item);
      }
      if (pathname === '/wp/v2/template-parts' || pathname === '/wp/v2/navigation') return [];
      if (pathname === '/wp/v2/media') {
        if (method === 'GET') return clone(state.media);
        assertLocalFormData(options.body);
        const file = options.body.get('file');
        const item = {
          id: state.nextMedia++, slug: file.name.replace(/\.png$/, ''), title: { rendered: file.name, raw: file.name },
          source_url: `${origin}/wp-content/uploads/${file.name}`,
          alt_text: '', media_details: { width: 1536, height: 1024 },
        };
        state.media.push(item); return clone(item);
      }
      const mediaMatch = pathname.match(/^\/wp\/v2\/media\/(\d+)$/);
      if (mediaMatch) {
        const item = state.media.find(media => media.id === Number(mediaMatch[1]));
        if (!item) throw error('rest_post_invalid_id', 'Mock media not found');
        if (method !== 'GET') Object.assign(item, options.data || {});
        return clone(item);
      }
      const collection = pathname.match(/^\/wp\/v2\/(pages|posts)$/);
      if (collection && method === 'GET') {
        let items = state.objects.filter(item => item.type === (collection[1] === 'pages' ? 'page' : 'post'));
        if (url.searchParams.has('slug')) {
          const slugs = url.searchParams.get('slug').split(','); items = items.filter(item => slugs.includes(item.slug));
        }
        return clone(items);
      }
      const itemMatch = pathname.match(/^\/wp\/v2\/(pages|posts)\/(\d+)$/);
      if (itemMatch) {
        const item = state.objects.find(object => object.id === Number(itemMatch[2]));
        if (!item) throw error('rest_post_invalid_id', 'Mock content not found');
        if (method !== 'GET') {
          const data = options.data || {};
          for (const [key, value] of Object.entries(data)) {
            item[key] = key === 'content' || key === 'title' ? { raw: value, rendered: value } : value;
          }
        }
        return clone(item);
      }
      throw error('mock_unsupported_route', `Mock has no route ${method} ${pathname}`);
    },
  };
  function assertLocalFormData(body) {
    if (!(body instanceof FormData) || !(body.get('file') instanceof File)) throw error('mock_bad_upload', 'Expected local FormData file', 400);
  }
}

async function main() {
  const vm = require('node:vm');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: '/usr/bin/chromium', headless: true,
      ignoreDefaultArgs: ['--unsafely-disable-devtools-self-xss-warnings'],
    });
    const unexpectedRequests = [];
    let capturedState;
    await context.exposeFunction('__saveWPTestState', value => { capturedState = value; });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'greenchargeudd.wordpress.com' || url.hostname === 'example.test') {
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><h1>Local WordPress simulation</h1></body></html>' });
      }
      unexpectedRequests.push(route.request().url()); await route.abort();
    });
    const editor = await context.newPage();
    const origin = 'https://greenchargeudd.wordpress.com';
    await editor.goto(`${origin}/wp-admin/post.php?post=10&action=edit`);
    await editor.evaluate(createFixture, {
      objects: initialObjects, origin,
      settings: { title: 'Nombre provisional', description: '', url: origin, show_on_front: 'page', page_on_front: 10, page_for_posts: 0 },
    });
    const storage = {};
    const storageTimeline = [];
    let activeTab = { id: 1, url: editor.url() };
    let reloadCount = 0;
    let messageHandler;
    let popup;
    const extensionId = 'greencharge-local-test';
    const mockChrome = {
      runtime: {
        id: extensionId,
        getURL: file => `chrome-extension://${extensionId}/${file}`,
        onMessage: { addListener: listener => { messageHandler = listener; } },
      },
      tabs: { query: async () => [activeTab], reload: async tabId => { assert.equal(tabId, 1); reloadCount++; } },
      storage: { local: {
        set: async values => {
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: storage[key], newValue: structuredClone(value) };
            storage[key] = structuredClone(value);
          }
          storageTimeline.push({ time: Date.now(), keys: Object.keys(values) });
          if (popup && !popup.isClosed()) await popup.evaluate(value => {
            if (typeof window.__storageCallback === 'function') window.__storageCallback(value, 'local');
          }, changes);
        },
        get: async keys => keys === null ? structuredClone(storage) : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in storage).map(key => [key, structuredClone(storage[key])])),
      } },
      scripting: { executeScript: async options => {
        assert.equal(options.world, 'MAIN'); assert.deepEqual(Array.from(options.target.frameIds), [0]); assert.equal(options.target.tabId, 1);
        const result = await editor.evaluate(`(${options.func.toString()})(${JSON.stringify(options.args[0])})`);
        return [{ frameId: 0, result }];
      } },
    };
    const sandbox = vm.createContext({
      chrome: mockChrome, URL, Date, console, setTimeout,
      fetch: async url => {
        assert.equal(url, `chrome-extension://${extensionId}/bundle.json`);
        return { json: async () => structuredClone(bundle) };
      },
    });
    sandbox.importScripts = file => {
      assert.equal(file, 'engine.js'); vm.runInContext(fs.readFileSync(path.join(extensionPath, file), 'utf8'), sandbox);
    };
    vm.runInContext(fs.readFileSync(path.join(extensionPath, 'background.js'), 'utf8'), sandbox);
    const sendMessage = message => new Promise(resolve => {
      const pending = messageHandler(message, { id: extensionId }, resolve); assert.equal(pending, true);
    });
    await context.exposeFunction('__chromeTestGet', keys => mockChrome.storage.local.get(keys));
    await context.exposeFunction('__chromeTestMessage', message => sendMessage(message));
    popup = await context.newPage();
    await popup.goto('https://example.test/popup-fixture');
    const popupHtml = fs.readFileSync(path.join(extensionPath, 'popup.html'), 'utf8').replace(/<script[^>]+src="popup\.js"[^>]*><\/script>/, '').replace(/<link[^>]+href="popup\.css"[^>]*>/, '');
    await popup.setContent(popupHtml);
    await popup.evaluate(() => {
      window.chrome = {
        storage: { local: { get: keys => window.__chromeTestGet(keys) }, onChanged: { addListener: callback => { window.__storageCallback = callback; } } },
        runtime: { sendMessage: message => window.__chromeTestMessage(message) },
      };
    });
    await popup.addScriptTag({ content: fs.readFileSync(path.join(extensionPath, 'popup.js'), 'utf8') });
    await popup.locator('#preparar').click();
    for (let attempts = 0; attempts < 1200 && !['terminado', 'detenido'].includes(storage.estado?.fase); attempts++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(storage.estado?.fase, 'terminado', JSON.stringify(storage.estado));
    const keys = Object.keys(storage).filter(key => key.startsWith('copia_'));
    assert.equal(keys.length, 1, 'One local pre-change backup must exist');
    const backupEvent = storageTimeline.find(event => event.keys.includes(keys[0]));
    assert(backupEvent, 'The backup write must be observed');
    const final = capturedState;
    const firstMutation = final.calls.find(call => call.method !== 'GET');
    assert(firstMutation, 'Expected simulated WordPress updates');
    assert(backupEvent.time <= firstMutation.time, 'Backup precedes simulated remote updates');
    assert.equal(final.media.length, 3);
    assert.equal(final.settings.title, 'Green Charge');
    assert.equal(final.objects.filter(object => object.type === 'page').length, 4, 'No duplicate page created');
    assert.equal(final.objects.find(object => object.id === 50).status, 'publish', 'Publication was authorized');
    assert(storage.estado.resultado?.warnings.some(value => /Flourish.*pendientes|gráficos reales de Flourish/i.test(value)), 'Missing Flourish charts must remain explicit');
    assert.equal(reloadCount, 1, 'The worker requests an editor reload after success');
    assert.equal(unexpectedRequests.length, 0, 'No outside requests in the simulation');
    const completed = structuredClone(storage.estado);
    activeTab = { id: 2, url: 'https://example.test/wp-admin/post.php?post=10&action=edit' };
    const wrongReply = await sendMessage({ action: 'preparar' });
    assert.equal(wrongReply.ok, false);
    assert.equal(storage.estado.fase, 'detenido');
    assert.equal(Object.keys(storage).filter(key => key.startsWith('copia_')).length, 1, 'Wrong host must not begin another operation');
    assert.equal(reloadCount, 1, 'Wrong host must not reload or mutate a tab');
    const report = {
      test: 'Local Chromium DOM/MAIN-engine integration with simulated extension APIs and WordPress APIs',
      browser: context.browser().version(), actualWordPressAccountTested: false,
      extensionInstallTest: { status: 'blocked', reason: 'This managed Chromium reports: Loading of unpacked extensions is disabled by the administrator. No policy bypass attempted.' },
      extensionPermissionsValidated: false,
      checks: ['actual popup JavaScript and DOM', 'actual worker control flow with mocked Chrome APIs', 'MAIN-world self-contained engine in Chromium', 'preflight', 'local backup before mutations', 'three packaged media uploads', 'four existing pages only', 'article published with explicit missing-Flourish warning', 'editor reload requested after success', 'wrong host rejected', 'zero external network requests'],
      mediaUploaded: final.media.length, mutationCount: final.calls.filter(call => call.method !== 'GET').length,
      warnings: completed.resultado?.warnings || [],
    };
    fs.writeFileSync(path.join(__dirname, 'browser-extension-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
