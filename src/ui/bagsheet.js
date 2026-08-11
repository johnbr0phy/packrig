/**
 * The bag sheet — REDESIGN.md §5, phase 2.
 *
 * Tapping a bag opens it. From the rig panel, or on the bike itself. Before
 * this, tapping a bag on the model selected it, ringed it, zoomed the camera —
 * and then nothing. The selection was a dead end, which is the odd part,
 * because everything behind it already worked: `bags.setColorway()`,
 * `bags.remove()`, and a catalogue that already filters to one mount slot.
 * This file is mostly wiring what was already there to a surface.
 *
 * It is the FITTED state (§5). The catalogue state — the same shell, opened on
 * a bag that is not on the bike yet — is phase 8.
 *
 * The three actions are the sheet's whole reason for existing:
 *
 *   Replace it   Ember. The one that keeps you in the app. Opens the catalogue
 *                pre-filtered to this mount slot.
 *   Remove it    No Ember; destructive actions do not get the loud fill. One
 *                tap, no confirm, so it offers an undo instead.
 *   Buy at X     Last, on its own row, because it leaves the app.
 */

import { colorwayFor, SLOTS } from '../bags.js';
import { buyLink, litersOf, modelTitle, sizeIsVolume, sizeOf } from './product.js';
import { featuresOf } from '../bags/identity.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** A 0xRRGGBB from the colourway resolver, as CSS. */
const hex = (n) => '#' + Number(n).toString(16).padStart(6, '0');

/** `dims_cm` is [l, w, h] in centimetres on every record that has one. */
function dimsText(p) {
  const d = p?.dims_cm;
  if (!Array.isArray(d) || d.length < 3) return null;
  const n = (v) => (Math.round(Number(v) * 10) / 10).toString();
  return `${n(d[0])} × ${n(d[1])} × ${n(d[2])} cm`;
}

/**
 * One row of the specification table. Returns null for an absent value rather
 * than printing a dash, because a table of dashes is worse than a short table.
 */
function specRow(key, value, { ok = false, warn = false } = {}) {
  if (value == null || value === '' || value === '—') return null;
  const r = el('div', 'bs-spec');
  r.append(el('span', 'bs-spec-k', key));
  const v = el('span', 'bs-spec-v' + (ok ? ' is-ok' : '') + (warn ? ' is-warn' : ''), String(value));
  r.append(v);
  return r;
}

export function initBagSheet(app, { openCatalogue, sync, notify } = {}) {
  /**
   * Draw the sheet for whatever is currently in `uiSlot`. Called again after a
   * colourway change so the swatch ring and the hero move together — cheaper
   * than diffing, and the body is a few dozen nodes.
   */
  function paint(body, uiSlot, handle) {
    const cur = app.bags.equipped[uiSlot];
    // Removed from under us — a bag can go while its sheet is open if the rig
    // is cleared or a shared link loads.
    if (!cur) { handle?.close(); return; }

    const { brand, product } = cur;
    const slotLabel = SLOTS[uiSlot]?.label || 'Bag';
    handle?.setTitle(slotLabel);
    body.replaceChildren();

    const pk = el('div', 'bagsheet');

    // ---- hero --------------------------------------------------------------
    const hero = el('div', 'bs-hero');
    const shot = product?.images?.[0];
    if (shot) {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.src = shot;
      // 201 of 702 products have no photograph, and a hotlinked one can also
      // simply fail. §8.3: a fallback is required, not optional. This is the
      // cheap one — the bag's own colourway on a plate. §5.3 wants a render of
      // the mesh here, which is a bigger job and is not done yet.
      img.onerror = () => { hero.classList.add('is-blank'); img.remove(); };
      hero.append(img);
    } else {
      hero.classList.add('is-blank');
    }
    const cw = colorwayFor(brand, product, cur.colorwayIndex || 0);
    hero.style.setProperty('--bs-body', hex(cw.main));
    pk.append(hero);

    // ---- identity ----------------------------------------------------------
    const id = el('div', 'bs-id');
    id.append(el('div', 'bs-brand', [brand?.name, product?.line].filter(Boolean).join(' · ')));
    id.append(el('h3', 'bs-name', modelTitle(product, brand)));
    const size = sizeOf(product);
    id.append(el('div', 'bs-sub', [
      litersOf(product) === '—' ? null : litersOf(product),
      slotLabel,
      size && !sizeIsVolume(product) ? size : null,
    ].filter(Boolean).join(' · ')));
    pk.append(id);

    // ---- colourway ---------------------------------------------------------
    // The model layer for this was finished long before there was anywhere to
    // put it: setColorway, colorwayCount and colorwayFor all existed, and
    // captureRig has always persisted `cw`, so a colour already survived save,
    // share link and reload. Only the control was missing.
    const ways = featuresOf(product).colorways || [];
    const active = cur.colorwayIndex || 0;
    const cwName = ways[active]?.name || cw.name || '';
    const cwWrap = el('div', 'bs-block');
    const cwHead = el('div', 'bs-label-row');
    cwHead.append(el('span', 'bs-label', 'Colourway'));
    cwHead.append(el('span', 'bs-label-v', cwName));
    cwWrap.append(cwHead);
    if (ways.length > 1) {
      const row = el('div', 'bs-ways');
      ways.forEach((w, i) => {
        const b = el('button', 'bs-way' + (i === active ? ' on' : ''));
        b.type = 'button';
        b.style.background = hex(colorwayFor(brand, product, i).main);
        b.title = w.name || `Colourway ${i + 1}`;
        b.setAttribute('aria-label', b.title);
        b.setAttribute('aria-pressed', String(i === active));
        b.onclick = () => {
          app.bags.setColorway(uiSlot, i);
          sync?.();
          paint(body, uiSlot, handle);   // no confirm step, and the ring follows
        };
        row.append(b);
      });
      cwWrap.append(row);
    }
    // A single-colourway product keeps the row and loses the picker — a row that
    // vanishes on some bags and not others reads as a bug (§5.2). But a record
    // with no colourways AND no resolved name has nothing to put in it, and a
    // heading over blank space is worse than no heading.
    if (ways.length > 1 || cwName) pk.append(cwWrap);

    // ---- specifications ----------------------------------------------------
    const f = featuresOf(product);
    const specs = el('div', 'bs-block');
    specs.append(el('div', 'bs-label', 'Specifications'));
    const rows = [
      specRow('Capacity', litersOf(product)),
      specRow('Dimensions', dimsText(product)),
      specRow('Size', size && !sizeIsVolume(product) ? size : null),
      specRow('Closure', f.closure),
      specRow('Shape', f.shape),
      // Honest data beats tidy data: say when a measurement is the maker's and
      // when it is ours, rather than presenting both as the same fact.
      product?.dims_verified
        ? specRow('Dimensions verified', 'Maker ✓', { ok: true })
        : dimsText(product) ? specRow('Dimensions', 'est.', { warn: true }) : null,
    ].filter(Boolean);
    rows.forEach((r) => specs.append(r));
    if (rows.length) pk.append(specs);

    // ---- features ----------------------------------------------------------
    const feats = [
      f.reflective && 'Reflective detailing',
      f.daisyChains && 'Daisy chain lash points',
      f.cord && 'External bungee cord',
      f.valve && 'Purge valve',
      f.compressionStraps ? `${f.compressionStraps} compression strap${f.compressionStraps === 1 ? '' : 's'}` : null,
      ...f.pockets.map((x) => (typeof x === 'string' ? x : x?.name)).filter(Boolean),
    ].filter(Boolean);
    if (feats.length) {
      const fb = el('div', 'bs-block');
      fb.append(el('div', 'bs-label', 'Features'));
      const ul = el('ul', 'bs-feats');
      feats.slice(0, 8).forEach((t) => ul.append(el('li', null, t)));
      fb.append(ul);
      pk.append(fb);
    }

    body.append(pk);

    // ---- footer ------------------------------------------------------------
    // Sticky, and outside the scroll region — §5.1 says it never scrolls away.
    const foot = el('div', 'bs-foot');
    const top = el('div', 'bs-foot-row');

    const replace = el('button', 'bs-btn is-primary', 'Replace it');
    replace.type = 'button';
    replace.onclick = () => openCatalogue?.(uiSlot);

    const remove = el('button', 'bs-btn is-bad', 'Remove it');
    remove.type = 'button';
    remove.onclick = () => {
      // Capture enough to put it back. One tap with no confirm earns an undo.
      const undo = { brand, product, cw: cur.colorwayIndex || 0 };
      app.bags.remove(uiSlot);
      sync?.();
      handle?.close();
      notify?.(`Removed ${modelTitle(product, brand)}`, () => {
        app.bags.equip(uiSlot, undo.brand, undo.product, undo.cw);
        sync?.();
      });
    };
    top.append(replace, remove);
    foot.append(top);

    const buy = buyLink(product, brand, `Buy at ${brand?.short || brand?.name || 'the maker'} ↗`, 'bs-btn is-buy');
    // Never a dead button (§5.1): no link on file becomes a line of text.
    foot.append(buy || el('p', 'bs-nolink', 'No maker link on file'));

    body.append(foot);
  }

  return {
    /** Open, or repaint in place if a sheet is already showing another bag. */
    open(uiSlot) {
      if (!app.bags.equipped[uiSlot]) return null;
      let handle = null;
      handle = app.openSheet?.({
        kind: 'detail',
        title: SLOTS[uiSlot]?.label || 'Bag',
        render: (body, h) => paint(body, uiSlot, h),
      });
      return handle;
    },
  };
}
