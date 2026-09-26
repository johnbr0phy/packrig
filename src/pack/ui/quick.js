/**
 * "What are you bringing?", the first-timer's door.
 *
 * Someone with a bike, a sleeping bag and a vague sense of dread should not
 * need to know what a harness system is. They tap the things they own, in
 * words they already use; we give them a bike with sensible bags if it has
 * none, pack it the way an experienced rider would, and open the bags so they
 * can see where everything went. One screen, one button.
 */
import { btn, el } from './labels.js';
import { thumbImg, asThumbItem } from './thumbs.js';

/** Words a first-timer uses → catalogue items. A tile can bring a small set. */
export const QUICK = [
  { label: 'Tent', ids: ['tent-1p'] },
  { label: 'Sleeping bag', ids: ['sleeping-bag'] },
  { label: 'Sleeping mat', ids: ['mat-inflate'] },
  { label: 'Pillow', ids: ['pillow-inflate'] },
  { label: 'Stove & gas', ids: ['stove', 'gas-100', 'lighter'] },
  { label: 'Pot & spork', ids: ['toaks-750', 'spork-ti'] },
  { label: 'Rain jacket', ids: ['rain-jacket'] },
  { label: 'Warm jacket', ids: ['puffy-synth'] },
  { label: 'Camp clothes', ids: ['tee-camp', 'casual-shorts', 'socks-hiking'] },
  { label: 'Food', ids: ['food-day'] },
  { label: 'Water bottles', ids: ['bidon-750', 'bidon-750'] },
  { label: 'Tools & tube', ids: ['bike-tool', 'tube-700c', 'tyre-levers', 'hand-pump'] },
  { label: 'First aid', ids: ['first-aid-kit'] },
  { label: 'Headlamp', ids: ['headlamp'] },
  { label: 'Phone', ids: ['phone'] },
  { label: 'Power bank', ids: ['power-bank-10k'] },
  { label: 'Wash kit', ids: ['toothbrush-kit', 'sunscreen'] },
  { label: 'Lock', ids: ['zip-lock'] },
];

/** The bags a first-timer's bike gets when it has none (tools/build-loadouts.mjs). */
const STARTER = 'first-overnighter';

export function initQuick(app, hooks) {
  const P = app.pack;
  const picked = new Set();

  async function open() {
    await P.gearReady;
    app.openSheet?.({ kind: 'detail', title: 'What are you bringing?', render: (body, h) => paint(body, h) });
  }

  function paint(body, h) {
    body.replaceChildren();
    const wrap = el('div', 'pkg-quick');
    const grid = el('div', 'pkg-tiles');
    for (const q of QUICK) {
      const g = P.gear.get(q.ids[0]);
      if (!g) continue;
      const t = btn('pkg-tile' + (picked.has(q.label) ? ' on' : ''), '', () => {
        if (picked.has(q.label)) picked.delete(q.label); else picked.add(q.label);
        t.classList.toggle('on', picked.has(q.label));
        t.setAttribute('aria-pressed', String(picked.has(q.label)));
        paintGo();
      });
      t.setAttribute('aria-pressed', String(picked.has(q.label)));
      t.append(thumbImg(asThumbItem(g), 'pkg-tile-img'), el('span', 'pkg-tile-l', q.label));
      grid.append(t);
    }
    wrap.append(grid);
    const more = el('div', 'pkg-row-actions');
    more.append(btn('btn sm ghost', 'Browse all gear', () => hooks.openLocker?.()), btn('btn sm ghost', 'Paste a spreadsheet', () => hooks.openImport?.()));
    wrap.append(more);
    const foot = el('div', 'sheet-foot-src');
    const go = btn('btn primary wide', '', () => pack(h));
    const paintGo = () => {
      go.textContent = picked.size ? `Pack ${picked.size === 1 ? 'it' : `these ${picked.size}`}` : 'Pick what you’re bringing';
      go.disabled = !picked.size;
    };
    paintGo();
    foot.append(go);
    wrap.append(foot);
    body.append(wrap);
  }

  async function pack(h) {
    // a bike with nowhere to put things gets the Overnighter's bags
    if (!Object.keys(app.bags.equipped).length) {
      const lo = (await fetch('./data/loadouts.json').then((r) => r.json()).catch(() => [])).find((l) => l.id === STARTER);
      if (lo) app.__applyRig?.(lo.rig);
    }
    const uids = [];
    for (const q of QUICK) {
      if (!picked.has(q.label)) continue;
      for (const id of q.ids) {
        // don't add a second tent if I already own one
        const have = P.lib.locker.items.filter((i) => i.ref === id).length;
        const want = q.ids.filter((x) => x === id).length;
        if (have >= want) { for (const i of P.lib.locker.items.filter((x) => x.ref === id)) { if (!uids.includes(i.uid)) { uids.push(i.uid); P.place(i.uid, 'home'); break; } } continue; }
        uids.push(P.add({ ref: id }, 'home').uid);
      }
    }
    const res = P.suggest({ only: uids });
    picked.clear();
    h?.close();
    hooks.afterPack?.(res);
  }

  /** Put one tile's things in my kit, at home for now; returns their uids. */
  function addTile(q) {
    const uids = [];
    for (const id of q.ids) {
      const have = P.lib.locker.items.filter((i) => i.ref === id && !uids.includes(i.uid));
      if (have.length) { uids.push(have[0].uid); P.place(have[0].uid, 'home'); continue; }
      uids.push(P.add({ ref: id }, 'home').uid);
    }
    return uids;
  }

  return { open, addTile };
}
