/**
 * The rig gallery — a carousel of real 3D bikes.
 *
 * Not a grid of thumbnails. You move left and right and the bike in front of
 * you changes: same scene, same lighting, same camera, one rig at a time, built
 * from the same builders that draw yours. A photograph of somebody's rig is
 * something any site can show; a rig you can orbit is the reason this one
 * exists.
 *
 * ONE BIKE AT A TIME, deliberately. A true carousel would place N bikes side by
 * side in world space and dolly along them, and each of those bikes is a full
 * set of bag meshes — a twelve-rig gallery would build several hundred meshes
 * to show you one. Swapping the rig on a single bike costs exactly what loading
 * a shared link costs, which is a thing the app already does in a blink.
 *
 * WHERE THE RIGS COME FROM, in order:
 *   1. published rigs from the backend
 *   2. failing that, your own saved rigs, labelled as such
 * There is no third fallback. A gallery padded out with randomly generated
 * bikes presented as other people's would be a lie, and an empty gallery that
 * says so is more use than a full one that misleads.
 *
 *   initGallery(app, { onExit, onAdopt }) -> { open, close, get isOpen }
 */

import { applyRig, rigLitres } from '../rig.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** 20x20, 1.5px stroke, currentColor — the sprite style from §7. */
const chevron = (dir) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="${dir < 0 ? 'M12.5 4L7 10l5.5 6' : 'M7.5 4L13 10l-5.5 6'}" fill="none" `
    + 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
};

export function initGallery(app, { onExit, onAdopt } = {}) {
  const host = document.getElementById('ui-root');
  if (!host) return null;

  const root = el('div', 'gal');
  root.hidden = true;

  const top = el('div', 'gal-top');
  const back = el('button', 'gal-back', 'Back');
  back.type = 'button';
  back.onclick = () => close();
  top.append(back, el('span', 'gal-title', 'Rig gallery'));
  const counter = el('span', 'gal-count', '');
  top.append(counter);
  root.append(top);

  const prev = el('button', 'gal-arrow is-prev');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous rig');
  prev.append(chevron(-1));
  const next = el('button', 'gal-arrow is-next');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next rig');
  next.append(chevron(1));
  root.append(prev, next);

  const bar = el('div', 'gal-bar');
  const info = el('div', 'gal-info');
  const nameEl = el('div', 'gal-name', '');
  const metaEl = el('div', 'gal-meta', '');
  info.append(nameEl, metaEl);
  const adopt = el('button', 'gal-adopt', 'Make it mine');
  adopt.type = 'button';
  adopt.onclick = () => {
    const row = rows[i];
    if (!row) return;
    close();
    onAdopt?.(row);
  };
  bar.append(info, adopt);
  // Dots, but capped: forty dots is not a position indicator, it is a texture.
  const dots = el('div', 'gal-dots');
  root.append(dots, bar);

  const empty = el('div', 'gal-empty');
  root.append(empty);

  host.append(root);

  let rows = [];
  let i = 0;
  let open_ = false;
  let mine = false;          // showing your own rigs because nothing is published

  function paintDots() {
    dots.replaceChildren();
    if (rows.length < 2 || rows.length > 12) return;
    rows.forEach((_, n) => {
      const d = el('span', 'gal-dot' + (n === i ? ' on' : ''));
      dots.append(d);
    });
  }

  /** Put rig `n` on the bike. Wraps, because a carousel that dead-ends is a list. */
  function show(n) {
    if (!rows.length) return;
    i = ((n % rows.length) + rows.length) % rows.length;
    const row = rows[i];
    const { missing } = applyRig(app, row.rig);
    app.ui?.sync?.();
    nameEl.textContent = row.name || 'Untitled rig';
    const bags = row.rig?.bags?.length || 0;
    const l = rigLitres(row.rig, app.catalog);
    metaEl.textContent = [
      mine ? 'Yours' : `by ${row.author || 'Anonymous'}`,
      `${bags} bag${bags === 1 ? '' : 's'}`,
      `${l.toFixed(1)} L`,
    ].join(' · ');
    counter.textContent = `${i + 1} / ${rows.length}`;
    paintDots();
    // Not an error worth a banner — the rig still loads, minus a bag whose
    // product left the catalogue — but it should not vanish silently either.
    if (missing?.length) console.warn('[packrig] gallery rig references bags no longer in the catalogue:', missing);
    root.classList.remove('slide-l', 'slide-r');
    void root.offsetWidth;
  }

  const go = (d) => {
    if (rows.length < 2) return;
    root.classList.add(d > 0 ? 'slide-l' : 'slide-r');
    show(i + d);
  };
  prev.onclick = () => go(-1);
  next.onclick = () => go(1);

  function onKey(e) {
    if (!open_) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  // Swipe. The canvas owns drag for orbiting, so the gesture is only claimed
  // when it is decisively horizontal — otherwise every attempt to spin the bike
  // would skip to the next rig.
  let sx = 0, sy = 0, tracking = false;
  function onDown(e) { if (!open_) return; sx = e.clientX; sy = e.clientY; tracking = true; }
  function onUp(e) {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? 1 : -1);
  }

  async function load() {
    empty.textContent = '';
    rows = [];
    mine = false;
    try {
      rows = (await app.rigs?.gallery?.({ limit: 40 })) || [];
    } catch { rows = []; }
    if (!rows.length) {
      try {
        rows = (await app.rigs?.list?.()) || [];
        mine = rows.length > 0;
      } catch { rows = []; }
    }
    if (!rows.length) {
      empty.textContent = app.rigs?.galleryEnabled
        ? 'Nothing published yet. Build a rig, save it, then publish — yours would be the first.'
        : 'Nothing saved yet. Build a rig and save it, and it will show up here.';
      counter.textContent = '';
      nameEl.textContent = '';
      metaEl.textContent = '';
      root.classList.add('is-empty');
      return;
    }
    root.classList.remove('is-empty');
    if (mine) empty.textContent = 'Nothing published yet — these are your own saved rigs.';
    show(0);
  }

  function open() {
    if (open_) return;
    open_ = true;
    root.hidden = false;
    void root.offsetWidth;
    root.classList.add('on');
    host.classList.add('gal-open');
    document.addEventListener('keydown', onKey, true);
    const canvas = document.getElementById('scene');
    canvas?.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    load();
  }

  function close() {
    if (!open_) return;
    open_ = false;
    root.classList.remove('on');
    host.classList.remove('gal-open');
    document.removeEventListener('keydown', onKey, true);
    const canvas = document.getElementById('scene');
    canvas?.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    setTimeout(() => { if (!open_) root.hidden = true; }, 260);
    onExit?.();
  }

  return { open, close, get isOpen() { return open_; }, get count() { return rows.length; } };
}
