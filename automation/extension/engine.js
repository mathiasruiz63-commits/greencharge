/**
 * Runs only in the logged-in editor of one of the explicitly allowed sites.
 * Inspect is read-only. Apply requires the exact preceding public snapshot.
 * This function is intentionally self-contained for chrome.scripting MAIN.
 */
async function greenChargeSync(bundle) {
  const changes = [];
  const warnings = [];
  const verification = {};
  let snapshot;
  let stage = "preflight";
  const fail = (message) => { throw new Error(message); };
  const plainError = (error) => String(error && error.message ? error.message : "La solicitud falló.").replace(/<[^>]*>/g, "").slice(0, 600);
  const textOf = (value) => typeof value === "string" ? value : value && typeof value.raw === "string" ? value.raw : "";
  const normalized = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const escaped = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const hostname = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };
  const secureUrl = (value) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } };
  const basename = (url) => { try { return decodeURIComponent(new URL(url).pathname.split("/").pop()).toLowerCase(); } catch { return ""; } };
  const postSnapshot = (post) => ({ id: post.id, type: post.type, slug: post.slug, title: textOf(post.title), content: textOf(post.content), status: post.status, featured_media: post.featured_media || 0, categories: Array.isArray(post.categories) ? post.categories.slice() : [], link: post.link || "" });
  try {
    if (!bundle || !["inspect", "apply"].includes(bundle.mode)) fail("Selecciona inspeccionar o aplicar.");
    const fixedHosts = ["sjjsjdjsdotblog.wordpress.com", "greenchargeudd.wordpress.com"];
    const allowedHosts = fixedHosts.filter((host) => Array.isArray(bundle.allowedHosts) && bundle.allowedHosts.includes(host));
    const currentHost = window.location.hostname.toLowerCase();
    if (!allowedHosts.includes(currentHost) || !/^\/wp-admin(?:\/|$)/.test(window.location.pathname)) fail("Abre el editor wp-admin del sitio Green Charge autorizado antes de ejecutar la extensión.");
    if (window.top !== window) fail("Ejecuta la extensión en la pestaña principal del editor.");
    if (!window.wp || typeof window.wp.apiFetch !== "function") fail("El editor todavía no cargó wp.apiFetch. Abre Inicio en el editor de bloques y vuelve a intentarlo.");
    const checkEditorSaved = () => {
      if (!window.wp.data || typeof window.wp.data.select !== "function") return;
      const editor = window.wp.data.select("core/editor");
      if (editor && typeof editor.isEditedPostDirty === "function" && editor.isEditedPostDirty()) fail("Hay cambios sin guardar en el editor. Guárdalos antes de inspeccionar o aplicar el paquete.");
      if (editor && typeof editor.isSavingPost === "function" && editor.isSavingPost()) fail("El editor está guardando cambios. Espera a que termine antes de ejecutar la extensión.");
      if (editor && typeof editor.isAutosavingPost === "function" && editor.isAutosavingPost()) fail("El editor está guardando una copia automática. Espera a que termine antes de ejecutar la extensión.");
    };
    checkEditorSaved();
    const api = (path, options = {}) => window.wp.apiFetch({ path, ...options });
    const list = async (path) => {
      const result = [];
      for (let page = 1; page <= 20; page++) {
        const rows = await api(path + (path.includes("?") ? "&" : "?") + "per_page=100&page=" + page);
        if (!Array.isArray(rows)) fail("La API devolvió un listado inesperado.");
        result.push(...rows);
        if (rows.length < 100) return result;
      }
      fail("El sitio supera el límite de inspección segura; no se modificó su contenido.");
    };
    const settings = await api("/wp/v2/settings");
    let siteUrl = settings.url || settings.siteurl || settings.home || "";
    if (!siteUrl) {
      const root = await api("/");
      siteUrl = root.home || root.url || "";
    }
    if (!siteUrl || hostname(siteUrl) !== currentHost) fail("La API no confirmó que corresponde al sitio abierto. No se realizarán cambios.");
    const siteOrigin = new URL(siteUrl).origin;
    if (!siteOrigin.startsWith("https://")) fail("El sitio debe utilizar HTTPS antes de sincronizar contenido.");
    if (!Array.isArray(bundle.pages) || bundle.pages.length !== 4 || !bundle.article) fail("El paquete debe contener las cuatro páginas y la noticia.");
    const requiredSlugs = ["inicio", "empresa", "soluciones", "contacto"];
    if (new Set(bundle.pages.map((p) => p.slug)).size !== 4 || !requiredSlugs.every((slug) => bundle.pages.some((p) => p.slug === slug))) fail("Los identificadores del paquete no coinciden con Green Charge.");
    if (bundle.pages.some((p) => !p.title || typeof p.content !== "string") || !bundle.article.title || !bundle.article.slug || typeof bundle.article.content !== "string") fail("El paquete de contenido está incompleto.");
    const statuses = "publish,draft,pending,private,future";
    const pages = await list("/wp/v2/pages?context=edit&status=" + statuses);
    const posts = await list("/wp/v2/posts?context=edit&status=" + statuses);
    const findExisting = (all, item, label) => {
      const candidates = all.filter((p) => p.slug === item.slug || normalized(textOf(p.title)) === normalized(item.title));
      if (candidates.length !== 1) fail(candidates.length ? "Hay más de un contenido que coincide con «" + label + "». No se crearán duplicados." : "No se encontró «" + label + "». Importa primero el archivo original; la extensión no recrea páginas ausentes.");
      const post = candidates[0];
      if (!post.content || typeof post.content.raw !== "string" || !post.title || typeof post.title.raw !== "string") fail("La API no permitió leer el contenido editable de «" + label + "».");
      if (post.link && (hostname(post.link) !== currentHost || !secureUrl(post.link))) fail("Una página apunta a un sitio distinto al autorizado o no utiliza HTTPS.");
      return post;
    };
    const targets = bundle.pages.map((source) => ({ source, post: findExisting(pages, source, source.title) }));
    const articlePost = findExisting(posts, bundle.article, bundle.article.title);
    if (new Set(targets.map((t) => t.post.id).concat(articlePost.id)).size !== 5) fail("Los contenidos seleccionados no son cinco elementos diferentes.");
    const safeSettings = {};
    for (const key of ["title", "description", "show_on_front", "page_on_front", "page_for_posts"]) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) safeSettings[key] = settings[key];
    }
    snapshot = { version: 1, siteOrigin, settings: safeSettings, posts: targets.map((t) => postSnapshot(t.post)).concat(postSnapshot(articlePost)) };
    const allMedia = await list("/wp/v2/media?context=edit");
    const existingIds = new Set(snapshot.posts.flatMap((p) => [p.featured_media, ...Array.from(p.content.matchAll(/wp-image-(\d+)/g), (m) => Number(m[1]))]).filter(Boolean));
    const imageKeys = ["hogar", "estacion", "equipo"];
    const mediaPlan = {};
    const imageFiles = {};
    for (const key of imageKeys) {
      const image = bundle.images && bundle.images[key];
      if (!image || image.filename !== key + ".png" || image.mime !== "image/png" || typeof image.base64 !== "string" || !image.base64 || typeof image.alt !== "string") fail("Falta una imagen válida del paquete: " + key + ".");
      if (image.base64.length > 14000000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(image.base64)) fail("La imagen del paquete tiene un formato inesperado: " + key + ".");
      const bytes = Uint8Array.from(atob(image.base64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
      if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 || bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) fail("La imagen no contiene un archivo PNG válido: " + key + ".");
      imageFiles[key] = bytes;
      const matches = allMedia.filter((media) => basename(media.source_url) === image.filename || media.slug === key || normalized(textOf(media.title)) === key || normalized(textOf(media.title)) === image.filename);
      const referenced = matches.filter((media) => existingIds.has(media.id));
      if (referenced.length === 1) mediaPlan[key] = referenced[0];
      else if (matches.length === 1) mediaPlan[key] = matches[0];
      else if (matches.length > 1) fail("Hay varias imágenes llamadas «" + key + "». Revisa la biblioteca antes de aplicar cambios.");
      else mediaPlan[key] = null;
      if (mediaPlan[key] && !secureUrl(mediaPlan[key].source_url)) fail("La imagen existente «" + key + "» no tiene una URL HTTPS válida.");
    }
    let navigationBefore = [];
    let partsBefore = [];
    let navigationAvailable = false;
    try {
      navigationBefore = await list("/wp/v2/navigation?context=edit&status=publish,draft");
      partsBefore = await list("/wp/v2/template-parts?context=edit");
      if (navigationBefore.some((item) => !item.content || typeof item.content.raw !== "string") || partsBefore.some((item) => !item.content || typeof item.content.raw !== "string")) fail("La API no devolvió los bloques editables de los menús o plantillas.");
      navigationAvailable = true;
      snapshot.navigation = navigationBefore.map(postSnapshot);
      snapshot.templateParts = partsBefore.map((part) => ({ id: part.id, slug: part.slug, theme: part.theme || "", area: part.area || "", title: textOf(part.title), content: part.content.raw, status: part.status || "publish" }));
    } catch (error) {
      snapshot.navigation = null;
      snapshot.templateParts = null;
      warnings.push("La API no permitió inspeccionar menús y plantillas: " + plainError(error));
    }
    const summary = { siteOrigin, pages: targets.map((t) => ({ id: t.post.id, title: textOf(t.post.title), slug: t.post.slug, status: t.post.status })), article: { id: articlePost.id, title: textOf(articlePost.title), status: articlePost.status }, images: Object.fromEntries(imageKeys.map((key) => [key, mediaPlan[key] ? "reutilizar" : "subir"])) };
    if (bundle.mode === "inspect") return { ok: true, changes, warnings, verification, snapshot, summary };
    if (!bundle.expected || JSON.stringify(bundle.expected) !== JSON.stringify(snapshot)) fail("El contenido o los ajustes cambiaron desde la inspección. Vuelve a inspeccionar y guardar una copia antes de aplicar.");
    checkEditorSaved();

    // All mandatory content, media ambiguity, identity and concurrency checks above are read-only.
    stage = "media";
    const media = {};
    for (const key of imageKeys) {
      const image = bundle.images[key];
      let item = mediaPlan[key];
      if (!item) {
        const form = new FormData();
        form.append("file", new Blob([imageFiles[key]], { type: image.mime }), image.filename);
        form.append("title", key);
        form.append("alt_text", image.alt);
        item = await api("/wp/v2/media", { method: "POST", body: form });
        changes.push("Imagen subida: " + image.filename);
      } else if (!item.alt_text && image.alt) {
        item = await api("/wp/v2/media/" + item.id, { method: "POST", data: { alt_text: image.alt } });
        changes.push("Texto alternativo añadido: " + image.filename);
      }
      if (!item.id || !item.source_url || !secureUrl(item.source_url)) fail("La API no confirmó una URL HTTPS válida para la imagen " + key + ".");
      media[key] = item;
    }

    stage = "category";
    const categories = await list("/wp/v2/categories?context=edit");
    let articleCategory = categories.find((c) => c.slug === "articulos") || categories.find((c) => normalized(c.name) === "articulos");
    if (!articleCategory) {
      articleCategory = await api("/wp/v2/categories", { method: "POST", data: { name: "Artículos", slug: "articulos" } });
      changes.push("Categoría Artículos creada");
    }
    const linkMap = Object.fromEntries(targets.map((t) => [t.source.slug, t.post.link || siteOrigin + "/" + t.post.slug + "/"]));
    linkMap.inicio = siteOrigin + "/";
    linkMap["category/articulos"] = articleCategory.link || siteOrigin + "/category/" + articleCategory.slug + "/";
    const imageBlock = (key) => {
      const item = media[key];
      const attrs = { id: item.id, sizeSlug: "large", linkDestination: "none" };
      if (window.wp.blocks && window.wp.blocks.createBlock && window.wp.blocks.serialize) {
        return window.wp.blocks.serialize(window.wp.blocks.createBlock("core/image", { ...attrs, url: item.source_url, alt: item.alt_text || bundle.images[key].alt }));
      }
      return '<!-- wp:image ' + JSON.stringify(attrs) + ' -->\n<figure class="wp-block-image size-large"><img src="' + escaped(item.source_url) + '" alt="' + escaped(item.alt_text || bundle.images[key].alt) + '" class="wp-image-' + item.id + '"/></figure>\n<!-- /wp:image -->';
    };
    const containsImage = (html, key) => new RegExp("wp-image-" + media[key].id + "(?:[^0-9]|$)").test(html) || html.includes(media[key].source_url) || new RegExp("<img[^>]+(?:src|data-src)=[\"'][^\"']*/" + key + "(?:-[0-9]+)?\\.png(?:[?\"'])", "i").test(html);
    const markerPattern = /<!-- wp:paragraph(?:\s+\{[^\r\n]*?\})?\s*-->\s*<p\b[^>]*>\s*\[IMAGEN PENDIENTE:[^<\]\r\n]*assets\/(hogar|estacion|equipo)\.png[^<\]\r\n]*\]<\/p>\s*<!-- \/wp:paragraph -->/g;
    const flourishUrl = (value) => {
      if (!value) return "";
      try {
        const url = new URL(value);
        const match = url.pathname.match(/^\/visualisation\/(\d+)(?:\/(?:embed)?)?\/?$/);
        if (url.protocol !== "https:" || url.hostname !== "public.flourish.studio" || !match || url.username || url.password || url.search || url.hash) return "";
        return "https://public.flourish.studio/visualisation/" + match[1] + "/";
      } catch { return ""; }
    };
    const flourish = { sesiones: flourishUrl(bundle.flourish && bundle.flourish.sesiones), costos: flourishUrl(bundle.flourish && bundle.flourish.costos) };
    const hasBothFlourish = !!flourish.sesiones && !!flourish.costos && flourish.sesiones !== flourish.costos;
    if (!hasBothFlourish) warnings.push("Los dos gráficos reales de Flourish siguen pendientes. Se conservan las tablas; esta operación no crea gráficos ni cumple ese requisito de la pauta.");
    const embedBlock = (url) => '<!-- wp:embed ' + JSON.stringify({ url, type: "rich", providerNameSlug: "flourish", responsive: true }) + ' -->\n<figure class="wp-block-embed is-type-rich is-provider-flourish wp-block-embed-flourish"><div class="wp-block-embed__wrapper">\n' + url + '\n</div></figure>\n<!-- /wp:embed -->';
    const patchContent = (current, source, slug) => {
      let content = current;
      let markers = 0;
      content = content.replace(markerPattern, (whole, key, offset) => {
        markers++;
        let scope = current;
        if (slug === "soluciones") {
          const start = current.lastIndexOf("<!-- wp:column", offset);
          const end = current.indexOf("<!-- /wp:column -->", offset);
          scope = start >= 0 && end > offset ? current.slice(start, end) : "";
        }
        return containsImage(scope, key) ? "" : imageBlock(key);
      });
      if (slug === "inicio" && !containsImage(content, "estacion") && !/<img\b/i.test(content)) {
        const anchor = "<!-- /wp:buttons -->";
        if (content.includes(anchor)) content = content.replace(anchor, anchor + "\n" + imageBlock("estacion"));
        else warnings.push("Inicio: no se encontró un lugar inequívoco para insertar la imagen; se conservó el contenido.");
      }
      if (slug === "empresa" && !containsImage(content, "equipo") && !/<img\b/i.test(content)) {
        const anchor = "<!-- /wp:heading -->";
        if (content.includes(anchor)) content = content.replace(anchor, anchor + "\n" + imageBlock("equipo"));
        else warnings.push("Empresa: no se encontró un lugar inequívoco para insertar la imagen; se conservó el contenido.");
      }
      if (slug === "soluciones") {
        const products = [
          ["Wallbox Hogar 7,4 kW", "hogar"], ["Wallbox Empresas 22 kW", "hogar"],
          ["Estación Rápida DC 60 kW", "estacion"], ["Evaluación e instalación", "equipo"],
          ["Gestión de puntos de carga", "estacion"], ["Mantenimiento preventivo", "equipo"]
        ];
        content = content.replace(/<!-- wp:column(?:\s+\{[^\r\n]*?\})?\s*-->\s*<div\b[^>]*>[^]*?<!-- \/wp:column -->/g, (column) => {
          if (/<img\b/i.test(column)) return column;
          const product = products.find(([title]) => column.includes(">" + title + "</h3>"));
          return product ? column.replace(/^(<!-- wp:column(?:\s+\{[^\r\n]*?\})?\s*-->\s*<div\b[^>]*>)/, "$1\n" + imageBlock(product[1])) : column;
        });
      }
      if (slug === bundle.article.slug) {
        content = content.replace(/<!-- wp:paragraph(?:\s+\{[^\r\n]*?\})?\s*-->\s*<p\b[^>]*>\s*\[VISUALIZACIÓN FLOURISH PENDIENTE:[^<\]\r\n]*\]<\/p>\s*<!-- \/wp:paragraph -->/g, (whole) => {
          if (!hasBothFlourish) return "";
          const url = /piloto-mensual\.csv/.test(whole) ? flourish.sesiones : /comparacion-costos\.csv/.test(whole) ? flourish.costos : "";
          return url && !content.includes(url) ? embedBlock(url) : "";
        });
        if (!hasBothFlourish) {
          const truthfulReplacements = [
            ["Dos visualizaciones permiten examinar esa evolución y una comparación de costos bajo supuestos transparentes.", "Los datos permiten examinar esa evolución y una comparación de costos bajo supuestos transparentes."],
            ["La línea de Flourish permite observar la trayectoria completa", "La serie mensual permite observar la trayectoria completa"],
            ["La segunda visualización compara cuatro escenarios mensuales", "La comparación considera cuatro escenarios mensuales"],
            ["Las barras muestran únicamente el gasto de energía", "Los valores muestran únicamente el gasto de energía"]
          ];
          for (const [before, after] of truthfulReplacements) if (source.includes(before)) content = content.replace(before, after);
        }
        for (const key of imageKeys) if (!containsImage(content, key)) warnings.push("Noticia: falta colocar la imagen " + key + "; no se insertó en una posición arbitraria.");
      }
      content = content.replace(/href=(["'])\/(inicio|empresa|soluciones|contacto|category\/articulos)\/?\1/g, (whole, quote, key) => 'href=' + quote + escaped(linkMap[key]) + quote);
      return content;
    };

    stage = "pages";
    const savedPosts = [];
    for (const target of targets) {
      const content = patchContent(target.post.content.raw, target.source.content, target.source.slug);
      const data = {};
      if (content !== target.post.content.raw) data.content = content;
      if (target.post.status !== "publish") data.status = "publish";
      if (Object.keys(data).length) {
        const saved = await api("/wp/v2/pages/" + target.post.id, { method: "POST", data });
        savedPosts.push({ id: saved.id, type: "page", expectedContent: content });
        changes.push("Página actualizada: " + textOf(target.post.title));
      } else savedPosts.push({ id: target.post.id, type: "page", expectedContent: content });
    }
    stage = "article";
    const articleContent = patchContent(articlePost.content.raw, bundle.article.content, bundle.article.slug);
    const articleData = {};
    if (articleContent !== articlePost.content.raw) articleData.content = articleContent;
    if (articlePost.status !== "publish") articleData.status = "publish";
    if (!articlePost.featured_media) articleData.featured_media = media.estacion.id;
    if (!(articlePost.categories || []).includes(articleCategory.id)) articleData.categories = [...new Set([...(articlePost.categories || []), articleCategory.id])];
    if (Object.keys(articleData).length) {
      await api("/wp/v2/posts/" + articlePost.id, { method: "POST", data: articleData });
      changes.push("Noticia actualizada y publicada en Artículos");
    }
    savedPosts.push({ id: articlePost.id, type: "post", expectedContent: articleContent });

    stage = "settings";
    const desiredSettings = { title: "Green Charge", description: "Energía para tu próximo trayecto.", show_on_front: "page", page_on_front: targets.find((t) => t.source.slug === "inicio").post.id, page_for_posts: 0 };
    const settingsChanges = Object.fromEntries(Object.entries(desiredSettings).filter(([key, value]) => settings[key] !== value && Object.prototype.hasOwnProperty.call(settings, key)));
    for (const key of Object.keys(desiredSettings)) if (!Object.prototype.hasOwnProperty.call(settings, key)) warnings.push("El ajuste «" + key + "» no está disponible mediante esta API.");
    if (Object.keys(settingsChanges).length) {
      await api("/wp/v2/settings", { method: "POST", data: settingsChanges });
      changes.push("Nombre y portada configurados");
    }

    // Navigation is optional: a free site's API can restrict theme editing.
    stage = "navigation";
    try {
      if (!navigationAvailable) fail("No se pudieron respaldar los menús y las plantillas durante la inspección.");
      if (!window.wp.blocks || !window.wp.blocks.parse || !window.wp.blocks.serialize || !window.wp.blocks.createBlock) fail("El editor no ofrece las herramientas de bloques necesarias.");
      const navigation = navigationBefore;
      const parts = partsBefore;
      const navItems = ["inicio", "empresa", "soluciones", "articulos", "contacto"].map((slug) => {
        if (slug === "articulos") return { label: "Artículos", url: linkMap["category/articulos"], kind: "taxonomy", type: "category", id: articleCategory.id };
        const target = targets.find((t) => t.source.slug === slug);
        return { label: target.source.title, url: linkMap[slug], kind: "post-type", type: "page", id: target.post.id };
      });
      const navContent = window.wp.blocks.serialize(navItems.map((item) => window.wp.blocks.createBlock("core/navigation-link", item)));
      const matches = navigation.filter((nav) => normalized(textOf(nav.title)) === "green charge");
      if (matches.length > 1) fail("Hay varios menús Green Charge; se conservaron todos.");
      let nav = matches[0];
      if (!nav) {
        nav = await api("/wp/v2/navigation", { method: "POST", data: { title: "Green Charge", content: navContent, status: "publish" } });
        changes.push("Menú Green Charge creado");
      } else if (textOf(nav.content) !== navContent) {
        // Do not overwrite a menu whose links may have been edited manually.
        warnings.push("Se conservó el menú Green Charge existente, incluidos sus enlaces manuales.");
      }
      let linkedParts = 0;
      for (const area of ["header", "footer"]) {
        const exactParts = parts.filter((part) => part.slug === area);
        const areaParts = exactParts.length === 1 ? exactParts : parts.filter((part) => part.area === area);
        if (areaParts.length !== 1) { warnings.push("No se identificó una única plantilla de " + (area === "header" ? "cabecera" : "pie") + "; se conservó su diseño."); continue; }
        const part = areaParts[0];
        if (!part.content || typeof part.content.raw !== "string") { warnings.push("La plantilla " + area + " no permitió leer sus bloques editables."); continue; }
        const blocks = window.wp.blocks.parse(part.content.raw);
        let navBlocks = 0;
        let altered = false;
        const visit = (items) => items.map((block) => {
          if (block.name === "core/navigation") {
            navBlocks++;
            if (block.attributes.ref !== nav.id) {
              block.attributes = { ...block.attributes, ref: nav.id };
              block.innerBlocks = [];
              altered = true;
            }
          } else if (Array.isArray(block.innerBlocks) && block.innerBlocks.length) block.innerBlocks = visit(block.innerBlocks);
          return block;
        });
        const updated = visit(blocks);
        if (!navBlocks) {
          updated.push(window.wp.blocks.createBlock("core/navigation", { ref: nav.id, overlayMenu: area === "header" ? "mobile" : "never" }));
          altered = true;
        }
        if (altered) {
          await api("/wp/v2/template-parts/" + encodeURIComponent(part.id), { method: "POST", data: { content: window.wp.blocks.serialize(updated) } });
          changes.push("Navegación configurada en " + (area === "header" ? "cabecera" : "pie"));
        }
        linkedParts++;
      }
      verification.navigationParts = linkedParts;
    } catch (error) {
      warnings.push("Menús y plantillas: " + plainError(error) + " Requieren revisión del diseño; las páginas y la noticia se conservan.");
    }

    stage = "verification";
    const verifiedSettings = await api("/wp/v2/settings");
    verification.settings = Object.fromEntries(Object.entries(desiredSettings).map(([key, value]) => [key, verifiedSettings[key] === value]));
    verification.posts = [];
    for (const saved of savedPosts) {
      const route = saved.type === "page" ? "pages" : "posts";
      const current = await api("/wp/v2/" + route + "/" + saved.id + "?context=edit");
      const confirmed = { id: current.id, type: saved.type, published: current.status === "publish", contentPreserved: textOf(current.content) === saved.expectedContent, remainingImageMarkers: /IMAGEN PENDIENTE/.test(textOf(current.content)), imageCount: (textOf(current.content).match(/<img\b/gi) || []).length };
      verification.posts.push(confirmed);
      if (!confirmed.published || !confirmed.contentPreserved) warnings.push("La API no confirmó por completo el contenido " + saved.id + ". Revisa su versión guardada.");
      if (confirmed.remainingImageMarkers) warnings.push("Quedan marcadores de imagen en el contenido " + saved.id + ".");
      const sourceTarget = targets.find((target) => target.post.id === saved.id);
      if (sourceTarget && sourceTarget.source.slug === "soluciones" && confirmed.imageCount < 6) warnings.push("El catálogo todavía no muestra seis imágenes; se preservaron los bloques manuales.");
      if (sourceTarget && sourceTarget.source.slug === "contacto") {
        const rendered = current.content && typeof current.content.rendered === "string" ? current.content.rendered : "";
        verification.contactForm = /<form\b/i.test(rendered);
        verification.contactMap = /<iframe\b[^>]*src=["'][^"']*(?:google\.[^/]+\/maps|maps\.google\.|openstreetmap\.org)/i.test(rendered) || /wp-block-jetpack-map/.test(rendered);
        if (!verification.contactForm || !verification.contactMap) warnings.push("El formulario y el mapa requieren revisión visual en la página de Contacto. No se enviaron mensajes de prueba.");
      }
      if (saved.type === "post" && confirmed.imageCount < 3) warnings.push("La noticia todavía no muestra las tres imágenes requeridas.");
    }
    verification.flourish = hasBothFlourish ? "URLs insertadas; falta comprobar que WordPress renderice ambos gráficos" : "Pendiente: no se crearon gráficos de Flourish";
    verification.siteOrigin = siteOrigin;
    return { ok: true, changes, warnings, verification };
  } catch (error) {
    return { ok: false, stage, error: plainError(error), changes, warnings, verification, ...(bundle && bundle.mode === "inspect" && snapshot ? { snapshot } : {}) };
  }
}
