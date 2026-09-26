/**
 * One item: what it is, what it weighs, and where it goes.
 *
 * "Where it goes" is every placement the bike allows, as one row of choices —
 * the bags that are on the bike, strapped outside, hanging off, on the frame,
 * on you, at home. It is also the keyboard path for everything drag-and-drop
 * does on a desktop.
 */
import { SLOT_ORDER, SLOT_WORD, btn, el, placeWords } from './labels.js';
import { thumbFor } from './thumbs.js';
import { parsePlace, CAT_LABEL } from '../model.js';
import { fmtWeight, fmtLitres, gToOz, ozToG } from '../units.js';

export function initItemSheet(app, hooks) {
  const P = app.pack;

  function open(uid) {
    app.openSheet?.({ kind: 'detail', title: 'Item', render: (body, h) => paint(body, h, uid), onBack: hooks.back || null });
  }

  function paint(body, h, uid) {
    const st = P.state;
    const it = st.locker.items.find((i) => i.uid === uid);
    if (!it) { h?.close(); return; }
    const r = st.resolved.get(uid);
    h?.setTitle(CAT_LABEL[r.cat] || 'Item');
    body.replaceChildren();
    const wrap = el('div', 'pkg-itemsheet');

    const hero = el('div', 'pkg-ihero');
    const img = el('img', 'pkg-ihero-img');
    img.alt = '';
    thumbFor(r).then((u) => { if (u) img.src = u; });
    hero.append(img);
    wrap.append(hero);

    wrap.append(el('h3', 'pkg-iname', r.name));
    const facts = [fmtWeight(r.g, P.lib.unit), `${fmtLitres(r.litres)} packed`];
    if (!r.rigid && r.compress >= 0.2) facts.push(`squashes to ${fmtLitres(r.litres * (1 - r.compress))}`);
    facts.push(`${Math.round(r.dims[0])} × ${Math.round(r.dims[1])} × ${Math.round(r.dims[2])} cm`);
    wrap.append(el('div', 'pkg-isub num', facts.join(' · ')));

    // ---- where it goes ------------------------------------------------------------
    if (st.mine) {
      const cur = st.loadout.place[uid] ?? 'home';
      const sec = el('div', 'pkg-block');
      sec.append(el('div', 'label', 'Where it goes'));
      const opts = el('div', 'pkg-places');
      const choice = (code, label) => {
        const b = btn('chip pkg-place' + (code === cur ? ' on' : ''), label, () => {
          P.place(uid, code);
          const s = parsePlace(code).slot;
          if (s && parsePlace(code).loc === 'bag') P.openBag(s);
          paint(body, h, uid);
        });
        b.setAttribute('aria-pressed', String(code === cur));
        opts.append(b);
      };
      const bags = SLOT_ORDER.filter((s) => app.bags.equipped[s]);
      for (const s of bags) {
        if (/^framebag/.test(s)) { choice(s, SLOT_WORD[s]); choice(`${s}:L`, 'Left side'); choice(`${s}:R`, 'Right side'); } else choice(s, SLOT_WORD[s]);
      }
      const outsideOn = bags.filter((s) => ['seatpack', 'saddlebag', 'barroll', 'barbag', 'trunk', 'forkL', 'forkR'].includes(s));
      for (const s of outsideOn.slice(0, 2)) choice(`${s}:lashed`, `Strapped on ${SLOT_WORD[s].toLowerCase()}`);
      if (bags.includes('seatpack') || bags.includes('saddlebag')) choice(`${bags.includes('seatpack') ? 'seatpack' : 'saddlebag'}:dangle`, 'Hanging off the back');
      choice('frame', 'On the frame');
      choice('body', 'On me');
      choice('body:hip', 'Hip pack');
      choice('home', 'Leave at home');
      sec.append(opts);
      // the catalogue's reason for its first choice, when the rider hasn't picked one
      const why = r.places?.[0];
      if (why?.why) sec.append(el('p', 'pkg-why', `Most riders: ${why.why}`));
      wrap.append(sec);
    }

    // ---- weight ----------------------------------------------------------------------
    if (st.mine) {
      const sec = el('div', 'pkg-block');
      sec.append(el('div', 'label', 'Your weight for it'));
      const f = el('form', 'pkg-wrow');
      const inp = el('input', 'input num');
      inp.inputMode = 'decimal';
      const imp = P.lib.unit === 'imperial';
      inp.value = imp ? (Math.round(gToOz(r.g) * 10) / 10).toString() : Math.round(r.g).toString();
      inp.setAttribute('aria-label', `Weight in ${imp ? 'ounces' : 'grams'}`);
      f.append(inp, el('span', 'pkg-u', imp ? 'oz' : 'g'));
      const save = el('button', 'btn sm', 'Save');
      save.type = 'submit';
      f.append(save);
      f.onsubmit = (e) => {
        e.preventDefault();
        const v = parseFloat(inp.value);
        if (!(v > 0)) return;
        P.update(uid, { g: imp ? Math.round(ozToG(v) * 10) / 10 : v });
        paint(body, h, uid);
      };
      sec.append(f);
      const c = it.ref ? P.gear?.get(it.ref) : null;
      if (c && Math.abs(c.weight_g - r.g) > 1) sec.append(el('p', 'pkg-why', `Catalogue: ${fmtWeight(c.weight_g, P.lib.unit)}${c.generic ? ' (typical)' : ''}`));
      wrap.append(sec);
    }

    // ---- where the numbers come from ------------------------------------------------
    const c = it.ref ? P.gear?.get(it.ref) : null;
    if (c) {
      const sec = el('div', 'pkg-block');
      sec.append(el('div', 'label', 'Source'));
      const basis = c.basis === 'recall' ? 'Maker spec, not re-checked' : c.basis === 'owner' ? 'The owner’s own scale' : 'Maker or retailer page';
      const p = el('p', 'pkg-why', basis);
      const src = c.sources?.find((s) => /^https?:/.test(s.url || ''));
      if (src) {
        const a = el('a', 'btn sm ghost', new URL(src.url).hostname.replace(/^www\./, ''));
        a.href = src.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        p.append(document.createTextNode(' · '), a);
      }
      sec.append(p);
      if (c.note) sec.append(el('p', 'pkg-why pkg-note-s', c.note.length > 220 ? `${c.note.slice(0, 218)}…` : c.note));
      wrap.append(sec);
    }

    if (st.mine) {
      const foot = el('div', 'sheet-foot-src');
      const row = el('div', 'row');
      row.append(btn('btn bad wide', 'Remove from my kit', () => {
        const snap = JSON.parse(JSON.stringify({ it, place: P.lib.loadouts.map((l) => [l.id, l.place[uid]]) }));
        P.remove(uid);
        h?.close();
        hooks.notify?.(`Removed ${r.name}`, () => {
          P.lib.locker.items.push(snap.it);
          for (const [id, code] of snap.place) if (code !== undefined && code !== null) { const lo = P.lib.loadouts.find((l) => l.id === id); if (lo) lo.place[uid] = code; }
          P.save(); P.recompute();
        });
      }));
      foot.append(row);
      wrap.append(foot);
    }
    body.append(wrap);
  }

  return { open };
}
