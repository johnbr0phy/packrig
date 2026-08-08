import { SLOTS, productSlotFor, colorwayFor } from './bags.js';
import { productsForSlot } from './catalog.js';
import { PAINTS } from './bike.js';
import { ENV_NAMES } from './environments.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/** Same as el() but sets textContent — use for anything catalog-derived. */
const elt = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Mount points grouped by the zone of the bike they live on. */
const ZONES = [
  { label: 'Cockpit', slots: ['barroll', 'barbag', 'randobag', 'stemL', 'stemR', 'toptube'] },
  { label: 'Frame', slots: ['framebag_full', 'framebag_half', 'downtube'] },
  { label: 'Saddle', slots: ['seatpack', 'saddlebag'] },
  { label: 'Fork', slots: ['forkL', 'forkR'] },
  { label: 'Rear', slots: ['pannierL', 'pannierR', 'trunk'] },
];

/** Mini sky→ground gradients standing in for a render of each environment. */
const ENV_THUMB = {
  mountain: ['#6b7c92', '#8a94a0'],
  lake: ['#7fb4c9', '#37697d'],
  forest: ['#a8c4a0', '#3a5040'],
  desert: ['#e8b184', '#c09a6e'],
  night: ['#0a1020', '#3b3f46'],
};

const PAINT_LABEL = {
  Slate: 'Slate Grey',
  Forest: 'Forest Green',
  Oxblood: 'Oxblood',
  Midnight: 'Midnight Blue',
  Sand: 'Desert Sand',
  Violet: 'Deep Violet',
};

const WORD = /[\p{L}\p{N}]+/gu;

/** Words that identify the brand, from both its full and short name. */
function brandWords(brand) {
  const set = new Set();
  for (const s of [brand?.name, brand?.short]) {
    if (!s) continue;
    for (const m of String(s).matchAll(WORD)) set.add(m[0].toLowerCase());
  }
  return set;
}

/** "Rapha Explore Seat Pack 10L" under brand RAPHA → "Explore Seat Pack 10L". */
function modelName(product, brand) {
  const full = String(product?.name || '');
  const words = brandWords(brand);
  if (!words.size) return full;
  let cut = 0;
  for (const m of full.matchAll(WORD)) {
    if (!words.has(m[0].toLowerCase())) { cut = m.index; break; }
    cut = m.index + m[0].length;
  }
  const rest = full.slice(cut).replace(/^[\s\-–—·/,:.]+/, '').trim();
  return rest || full;
}

/** Capacity to one decimal at most: 10 → "10 L", 3.75 → "3.8 L". */
function litersOf(p) {
  const l = Number(p?.liters);
  // A harness carries drybags sold separately, so it has NO capacity rather
  // than zero litres — "0 L" reads as a product that holds nothing.
  if (l === 0) return '—';
  return Number.isFinite(l) ? `${Math.round(l * 10) / 10} L` : '—';
}

/** Model name with the trailing capacity dropped — it gets its own column. */
function displayName(product, brand) {
  const name = modelName(product, brand);
  if (product?.liters == null) return name;
  const tail = new RegExp(`[\\s·\\-–—]*${String(product.liters).replace('.', '\\.')}\\s*L$`, 'i');
  return name.replace(tail, '').trim() || name;
}

/** Product family ("Expedition"). Older catalog entries have no line. */
const lineOf = (p) => String(p?.line || '').trim();

/** "14L" / "Large" — falls back to the volume when the catalog has no size. */
function sizeOf(product) {
  const s = String(product?.size ?? '').trim();
  const base = s || (Number.isFinite(Number(product?.liters))
    ? `${Math.round(Number(product.liters) * 10) / 10}L` : '');
  // Some listings ship two bags. The maker's own "scope of delivery" tells us
  // which; a bare "20L" on a paired listing reads as one bag and misleads.
  const per = Number(product?.features?.bagsPerListing);
  if (per === 2 && !/pair/i.test(base)) return `${base} · pair`;
  return base;
}

/** True when the size says nothing the volume column isn't already saying. */
function sizeIsVolume(product) {
  const l = Number(product?.liters);
  if (!Number.isFinite(l)) return false;
  return sizeOf(product).replace(/\s+/g, '').toLowerCase() === `${Math.round(l * 10) / 10}l`;
}

/** Drop a leading line name so cards under "EXPEDITION" don't repeat it. */
function stripLine(name, line) {
  if (!line || !name.toLowerCase().startsWith(line.toLowerCase())) return name;
  const rest = name.slice(line.length).replace(/^[\s\-–—·]+/, '').trim();
  return rest || name;
}

/** Full model name including its line: "Expedition Handlebar Pack". */
function modelTitle(product, brand) {
  const line = lineOf(product);
  const base = stripLine(displayName(product, brand), line);
  return line ? `${line} ${base}` : base;
}

/** Official product page — only http(s), since the href comes from data. */
function srcOf(product) {
  const raw = String(product?.src || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** Link out to the maker's product page; null when the catalog has no URL. */
function buyLink(product, brand, label, cls) {
  const href = srcOf(product);
  if (!href) return null;
  const a = elt('a', cls, label);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.title = `Buy at ${brand?.short || brand?.name || 'the maker'}`;
  a.onclick = (e) => e.stopPropagation(); // buying is not equipping
  return a;
}

function swatchStyle(product, brand) {
  const cols = (product?.colors?.length ? product.colors : brand?.palette) || [];
  if (cols.length > 1) return `linear-gradient(135deg, ${cols[0]} 0 50%, ${cols[1]} 50% 100%)`;
  return cols[0] || '#5b6068';
}

export function initUI(app) {
  const root = document.getElementById('ui-root');
  root.innerHTML = '';

  // remember the opening camera framing so "reset view" has somewhere to go
  const homeView = {
    pos: app.camera?.position?.clone?.() || null,
    target: app.controls?.target?.clone?.() || null,
  };

  // ---- wordmark ----------------------------------------------------------
  // soft scrim keeps the wordmark legible over pale skies (lake, desert)
  root.append(el('div', 'top-scrim'));
  const mark = el('div', 'wordmark');
  mark.append(el('h1', null, 'PACKRIG'), el('p', null, 'Bikepacking configurator'));
  root.append(mark);

  // ---- left panel: what is on the bike -----------------------------------
  const panel = el('div', 'panel glass');
  const head = el('header', 'panel-head');
  const countEl = elt('span', 'panel-count', '(0)');
  head.append(elt('span', 'panel-title', 'On your bike'), countEl);
  const listEl = el('div', 'bag-list');

  const foot = el('div', 'panel-foot');
  const summary = el('div', 'kit-summary');
  const totalEl = elt('span', 'kit-total', '0 L');
  summary.append(elt('span', 'kit-label', 'Total capacity'), totalEl);
  const addBtn = el('button', 'add-bag', '<span class="plus">+</span> Add a bag');
  addBtn.title = 'Pick a mount point';
  addBtn.onclick = () => openMountPicker();
  const shareBtn = el('button', 'share-kit');
  const shareLabel = elt('span', 'lbl', 'Share kit');
  shareBtn.append(elt('span', 'ic', '⧉'), shareLabel);
  shareBtn.title = 'Copy a link to this build';
  shareBtn.onclick = () => shareKit(shareBtn, shareLabel);
  foot.append(summary, addBtn, shareBtn);
  panel.append(head, listEl, foot);
  root.append(panel);
  listEl.addEventListener('scroll', updateFade);

  // ---- bottom dock: actions + frame colour -------------------------------
  const dock = el('div', 'dock');
  const btnRand = el('button', 'btn quiet', '<span class="bolt">⚡</span> Surprise me');
  btnRand.onclick = () => app.randomize();
  // clearing the whole bike is destructive, so it asks once before it fires
  const btnClear = elt('button', 'btn ghost', 'Clear bike');
  let clearTimer = null;
  const resetClear = () => {
    clearTimeout(clearTimer);
    btnClear.classList.remove('confirm');
    btnClear.textContent = 'Clear bike';
  };
  btnClear.onclick = () => {
    if (btnClear.classList.contains('confirm')) {
      resetClear();
      app.clearAll();
      return;
    }
    btnClear.classList.add('confirm');
    btnClear.textContent = 'Sure?';
    clearTimer = setTimeout(resetClear, 3000);
  };

  const paintGroup = el('div', 'paint-group');
  paintGroup.append(elt('span', 'group-label', 'Frame'));
  const paints = el('div', 'paints');
  for (const [name, def] of Object.entries(PAINTS)) {
    const sw = el('button', 'paint');
    sw.style.background = '#' + def.color.toString(16).padStart(6, '0');
    sw.title = PAINT_LABEL[name] || name;
    sw.setAttribute('aria-label', `Frame colour: ${PAINT_LABEL[name] || name}`);
    sw.dataset.paint = name;
    sw.onclick = () => app.setPaint(name);
    paints.append(sw);
  }
  paintGroup.append(paints);

  // Bidon colour — the bottles are part of the build, so they belong here.
  const bidonGroup = el('div', 'bottle-group');
  bidonGroup.append(elt('span', 'lbl', 'Bidons'));
  const bidons = el('div', 'bidons');
  const BIDON_COLORS = [
    ['#6fa892', 'Mint'], ['#c2601f', 'Burnt orange'], ['#e8e6e1', 'Chalk'],
    ['#1d1f22', 'Black'], ['#c9483a', 'Red'], ['#3f6ea8', 'Blue'],
  ];
  let bidonPick = 0;
  for (const [hex, label] of BIDON_COLORS) {
    const sw = el('button', 'bidon');
    sw.style.background = hex;
    sw.title = label;
    sw.setAttribute('aria-label', `Bidon colour: ${label}`);
    sw.onclick = () => {
      // alternate which bottle you're painting, so both are reachable
      const key = bidonPick % 2 === 0 ? 'st' : 'dt';
      app.bike.setBottleColor(key, parseInt(hex.slice(1), 16));
      bidonPick++;
      for (const b of bidons.children) b.classList.remove('on');
      sw.classList.add('on');
    };
    bidons.append(sw);
  }
  bidonGroup.append(bidons);

  // ---- environment picker -------------------------------------------------
  // Five labelled photo cards ate 40% of the bar for a setting touched once.
  // A compact swatch row says the same thing in a fifth of the space.
  const envs = el('div', 'envs compact');
  for (const name of ENV_NAMES) {
    const chip = el('button', 'env-chip');
    const [sky, ground] = ENV_THUMB[name] || ['#8a8f96', '#3a3e44'];
    chip.style.background = `linear-gradient(160deg, ${sky}, ${ground})`;
    chip.dataset.env = name;
    chip.title = `${name[0].toUpperCase() + name.slice(1)} environment`;
    chip.setAttribute('aria-label', `Environment: ${name}`);
    chip.onclick = () => app.setEnv(name);
    envs.append(chip);
  }
  const envGroup = el('div', 'paint-group');
  envGroup.append(elt('span', 'group-label', 'Scene'));
  envGroup.append(envs);

  // One bar, one rhythm: build actions left, appearance right. "Surprise me"
  // drops to a quiet icon button — it was the loudest thing on screen for the
  // least consequential action.
  dock.append(
    btnRand, btnClear,
    el('span', 'divider'),
    paintGroup, el('span', 'divider'), bidonGroup, el('span', 'divider'), envGroup
  );
  const bottom = el('div', 'bottom-bar glass');
  bottom.append(dock);
  root.append(bottom);

  // the hint retires for good once the user has driven the camera, or after 5s
  const HINT_KEY = 'packrig.hintSeen';
  const seen = (() => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } })();
  let hint = null;
  const canvas = document.getElementById('scene') || window;
  function killHint() {
    if (!hint) return;
    const node = hint;
    hint = null;
    node.classList.add('gone');
    setTimeout(() => node.remove(), 700);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode — just fade */ }
    canvas.removeEventListener('pointerdown', killHint);
    canvas.removeEventListener('wheel', killHint);
  }
  if (!seen) {
    hint = el('div', 'hint', 'Drag to orbit · scroll to zoom · add a bag from the panel');
    root.append(hint);
    setTimeout(killHint, 5000);
    canvas.addEventListener('pointerdown', killHint, { passive: true });
    canvas.addEventListener('wheel', killHint, { passive: true });
  }

  // ---- top-right camera tools --------------------------------------------
  const tools = el('div', 'viewtools glass');
  const rotBtn = elt('button', 'tool-btn', '⟳');
  rotBtn.title = 'Auto-rotate';
  rotBtn.setAttribute('aria-label', 'Toggle auto-rotate');
  rotBtn.onclick = () => {
    app.controls.autoRotate = !app.controls.autoRotate;
    rotBtn.classList.toggle('on', app.controls.autoRotate);
  };
  const homeBtn = elt('button', 'tool-btn', '⌂');
  homeBtn.title = 'Reset view';
  homeBtn.setAttribute('aria-label', 'Reset camera to the default view');
  homeBtn.onclick = () => {
    if (homeView.pos) app.camera.position.copy(homeView.pos);
    if (homeView.target) app.controls.target.copy(homeView.target);
    app.controls.update();
  };
  const tunnelBtn = elt('button', 'tool-btn', '💨');
  tunnelBtn.title = 'Wind tunnel';
  tunnelBtn.setAttribute('aria-label', 'Open the wind tunnel');
  tunnelBtn.onclick = () => {
    tunnelBtn.classList.toggle('on');
    app.openWindTunnel?.();
  };
  tools.append(rotBtn, el('span', 'tool-divider'), homeBtn, el('span', 'tool-divider'), tunnelBtn);
  root.append(tools);

  // ---- overlay plumbing ---------------------------------------------------
  let overlay = null;
  const onKey = (e) => { if (e.key === 'Escape') closeOverlay(); };

  function closeOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onKey);
  }

  function openOverlay(extraCls) {
    closeOverlay();
    const veil = el('div', 'picker-veil');
    const pk = el('div', 'picker glass' + (extraCls ? ' ' + extraCls : ''));
    veil.append(pk);
    veil.onclick = (e) => { if (e.target === veil) closeOverlay(); };
    document.addEventListener('keydown', onKey);
    root.append(veil);
    overlay = veil;
    return pk;
  }

  /** crumbs: ancestor steps as [{label, onClick}]; title is the current step. */
  function pickerHead({ title, sub, crumbs, onBack, extra }) {
    const h = el('header', 'pk-head');
    if (onBack) {
      const b = elt('button', 'pk-back', '←');
      b.title = 'Back';
      b.onclick = onBack;
      h.append(b);
    }
    const t = el('div', 'pk-title');
    if (crumbs?.length) {
      const trail = el('nav', 'pk-crumbs');
      crumbs.forEach((c, i) => {
        if (i) trail.append(elt('span', 'crumb-sep', '›'));
        const b = elt('button', 'crumb', c.label);
        b.onclick = c.onClick;
        trail.append(b);
      });
      trail.append(elt('span', 'crumb-sep', '›'), elt('span', 'crumb cur', title));
      t.append(trail);
    }
    t.append(elt('h2', null, title));
    if (sub) t.append(elt('p', null, sub));
    h.append(t);
    if (extra) h.append(extra);
    const x = elt('button', 'pk-close', '✕');
    x.title = 'Close';
    x.onclick = closeOverlay;
    h.append(x);
    return h;
  }

  function removeAction(uiSlot) {
    const cur = app.bags.equipped[uiSlot];
    if (!cur) return null;
    const btn = elt('button', 'pk-remove', 'Remove bag');
    btn.title = `Remove ${cur.product.name}`;
    btn.onclick = () => { app.bags.remove(uiSlot); closeOverlay(); sync(); };
    return btn;
  }

  /**
   * People arrive with one of two things in mind: a place on the bike they want
   * to fill, or a brand they already like. Offer both as peers rather than
   * forcing everyone through the mount grid first.
   */
  let browseMode = 'type';
  function modeSwitch(active) {
    const seg = el('div', 'seg');
    for (const [key, label] of [['type', 'By bag type'], ['brand', 'By brand']]) {
      const b = elt('button', 'seg-btn' + (key === active ? ' on' : ''), label);
      b.onclick = () => {
        if (key === active) return;
        browseMode = key;
        key === 'type' ? openMountPicker() : openBrandIndex();
      };
      seg.append(b);
    }
    return seg;
  }

  /** Brand-first entry: every brand, with what they make. */
  function openBrandIndex() {
    browseMode = 'brand';
    const pk = openOverlay('brand-index');
    pk.append(pickerHead({
      title: 'Browse by brand',
      sub: `${app.catalog.length} makers · ${app.catalog.reduce((n, b) => n + b.products.length, 0)} bags`,
      extra: modeSwitch('brand'),
    }));
    const list = el('div', 'brand-list');
    for (const brand of [...app.catalog].sort((a, b) => a.name.localeCompare(b.name))) {
      const row = el('button', 'brand-row');
      row.append(elt('span', 'br-name', brand.short));
      const pal = el('span', 'br-palette');
      for (const col of paletteFor(brand, brand.products.map((product) => ({ product })))) {
        const sw = el('span', 'br-sw');
        sw.style.background = col;
        pal.append(sw);
      }
      row.append(pal);
      row.append(elt('span', 'br-count', `${brand.products.length} bag${brand.products.length === 1 ? '' : 's'}`));
      row.append(elt('span', 'br-go', '›'));
      row.onclick = () => openBrandCatalog(brand);
      list.append(row);
    }
    pk.append(list);
  }

  /** Everything one brand makes, grouped by where it mounts. */
  function openBrandCatalog(brand) {
    const pk = openOverlay('model-picker');
    pk.append(pickerHead({
      title: brand.short,
      sub: `${brand.products.length} bags across ${new Set(brand.products.map((p) => p.slot)).size} mounts`,
      crumbs: [{ label: 'Brands', onClick: openBrandIndex }],
      onBack: openBrandIndex,
    }));
    // a product knows its own slot, so choosing one implies the mount
    const bySlot = new Map();
    for (const product of brand.products) {
      const uiSlot = uiSlotForProduct(product);
      if (!uiSlot) continue;
      if (!bySlot.has(uiSlot)) bySlot.set(uiSlot, []);
      bySlot.get(uiSlot).push({ brand, product });
    }
    const body = el('div', 'lines');
    for (const [uiSlot, items] of [...bySlot].sort((a, b) => (SLOTS[a[0]]?.label || '').localeCompare(SLOTS[b[0]]?.label || ''))) {
      const sec = el('section', 'pline');
      sec.append(elt('h3', 'pline-title', SLOTS[uiSlot]?.label || uiSlot));
      sec.append(modelCards(items, uiSlot, brand));
      body.append(sec);
    }
    pk.append(body);
  }

  /** Map a catalogue product to the UI slot it should occupy. */
  function uiSlotForProduct(product) {
    if (product.slot === 'pannier') return 'pannierR';
    if (product.slot === 'stembag') return 'stemR';
    if (product.slot === 'forkbag') return 'forkR';
    if (SLOTS[product.slot]) return product.slot;
    return Object.keys(SLOTS).find((k) => (SLOTS[k].products || k) === product.slot) || null;
  }

  /** Step 1 — which mount point? Grouped by zone, empties allowed here only. */
  function openMountPicker() {
    browseMode = 'type';
    const pk = openOverlay('mount-picker');
    pk.append(pickerHead({
      title: 'Choose a mount',
      sub: 'Where on the bike does this bag go?',
      extra: modeSwitch('type'),
    }));
    const body = el('div', 'zones');
    for (const zone of ZONES) {
      const sec = el('section', 'zone');
      sec.append(elt('h3', 'zone-title', zone.label));
      const grid = el('div', 'zone-grid');
      for (const key of zone.slots) {
        const def = SLOTS[key];
        if (!def) continue;
        const cur = app.bags.equipped[key];
        const options = productsForSlot(app.catalog, productSlotFor(key));
        const b = el('button', 'mount-btn' + (cur ? ' occupied' : ''));
        b.append(elt('span', 'mb-name', def.label));
        const sub = cur
          ? `${cur.brand.short} · ${modelTitle(cur.product, cur.brand)}`
          : options.length
            ? `${options.length} option${options.length === 1 ? '' : 's'}`
            : 'No products';
        b.append(elt('span', 'mb-sub', sub));
        if (!options.length) b.disabled = true;
        else b.onclick = () => openBrandPicker(key);
        grid.append(b);
      }
      sec.append(grid);
      body.append(sec);
    }
    pk.append(body);
  }

  /** Brands making bags for a slot, each with its matching products. */
  function brandsForSlot(uiSlot) {
    const byBrand = new Map();
    for (const entry of productsForSlot(app.catalog, productSlotFor(uiSlot))) {
      if (!byBrand.has(entry.brand)) byBrand.set(entry.brand, []);
      byBrand.get(entry.brand).push(entry);
    }
    return [...byBrand]
      .map(([brand, items]) => ({ brand, items }))
      .sort((a, b) => a.brand.name.localeCompare(b.brand.name));
  }

  /** [line, [{title, variants}]] — variants are size options of one model. */
  function groupByLine(items) {
    const lines = new Map();
    for (const entry of items) {
      const line = lineOf(entry.product);
      if (!lines.has(line)) lines.set(line, new Map());
      const models = lines.get(line);
      // products sharing a line and a model name are sizes of the same bag
      const key = stripLine(displayName(entry.product, entry.brand), line).toLowerCase();
      if (!models.has(key)) {
        models.set(key, { title: stripLine(displayName(entry.product, entry.brand), line), variants: [] });
      }
      models.get(key).variants.push(entry);
    }
    for (const models of lines.values()) {
      for (const m of models.values()) {
        m.variants.sort((a, b) => (Number(a.product.liters) || 0) - (Number(b.product.liters) || 0));
      }
    }
    return [...lines]
      .map(([line, models]) => [line, [...models.values()].sort((a, b) => a.title.localeCompare(b.title))])
      .sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[0].localeCompare(b[0]));
  }

  function paletteFor(brand, items) {
    const cols = brand.palette?.length
      ? brand.palette
      : items.flatMap((i) => i.product.colors || []);
    return [...new Set(cols)].slice(0, 4);
  }

  /** Step 2 — which brand? */
  function openBrandPicker(uiSlot) {
    const def = SLOTS[uiSlot];
    const cur = app.bags.equipped[uiSlot];
    const brands = brandsForSlot(uiSlot);

    const pk = openOverlay('brand-picker');
    pk.append(pickerHead({
      title: def.label,
      sub: `${brands.length} brand${brands.length === 1 ? '' : 's'} make this`,
      crumbs: [{ label: 'Mounts', onClick: openMountPicker }],
      onBack: openMountPicker,
      extra: removeAction(uiSlot),
    }));

    const list = el('div', 'brand-list');
    for (const { brand, items } of brands) {
      const fitted = cur && cur.brand === brand;
      const row = el('button', 'brand-row' + (fitted ? ' on' : ''));
      row.append(elt('span', 'br-name', brand.short));
      const pal = el('span', 'br-palette');
      for (const col of paletteFor(brand, items)) {
        const sw = el('span', 'br-sw');
        sw.style.background = col;
        pal.append(sw);
      }
      row.append(pal);
      row.append(elt('span', 'br-count', `${items.length} bag${items.length === 1 ? '' : 's'}`));
      if (fitted) row.append(elt('span', 'br-fitted', 'Fitted'));
      row.append(elt('span', 'br-go', '›'));
      row.onclick = () => openBrandDetail(uiSlot, brand);
      list.append(row);
    }
    pk.append(list);
  }

  /** Step 3 — which model and size within one brand? */
  function openBrandDetail(uiSlot, brand) {
    const def = SLOTS[uiSlot];
    const cur = app.bags.equipped[uiSlot];
    const items = brandsForSlot(uiSlot).find((b) => b.brand === brand)?.items || [];
    const groups = groupByLine(items);
    const named = groups.some(([line]) => line);

    const pk = openOverlay('model-picker');
    pk.append(pickerHead({
      title: brand.short,
      sub: `${items.length} bag${items.length === 1 ? '' : 's'} for the ${def.label.toLowerCase()}`,
      crumbs: [
        { label: 'Mounts', onClick: openMountPicker },
        { label: def.label, onClick: () => openBrandPicker(uiSlot) },
      ],
      onBack: () => openBrandPicker(uiSlot),
      extra: removeAction(uiSlot),
    }));

    const body = el('div', 'lines');
    for (const [line, models] of groups) {
      const sec = el('section', 'pline');
      // an unnamed group only needs a header when named lines sit beside it
      if (line) sec.append(elt('h3', 'pline-title', line));
      else if (named) sec.append(elt('h3', 'pline-title', 'Other'));
      sec.append(modelCards(items.filter((i) => lineOf(i.product) === line), uiSlot, brand, models));
      body.append(sec);
    }
    pk.append(body);
  }

  /**
   * The product grid, shared by the mount-first and brand-first flows.
   * `models` may be pre-grouped; otherwise it is derived from `items`.
   */
  function modelCards(items, uiSlot, brand, models = null) {
    const cur = app.bags.equipped[uiSlot];
    const equip = (entry) => {
      app.bags.equip(uiSlot, entry.brand, entry.product);
      closeOverlay();
      sync();
    };
    const cards = el('div', 'cards');
    for (const [, group] of (models ? [[null, models]] : groupByLine(items))) {
      for (const model of group) {
        const multi = model.variants.length > 1;
        const fitted = cur && model.variants.some((v) => v.product === cur.product);
        const c = el('div', 'card' + (fitted ? ' on' : '') + (multi ? ' has-sizes' : ''));
        // A photo of the real bag identifies it far faster than the name does,
        // when 589 products share one silhouette language. Hot-linked from the
        // maker's own CDN — nothing is copied into this repo.
        const shot = model.variants.map((v) => v.product.images?.[0]).find(Boolean);
        if (shot) {
          const wrap = el('div', 'card-thumb');
          const img = document.createElement('img');
          img.loading = 'lazy';
          img.alt = `${brand.short} ${model.title}`;
          img.referrerPolicy = 'no-referrer';
          img.src = shot;
          img.onerror = () => wrap.remove();   // a dead CDN link shouldn't leave a hole
          wrap.append(img);
          c.append(wrap);
        }
        c.append(elt('div', 'name', model.title));

        const meta = el('div', 'meta');
        if (!multi) meta.append(elt('span', 'liters', litersOf(model.variants[0].product)));
        const cols = [...new Set(model.variants.flatMap((v) => v.product.colors || []))];
        const chips = el('div', 'chips');
        for (const col of cols.slice(0, 5)) {
          const chip = el('span', 'chip');
          chip.style.background = col;
          chips.append(chip);
        }
        meta.append(chips);
        if (model.variants.some((v) => v.product.est)) meta.append(elt('span', 'est', 'est. dims'));
        if (fitted) meta.append(elt('span', 'fitted', 'Fitted'));

        // sizes of one model share a product page, so the card carries one link
        const linked = model.variants.find((v) => cur && v.product === cur.product && srcOf(v.product))
          || model.variants.find((v) => srcOf(v.product));
        const buy = linked ? buyLink(linked.product, brand, 'Buy ↗', 'buy-link') : null;
        if (!multi && buy) meta.append(buy);
        c.append(meta);

        if (multi) {
          const sizes = el('div', 'sizes');
          for (const v of model.variants) {
            const chip = elt('button', 'size-chip' + (cur && cur.product === v.product ? ' on' : ''), sizeOf(v.product));
            chip.title = `${model.title} · ${sizeOf(v.product)}`;
            chip.onclick = (e) => { e.stopPropagation(); equip(v); };
            sizes.append(chip);
          }
          if (buy) sizes.append(buy);
          c.append(sizes);
        } else {
          c.onclick = () => equip(model.variants[0]);
        }
        cards.append(c);
      }
    }
    return cards;
  }

  // ---- kit summary --------------------------------------------------------
  function kitURL() {
    const kit = Object.entries(app.bags.equipped)
      .map(([slot, { brand, product }]) => `${slot}:${brand.index}:${product.index}`)
      .join(',');
    return `${location.origin}${location.pathname}?kit=${kit}&env=${app.state.env}&paint=${app.state.paint}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // clipboard API needs a secure context — fall back to a hidden textarea
      try {
        const ta = el('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  let shareTimer = null;
  async function shareKit(btn, label) {
    const ok = await copyText(kitURL());
    label.textContent = ok ? 'Copied!' : 'Copy failed';
    btn.classList.toggle('done', ok);
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => {
      label.textContent = 'Share kit';
      btn.classList.remove('done');
    }, 1800);
  }

  // ---- render -------------------------------------------------------------
  function updateFade() {
    const more = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight > 4;
    listEl.classList.toggle('fade-bottom', more);
  }

  /**
   * A bag the resolver could not place. Drawing it would show it intersecting
   * the frame; dropping it silently is how a chosen product just never appears.
   * Say so, and offer the two things that actually help: swap or remove.
   */
  function renderUnfitted(key, rec) {
    const card = el('div', 'bag-card unfit');
    card.dataset.slot = key;
    const sw = el('span', 'bag-sw');
    sw.style.background = swatchStyle(rec.product, rec.brand);
    const txt = el('div', 'bag-txt');
    const line = el('div', 'bag-meta');
    line.append(
      elt('span', 'b', rec.brand.short), elt('span', 'sep', '·'),
      elt('span', 'm', SLOTS[key].label),
    );
    const nameRow = el('div', 'bag-name-row');
    nameRow.append(elt('div', 'bag-model', modelTitle(rec.product, rec.brand)));
    txt.append(line, nameRow, elt('div', 'unfit-msg', 'Doesn’t fit this frame — try another size'));
    const acts = el('div', 'bag-acts');
    const swap = elt('button', 'bag-act', '⇄');
    swap.title = 'Pick a different bag';
    swap.onclick = (e) => { e.stopPropagation(); openBrandPicker(key); };
    const rm = elt('button', 'bag-act rm', '✕');
    rm.title = 'Remove';
    rm.onclick = (e) => { e.stopPropagation(); app.bags.remove(key); sync(); };
    acts.append(swap, rm);
    card.append(sw, txt, acts);
    card.onclick = () => openBrandPicker(key);
    return card;
  }

  function renderList() {
    listEl.innerHTML = '';
    const unfit = Object.keys(app.bags.unfitted || {});
    const keys = Object.keys(SLOTS).filter((k) => app.bags.equipped[k]);
    if (!keys.length && !unfit.length) {
      listEl.append(el('div', 'empty-state',
        'Nothing mounted yet.<br><span>Add a bag to start building your rig.</span>'));
      return 0;
    }
    for (const key of keys) {
      const cur = app.bags.equipped[key];
      const card = el('div', 'bag-card');
      card.dataset.slot = key;
      card.title = 'Change this bag';

      // a photo of the actual bag beats a colour swatch for recognition
      const sw = el('span', 'bag-sw');
      const shot = cur.product?.images?.[0];
      if (shot) {
        sw.classList.add('photo');
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.src = shot;
        img.onerror = () => { sw.classList.remove('photo'); img.remove(); sw.style.background = swatchStyle(cur.product, cur.brand); };
        sw.append(img);
      } else {
        sw.style.background = swatchStyle(cur.product, cur.brand);
      }

      const txt = el('div', 'bag-txt');
      const line = el('div', 'bag-meta');
      line.append(
        elt('span', 'b', cur.brand.short),
        elt('span', 'sep', '·'),
        elt('span', 'm', SLOTS[key].label),
      );
      // volume shares the product name's baseline
      const nameRow = el('div', 'bag-name-row');
      const modelEl = elt('div', 'bag-model', modelTitle(cur.product, cur.brand));
      // the size only earns its place when it isn't just the volume again
      const size = sizeOf(cur.product);
      if (size && !sizeIsVolume(cur.product)) modelEl.append(elt('span', 'bag-size', ` · ${size}`));
      nameRow.append(modelEl, elt('div', 'bag-liters', litersOf(cur.product)));
      txt.append(line, nameRow);

      const acts = el('div', 'bag-acts');
      const buy = buyLink(cur.product, cur.brand, '↗', 'bag-act buy');
      if (buy) acts.append(buy);
      const swap = elt('button', 'bag-act', '⇄');
      swap.title = `Swap the ${SLOTS[key].label.toLowerCase()}`;
      swap.onclick = (e) => { e.stopPropagation(); openBrandPicker(key); };
      const rm = elt('button', 'bag-act rm', '✕');
      rm.title = `Remove from ${SLOTS[key].label}`;
      rm.onclick = (e) => { e.stopPropagation(); app.bags.remove(key); sync(); };
      acts.append(swap, rm);

      card.append(sw, txt, acts);
      // the link runs both ways: hovering a card lifts the bag in the scene
      card.onmouseenter = () => app.focus?.setHovered?.(key);
      card.onmouseleave = () => app.focus?.setHovered?.(null);
      card.onclick = () => openBrandPicker(key);

      // Colourways, straight from the maker's own page. Belongs INSIDE the card
      // it recolours — as a sibling it reads as detached from any one bag.
      const ways = cur.product?.features?.colorways || [];
      if (ways.length > 1) {
        const row = el('div', 'ways');
        ways.forEach((w, i) => {
          const b = el('button', 'way' + (i === cur.colorwayIndex ? ' on' : ''));
          const cw = colorwayFor(cur.brand, cur.product, i);
          b.style.background = '#' + Number(cw.main).toString(16).padStart(6, '0');
          b.title = w.name || cw.name || `Colourway ${i + 1}`;
          b.setAttribute('aria-label', b.title);
          b.onclick = (e) => {
            e.stopPropagation();
            app.bags.setColorway(key, i);
            sync();
          };
          row.append(b);
        });
        card.append(row);
      }
      listEl.append(card);
    }
    for (const key of unfit) listEl.append(renderUnfitted(key, app.bags.unfitted[key]));
    return keys.length;
  }

  // ---- selection, shared with the 3D scene --------------------------------
  // The canvas owns the interaction; the panel mirrors it. State is kept here
  // (not on the DOM) because renderList() rebuilds the cards on every change.
  let selectedSlot = null;
  let hoveredSlot = null;

  function paintSelection() {
    for (const card of listEl.querySelectorAll('.bag-card')) {
      const s = card.dataset.slot;
      card.classList.toggle('sel', s === selectedSlot);
      card.classList.toggle('hov', s === hoveredSlot && s !== selectedSlot);
    }
  }

  function setSelected(slot) {
    selectedSlot = slot || null;
    paintSelection();
    // bring it into view when the list is long enough to scroll
    if (selectedSlot) {
      listEl.querySelector(`.bag-card[data-slot="${CSS.escape(selectedSlot)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function setHovered(slot) {
    hoveredSlot = slot || null;
    paintSelection();
  }

  function sync() {
    const n = renderList();
    paintSelection();
    countEl.textContent = `(${n})`;
    const liters = Object.values(app.bags.equipped)
      .reduce((sum, e) => sum + (Number(e.product?.liters) || 0), 0);
    totalEl.textContent = `${liters.toFixed(1)} L`;
    foot.classList.toggle('has-kit', n > 0);
    updateFade();
    envs.querySelectorAll('.env-chip').forEach((c) => c.classList.toggle('on', c.dataset.env === app.state.env));
    paints.querySelectorAll('.paint').forEach((c) => c.classList.toggle('on', c.dataset.paint === app.state.paint));
    rotBtn.classList.toggle('on', !!app.controls?.autoRotate);
  }

  sync();
  return { sync, setSelected, setHovered, paintSelection };
}
