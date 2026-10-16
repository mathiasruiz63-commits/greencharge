/* Focused local tests. No network, credentials, or live WordPress mutations. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'automation/extension/engine.js'), 'utf8');
const html = (slug) => fs.readFileSync(path.join(root, 'wordpress-kit/wordpress', slug + '.html'), 'utf8');
const site = 'https://greenchargeudd.wordpress.com';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const clone = (value) => JSON.parse(JSON.stringify(value));
const guardParagraph = '<!-- wp:paragraph {"style":{"color":{"text":"#123456"}}} -->\n<p>Texto manual que debe conservarse, con atributos y sin imágenes.</p>\n<!-- /wp:paragraph -->\n';
const manualImage = '<!-- wp:image {"id":12,"sizeSlug":"full"} -->\n<figure class="wp-block-image size-full"><img src="https://greenchargeudd.files.wordpress.com/estacion.png" alt="Texto alternativo escrito por el usuario" class="wp-image-12"/><figcaption>Mi imagen insertada manualmente.</figcaption></figure>\n<!-- /wp:image -->';

function fixture(options = {}) {
  const pageSources = ['inicio', 'empresa', 'soluciones', 'contacto'].map((slug) => ({ slug, title: slug[0].toUpperCase() + slug.slice(1), content: html(slug) }));
  const articleSource = { slug: 'piloto-simulado-carga-electrica-2026', title: 'Green Charge presenta un piloto simulado: así evoluciona la carga entre enero y junio de 2026', content: html('piloto-simulado-carga-electrica-2026') };
  const makePost = (item, index, type) => ({ id: index, type, slug: item.slug, title: { raw: item.title, rendered: item.title }, content: { raw: item.content, rendered: item.content }, status: 'draft', featured_media: 0, categories: [], link: site + '/' + item.slug + '/' });
  const state = {
    settings: { url: site, title: 'sjjsjdjs', description: '', show_on_front: 'posts', page_on_front: 0, page_for_posts: 0 },
    pages: pageSources.map((item, index) => makePost(item, index + 1, 'page')),
    posts: [makePost(articleSource, 9, 'post')],
    media: ['hogar', 'estacion', 'equipo'].map((key, index) => ({ id: index + 11, slug: key, title: { raw: key }, alt_text: key === 'estacion' ? 'Texto alternativo escrito por el usuario' : '', source_url: 'https://greenchargeudd.files.wordpress.com/' + key + '.png' })),
    categories: [], navigation: [], parts: [], writes: [], calls: []
  };
  state.pages[0].content.raw = state.pages[0].content.raw.replace('<!-- /wp:buttons -->', '<!-- /wp:buttons -->\n' + manualImage);
  state.pages[1].content.raw = guardParagraph + state.pages[1].content.raw;
  const apiFetch = async (request) => {
    state.calls.push(request.path);
    const url = new URL(request.path, site);
    const method = request.method || 'GET';
    if (method !== 'GET') state.writes.push({ path: url.pathname, method });
    if (url.pathname === '/wp/v2/settings') {
      if (method !== 'GET') Object.assign(state.settings, request.data);
      return clone(state.settings);
    }
    if (url.pathname === '/') return { home: site, url: site };
    const match = url.pathname.match(/^\/wp\/v2\/(pages|posts|media|categories|navigation|template-parts)(?:\/([^/]+))?$/);
    if (!match) throw new Error('Unexpected test endpoint: ' + request.path);
    const collection = match[1] === 'template-parts' ? 'parts' : match[1];
    const rows = state[collection];
    if (!match[2] && method === 'GET') return clone(rows);
    if (!match[2] && method === 'POST') {
      if (collection === 'media') {
        assert.ok(request.body instanceof FormData, 'Upload uses FormData');
        const key = request.body.get('title');
        const item = { id: 100 + rows.length, slug: key, title: { raw: key }, alt_text: request.body.get('alt_text'), source_url: 'https://greenchargeudd.files.wordpress.com/' + request.body.get('file').name };
        rows.push(item);
        return clone(item);
      }
      const item = { id: 100 + rows.length, ...request.data };
      rows.push(item);
      return clone(item);
    }
    const item = rows.find((candidate) => String(candidate.id) === match[2]);
    if (!item) throw new Error('Test item missing: ' + request.path);
    if (method !== 'GET') {
      for (const [key, value] of Object.entries(request.data || {})) {
        item[key] = key === 'content' || key === 'title' ? { raw: value, rendered: value } : clone(value);
      }
    }
    return clone(item);
  };
  const window = {
    location: { hostname: options.foreignHost ? 'unrelated.wordpress.com' : 'greenchargeudd.wordpress.com', pathname: '/wp-admin/post.php' },
    wp: { apiFetch }
  };
  window.top = window;
  if (options.dirty) window.wp.data = { select: () => ({ isEditedPostDirty: () => true }) };
  const context = vm.createContext({ window, URL, FormData, Blob, atob, Uint8Array });
  const run = vm.runInContext(source + '\ngreenChargeSync;', context);
  const bundle = {
    mode: 'inspect', pages: pageSources, article: articleSource,
    allowedHosts: ['sjjsjdjsdotblog.wordpress.com', 'greenchargeudd.wordpress.com'],
    images: Object.fromEntries(['hogar', 'estacion', 'equipo'].map((key) => [key, { filename: key + '.png', mime: 'image/png', alt: 'Imagen conceptual ' + key, base64: png }])),
    flourish: { sesiones: '', costos: '' }
  };
  return { state, bundle, run };
}

async function applyFromInspect(test) {
  const inspected = await test.run(test.bundle);
  assert.equal(inspected.ok, true, inspected.error);
  const result = await test.run({ ...test.bundle, mode: 'apply', expected: clone(inspected.snapshot) });
  return { inspected, result };
}

async function main() {
  const checks = [];
  {
    const test = fixture();
    const inspected = await test.run(test.bundle);
    assert.equal(inspected.ok, true, inspected.error);
    assert.equal(test.state.writes.length, 0);
    assert.equal(inspected.snapshot.posts.length, 5);
    assert.deepEqual(Object.keys(inspected.snapshot.settings).sort(), ['description', 'page_for_posts', 'page_on_front', 'show_on_front', 'title']);
    assert.ok(!JSON.stringify(inspected.snapshot).includes('nonce'));
    checks.push('inspect performs zero writes and snapshots only public content');
  }
  {
    const test = fixture();
    const { result } = await applyFromInspect(test);
    assert.equal(result.ok, true, result.error);
    assert.equal((test.state.pages[2].content.raw.match(/<img\b/g) || []).length, 6);
    assert.equal((test.state.posts[0].content.raw.match(/<img\b/g) || []).length, 3);
    assert.equal((test.state.pages[0].content.raw.match(/<img\b/g) || []).length, 1);
    assert.ok(test.state.pages[0].content.raw.includes(manualImage));
    assert.ok(test.state.pages[1].content.raw.startsWith(guardParagraph));
    assert.ok(test.state.pages[1].content.raw.includes('Acercamos la carga a la vida cotidiana'));
    assert.ok(test.state.pages.every((page) => page.status === 'publish'));
    assert.equal(test.state.posts[0].status, 'publish');
    assert.equal(test.state.posts[0].featured_media, 12);
    assert.deepEqual(test.state.posts[0].categories, [100]);
    assert.equal(test.state.media.length, 3, 'Existing media reused');
    assert.equal(test.state.media[1].alt_text, 'Texto alternativo escrito por el usuario');
    assert.equal(test.state.settings.page_on_front, 1);
    assert.equal(test.state.settings.title, 'Green Charge');
    assert.ok(!/IMAGEN PENDIENTE|VISUALIZACIÓN FLOURISH PENDIENTE/.test(test.state.posts[0].content.raw));
    assert.ok(result.warnings.some((warning) => warning.includes('Flourish')));
    checks.push('apply places six catalogue and three news images while preserving manual content and existing media');
    const secondInspect = await test.run(test.bundle);
    assert.equal(secondInspect.ok, true, secondInspect.error);
    test.state.writes.length = 0;
    const second = await test.run({ ...test.bundle, mode: 'apply', expected: clone(secondInspect.snapshot) });
    assert.equal(second.ok, true, second.error);
    assert.equal(test.state.writes.length, 0);
    checks.push('second apply is idempotent for pages, article, media, categories and settings');
  }
  {
    const test = fixture();
    const inspected = await test.run(test.bundle);
    test.state.pages[0].content.raw += '\n<p>Nuevo cambio manual después de inspeccionar.</p>';
    const result = await test.run({ ...test.bundle, mode: 'apply', expected: clone(inspected.snapshot) });
    assert.equal(result.ok, false);
    assert.equal(test.state.writes.length, 0);
    assert.match(result.error, /cambiaron desde/);
    checks.push('concurrent user edits abort before any writes');
  }
  for (const name of ['missing-page', 'duplicate-page', 'bad-png']) {
    const test = fixture();
    if (name === 'missing-page') test.state.pages.pop();
    if (name === 'duplicate-page') test.state.pages.push({ ...clone(test.state.pages[1]), id: 55, slug: 'empresa-copia' });
    if (name === 'bad-png') test.bundle.images.hogar.base64 = Buffer.from('not a PNG').toString('base64');
    const result = await test.run(test.bundle);
    assert.equal(result.ok, false, name);
    assert.equal(test.state.writes.length, 0, name);
    checks.push(name + ' aborts before writes');
  }
  {
    const test = fixture();
    test.state.media = test.state.media.filter((item) => item.slug !== 'hogar');
    const { result } = await applyFromInspect(test);
    assert.equal(result.ok, true, result.error);
    assert.equal(test.state.media.filter((item) => item.slug === 'hogar').length, 1);
    assert.equal(test.state.writes.filter((write) => write.path === '/wp/v2/media').length, 1);
    checks.push('missing image uploads once through multipart FormData');
  }
  for (const options of [{ foreignHost: true }, { dirty: true }]) {
    const test = fixture(options);
    const result = await test.run(test.bundle);
    assert.equal(result.ok, false);
    assert.equal(test.state.calls.length, 0);
    assert.equal(test.state.writes.length, 0);
    checks.push(options.foreignHost ? 'unrelated site refused before API calls' : 'unsaved editor changes refused before API calls');
  }
  {
    const test = fixture();
    test.state.settings.url = 'https://unrelated.wordpress.com';
    const result = await test.run(test.bundle);
    assert.equal(result.ok, false);
    assert.equal(test.state.writes.length, 0);
    checks.push('API site mismatch refused before writes');
  }
  process.stdout.write(JSON.stringify({ ok: true, checks: checks.length, results: checks }, null, 2) + '\n');
}

main().catch((error) => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
