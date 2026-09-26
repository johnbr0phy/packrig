/**
 * Inside a bag: the top of its sheet.
 *
 * Contents first, because "what's in there?" is the question. Each row is a
 * thing with its weight; a thing that won't go in says so ON ITS OWN ROW,
 * in a sentence with centimetres or litres, and offers the place it would
 * fit. Warnings that belong to the whole bag (load, bulge, tight) sit under
 * the meter they explain, not stacked above the list.
 */
import { btn, el, placeWords, SLOT_WORD } from './labels.js';
import { thumbImg } from './thumbs.js';
import { parsePlace } from '../model.js';
import { fmtWeight, fmtLitres } from '../units.js';

const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : '');

export function renderInside(app, slot, hooks) {
  const P = app.pack;
  const st = P.state;
  const r = st.results[slot];
  const unit = P.lib.unit;
  const box = el('section', 'inside');
  const items = st.locker.items.filter((it) => {
    const code = st.loadout.place[it.uid];
    return code && parsePlace(code).slot === slot && parsePlace(code).loc !== 'home';
  });
  const inBag = items.filter((it) => parsePlace(st.loadout.place[it.uid]).loc === 'bag');
  const outside = items.filter((it) => parsePlace(st.loadout.place[it.uid]).loc !== 'bag');

  // ---- the meter ---------------------------------------------------------------
  const head = el('div', 'inside-head');
  head.append(el('h3', 'label', 'Inside'));
  if (r) {
    const pct = Math.round(r.fill.frac * 100);
    head.append(el('span', 'inside-sum num', `${pct}% · ${fmtLitres(r.fill.usedL)} of ${fmtLitres(r.fill.ratedL)} · ${fmtWeight(r.fill.kg * 1000, unit)}`));
    box.append(head);
    const meter = el('div', 'meter inside-meter' + (r.overflow.length ? ' over' : r.fill.frac >= 0.95 ? ' tight' : ''));
    const f = el('i');
    f.style.width = `${Math.min(r.fill.frac, 1) * 100}%`;
    meter.append(f);
    meter.setAttribute('role', 'meter');
    meter.setAttribute('aria-label', `${pct} percent full`);
    meter.setAttribute('aria-valuenow', String(pct));
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    box.append(meter);
    if (r.sides) box.append(el('p', 'inside-note num', `Left ${fmtWeight(r.sides.L.kg * 1000, unit)} · right ${fmtWeight(r.sides.R.kg * 1000, unit)}`));
    for (const w of r.warnings || []) {
      if (w.kind === 'tight') box.append(el('p', 'inside-note', 'Packed tight: it all goes in, with some shoving.'));
      else if (w.kind === 'bulge') box.append(el('p', 'inside-note warn', `${w.uids.map((u) => st.resolved.get(u)?.name).filter(Boolean).join(', ')} make${w.uids.length === 1 ? 's' : ''} it bulge${['toptube', 'toptube_rear', 'framebag_full', 'framebag_half', 'stemL', 'stemR'].includes(slot) ? '; it may rub your knees' : ''}.`));
      else if (w.kind === 'load') box.append(el('p', 'inside-note warn', `${fmtWeight(w.kg * 1000, unit)} is over the ${fmtWeight(w.limit * 1000, unit)} most ${lc(SLOT_WORD[slot]).replace(/, (left|right)$/, '')}s are rated for.`));
      else if (w.kind === 'sides') box.append(el('p', 'inside-note warn', `${fmtWeight(Math.abs(w.L - w.R) * 1000, unit)} heavier on the ${w.L > w.R ? 'left' : 'right'}.`));
    }
    const buried = st.warnings.find((w) => w.kind === 'buried' && w.slot === slot);
    if (buried) box.append(el('p', 'inside-note warn', 'The phone is in here; you’ll stop to dig it out.'));
  } else {
    box.append(head);
  }

  // ---- the contents ---------------------------------------------------------------
  const list = el('div', 'inside-list');
  if (!items.length) list.append(el('p', 'inside-empty', st.mine ? 'Empty' : 'Nothing in this one'));
  for (const it of [...inBag, ...outside]) {
    const rr = st.resolved.get(it.uid);
    const code = st.loadout.place[it.uid];
    const p = parsePlace(code);
    const over = r?.overflow.find((o) => o.uid === it.uid);
    const wrap = el('div', 'inside-row' + (over ? ' is-over' : ''));
    const row = btn('rg-item', '', () => hooks.openItem?.(it.uid));
    row.dataset.uid = it.uid;
    row.append(thumbImg(rr, 'thumb rg-item-img'));
    const t = el('span', 'rg-item-t');
    t.append(el('span', 'rg-item-n', rr.name), el('span', 'rg-item-s', p.loc === 'lashed' ? 'Strapped outside' : p.loc === 'dangle' ? 'Hanging off' : p.side ? `${p.side === 'L' ? 'Left' : 'Right'} side` : fmtLitres(rr.litres)));
    row.append(t, el('span', 'rg-item-w num', fmtWeight(rr.g, unit)));
    row.setAttribute('aria-label', `${rr.name}, ${fmtWeight(rr.g, unit)}${over ? ', does not fit' : ''}`);
    hooks.drag?.source(row, it.uid);
    wrap.append(row);
    if (over) {
      const alt = P.alternativeFor(it.uid);
      const why = over.reason === 'length'
        ? `${Math.round(over.needMm / 10)} cm won’t fit this ${Math.round(over.haveMm / 10)} cm bag.`
        : over.reason === 'shape' ? 'Wrong shape for this bag.'
          : `Needs ${fmtLitres(over.needL)}; ${fmtLitres(over.freeL)} left.`;
      const w = el('div', 'inside-warn');
      w.append(el('span', 'bad', alt ? `${why} Move to the ${lc(placeWords(alt)).replace(/^on /, '')}?` : why));
      if (alt && st.mine) w.append(btn('btn sm', 'Move', () => P.place(it.uid, alt), { label: `Move ${rr.name} to ${lc(placeWords(alt))}` }));
      wrap.append(w);
    }
    list.append(wrap);
  }
  box.append(list);
  if (st.mine) {
    const add = btn('btn sm inside-add', '', () => hooks.openLocker?.({ into: slot }));
    add.append(document.createTextNode('+ Add gear'));
    box.append(add);
  }
  return box;
}
