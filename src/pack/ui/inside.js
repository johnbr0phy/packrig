/**
 * "Inside" — the top of the bag sheet once there is gear in play.
 *
 * Tap a bag, it opens: the shell goes translucent in the scene and this block
 * lists what the solver put in it, with a fill meter computed from the same
 * numbers the picture was laid out from. When something won't go in, it says
 * so in a sentence and offers the place it would go.
 */
import { btn, el, placeWords, SLOT_WORD } from './labels.js';
import { thumbImg } from './thumbs.js';
import { parsePlace } from '../model.js';
import { fmtWeight, fmtLitres } from '../units.js';

export function renderInside(app, slot, hooks) {
  const P = app.pack;
  const st = P.state;
  const r = st.results[slot];
  const box = el('div', 'bs-block pkg-inside');
  const items = st.locker.items.filter((it) => {
    const code = st.loadout.place[it.uid];
    return code && parsePlace(code).slot === slot;
  });
  const inBag = items.filter((it) => parsePlace(st.loadout.place[it.uid]).loc === 'bag');
  const outside = items.filter((it) => parsePlace(st.loadout.place[it.uid]).loc !== 'bag');

  const head = el('div', 'bs-label-row');
  head.append(el('span', 'bs-label', 'Inside'));
  if (r) {
    const used = r.fill.usedL, rated = r.fill.ratedL;
    head.append(el('span', 'bs-label-v num', `${Math.round(r.fill.frac * 100)}% · ${fmtLitres(used)} of ${fmtLitres(rated)} · ${fmtWeight(r.fill.kg * 1000, P.lib.unit)}`));
  }
  box.append(head);
  if (r) {
    const meter = el('div', 'pkg-fill');
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', `${Math.round(r.fill.frac * 100)} percent full`);
    meter.setAttribute('aria-valuenow', String(Math.round(r.fill.frac * 100)));
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    const f = el('span', 'pkg-fill-f');
    f.style.width = `${Math.min(r.fill.frac, 1) * 100}%`;
    meter.classList.toggle('is-full', r.fill.frac >= 0.9);
    meter.append(f);
    // the part soft things were squashed to get there, shown honestly
    if (r.fill.squeeze > 0.05) meter.title = 'Soft things are compressed to fit';
    box.append(meter);
    if (r.sides) {
      box.append(el('div', 'pkg-sides num', `Left ${fmtWeight(r.sides.L.kg * 1000, P.lib.unit)} · Right ${fmtWeight(r.sides.R.kg * 1000, P.lib.unit)}`));
    }
  }

  if (!items.length) {
    box.append(el('p', 'pkg-why', st.mine ? 'Empty.' : 'Nothing in this one.'));
  }
  for (const it of [...inBag, ...outside]) {
    const rr = st.resolved.get(it.uid);
    const row = btn('pkg-item', '', () => hooks.openItem?.(it.uid));
    row.append(thumbImg(rr));
    const t = el('span', 'pkg-item-t');
    const code = st.loadout.place[it.uid];
    const p = parsePlace(code);
    const over = r?.overflow.find((o) => o.uid === it.uid);
    t.append(el('span', 'pkg-item-n', rr.name), el('span', 'pkg-item-s', over ? 'Doesn’t fit' : p.loc === 'lashed' ? 'Strapped outside' : p.loc === 'dangle' ? 'Hanging off' : p.side ? `${p.side === 'L' ? 'Left' : 'Right'} side` : fmtLitres(rr.litres)));
    if (over) row.classList.add('is-over');
    row.append(t, el('span', 'pkg-item-w num', fmtWeight(rr.g, P.lib.unit)));
    hooks.drag?.source(row, it.uid);
    box.append(row);
  }

  // won't-fit, kindly, with somewhere better
  for (const o of r?.overflow || []) {
    const rr = st.resolved.get(o.uid);
    const alt = P.alternativeFor(o.uid);
    const w = el('div', 'pkg-warn');
    const why = o.reason === 'length'
      ? `${rr.name} is ${Math.round(o.needMm / 10)} cm long and this bag is ${Math.round(o.haveMm / 10)} cm inside.`
      : o.reason === 'shape' ? `${rr.name} doesn’t fit this bag’s shape.`
        : `${rr.name} needs ${fmtLitres(o.needL)}; there’s ${fmtLitres(o.freeL)} left.`;
    w.append(el('span', 'pkg-warn-t', alt ? `${why} It would fit ${placeWords(alt).toLowerCase().replace(/^on /, 'on ')}.` : why));
    if (alt && st.mine) w.append(btn('pkg-link', 'Move it', () => P.place(o.uid, alt)));
    box.append(w);
  }
  for (const wv of r?.warnings || []) {
    if (wv.kind === 'tight') { box.append(el('p', 'pkg-why', 'Packed tight — it all goes in, with some shoving.')); continue; }
    if (wv.kind === 'bulge') { box.append(el('p', 'pkg-why', `${wv.uids.map((u) => st.resolved.get(u)?.name).filter(Boolean).join(', ')} make${wv.uids.length === 1 ? 's' : ''} it bulge.`)); continue; }
    if (wv.kind !== 'load') continue;
    box.append(el('div', 'pkg-warn', `${fmtWeight(wv.kg * 1000, P.lib.unit)} is over the ${fmtWeight(wv.limit * 1000, P.lib.unit)} most ${SLOT_WORD[slot].toLowerCase().replace(/, (left|right)$/, '')}s are rated for.`));
  }
  if (st.mine) {
    const add = btn('pkg-btn pkg-putin', 'Put something in', () => hooks.openLocker?.());
    box.append(add);
  }
  return box;
}
