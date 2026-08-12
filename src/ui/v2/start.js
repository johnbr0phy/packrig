/**
 * The start screen.
 *
 * WHAT WAS WRONG WITH THE OLD ONE. A 600px white card, centred, with a heading,
 * a sentence and two stacked full-width buttons — one of them a saturated blue
 * fill — floating over a bike that had been faded to about 40% to make room for
 * it. Four separate mistakes in one composition: it covered the product, it
 * dimmed the product, it was the exact shape of every sign-up modal on the
 * internet, and it said nothing a person could not have guessed from the name.
 *
 * WHAT THIS IS INSTEAD. No card and no box. A column of type down the left
 * third, over a gradient that never reaches the bike, and the bike itself
 * turning slowly at full brightness in the remaining two thirds. The entry
 * points are a numbered list with hairline rules — the shape of a contents
 * page, not a dialogue — and each one says what it actually gets you.
 *
 * The stat line at the bottom is doing real work: "702 bags from 50 makers"
 * is the single most persuasive fact about this app and it was nowhere on the
 * old screen. It is read from the live catalogue, so it cannot go stale.
 *
 *   renderStart(app, { onBuild, onLoadouts, onGallery }) -> HTMLElement
 */

import { icon } from './icons.js';
import { SLOTS } from '../../bags/slots.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Rows carry their own stagger index so the stylesheet can time them. */
let seq = 0;
const staged = (node) => {
  node.classList.add('pr-st');
  node.style.setProperty('--i', String(seq++));
  return node;
};

export function renderStart(app, { onBuild, onLoadouts, onGallery } = {}) {
  seq = 0;
  const wrap = el('div', 'pr-start');

  wrap.append(staged(el('p', 'pr-eyebrow', 'Bikepacking bag configurator')));

  // Three short lines rather than one long one: at display size the line
  // breaks are part of the composition, and a browser choosing them at 34px
  // is a browser art-directing the front page.
  const h = el('h1', 'pr-display');
  h.append(el('span', 'pr-line', 'Load the bike'));
  h.append(el('span', 'pr-line', 'before you'));
  h.append(el('span', 'pr-line', 'buy the bags.'));
  wrap.append(staged(h));

  wrap.append(staged(el('p', 'pr-lede',
    'Every bag here is a real product, measured from the maker’s own drawings '
    + 'and mounted where it actually mounts. Put a rig together, look at it '
    + 'from any angle, and find out what it holds.')));

  // One source for the number. The old copy said "fourteen mounting points"
  // while the stat line below counted the real table and said eighteen — two
  // numbers for one fact, forty pixels apart, and the prose was the wrong one.
  const mountCount = Object.keys(SLOTS).length;

  const list = el('ul', 'pr-menu');
  const ENTRIES = [
    {
      n: '01',
      name: 'Build a rig',
      desc: `A bare frame and ${mountCount} mounting points to fill.`,
      run: onBuild,
      primary: true,
    },
    {
      n: '02',
      name: 'Loadouts',
      desc: 'Expedition, racing, heavy touring — eight, already built.',
      run: onLoadouts,
    },
    {
      n: '03',
      name: 'Gallery',
      desc: 'What other people are riding, and how it is packed.',
      run: onGallery,
    },
  ];

  for (const e of ENTRIES) {
    const li = el('li', 'pr-menu-li');
    const b = el('button', 'pr-item' + (e.primary ? ' is-primary' : ''));
    b.type = 'button';
    b.append(el('span', 'pr-idx', e.n));
    const body = el('span', 'pr-item-body');
    body.append(el('span', 'pr-item-name', e.name));
    body.append(el('span', 'pr-item-desc', e.desc));
    b.append(body);
    b.append(icon('right', { size: 20, cls: 'pr-item-go' }));
    b.onclick = () => e.run?.();
    li.append(b);
    list.append(staged(li));
  }
  wrap.append(list);

  // Live counts. `mounts` is the length of the slot table itself rather than a
  // number typed here, so adding a mount point updates the front page.
  const brands = app.catalog?.length || 0;
  const products = app.catalog?.reduce((n, b) => n + (b.products?.length || 0), 0) || 0;
  const stat = el('p', 'pr-stat');
  const cell = (v, k) => {
    const s = el('span', 'pr-stat-cell');
    s.append(el('b', 'pr-stat-v', String(v)), el('span', 'pr-stat-k', k));
    return s;
  };
  stat.append(cell(products, 'bags'), cell(brands, 'makers'), cell(mountCount, 'mounts'));
  wrap.append(staged(stat));

  return wrap;
}
