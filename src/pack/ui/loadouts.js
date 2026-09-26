/**
 * Loadouts: the owner's spreadsheet tabs. Same locker, different arrangement,
 * a name with personality. Switch, duplicate, rename, compare, delete (with
 * undo), and move in and out of the spreadsheet format.
 */
import { btn, el, placeWords } from './labels.js';
import { thumbImg } from './thumbs.js';
import { diffLoadouts } from '../model.js';
import { fmtWeight } from '../units.js';

export function initLoadouts(app, hooks) {
  const P = app.pack;

  function open() {
    app.openSheet?.({ kind: 'detail', title: 'Trips', render: (body, h) => paint(body, h) });
  }

  function paint(body, h) {
    body.replaceChildren();
    const wrap = el('div', 'pkg-los');
    const active = P.active();
    for (const lo of P.loadouts()) {
      const t = P.evaluate(lo.id);
      const row = el('div', 'pkg-lo' + (lo.id === active?.id ? ' on' : ''));
      const main = btn('pkg-lo-main', '', () => { P.switchTo(lo.id); paint(body, h); });
      main.append(el('span', 'pkg-lo-n', lo.name || 'Untitled'), el('span', 'pkg-lo-s num', `${t ? fmtWeight(t.allup, P.lib.unit, { big: true }) : ''} · ${t?.count || 0} things · ${lo.rig?.bags?.length || 0} bags`));
      main.setAttribute('aria-current', String(lo.id === active?.id));
      row.append(main);
      const more = el('div', 'pkg-lo-acts');
      more.append(
        btn('btn sm ghost', 'Rename', () => rename(row, lo, body, h), { label: `Rename ${lo.name}` }),
        btn('btn sm ghost', 'Copy', () => { P.duplicate(lo.id); paint(body, h); }, { label: `Duplicate ${lo.name}` }),
        btn('btn sm ghost bad', 'Delete', () => {
          const at = P.loadouts().indexOf(lo);
          const gone = P.deleteLoadout(lo.id);
          paint(body, h);
          hooks.notify?.(`Deleted ${gone?.name || 'trip'}`, () => { P.restoreLoadout(gone, at); paint(body, h); });
        }, { label: `Delete ${lo.name}` }),
      );
      row.append(more);
      wrap.append(row);
    }
    const acts = el('div', 'pkg-row-actions');
    acts.append(
      btn('btn primary', 'New trip', () => { const lo = P.newLoadout('New trip', { fromCurrent: true }); paint(body, h); const r = body.querySelector('.pkg-lo.on'); if (r) rename(r, lo, body, h); }),
      btn('btn sm', 'Compare', () => openCompare()),
    );
    wrap.append(acts);
    const io = el('div', 'pkg-row-actions');
    io.append(
      btn('btn sm', 'Paste a spreadsheet', () => openImport()),
      btn('btn sm', 'Copy as spreadsheet', async (e) => {
        const text = P.exportText();
        const ok = await copy(text);
        e.target.textContent = ok ? 'Copied — paste into Sheets' : 'Copy failed';
        setTimeout(() => { e.target.textContent = 'Copy as spreadsheet'; }, 2200);
      }),
      btn('btn sm', 'Download .tsv', () => download(`${(P.active()?.name || 'trip').replace(/[^\w-]+/g, '-')}.tsv`, P.exportText())),
    );
    wrap.append(io);
    body.append(wrap);
  }

  function rename(row, lo, body, h) {
    const f = el('form', 'pkg-rename');
    const inp = el('input', 'input');
    inp.value = lo.name || '';
    inp.setAttribute('aria-label', 'Trip name');
    inp.maxLength = 60;
    f.append(inp, Object.assign(el('button', 'btn sm', 'Save'), { type: 'submit' }));
    f.onsubmit = (e) => { e.preventDefault(); P.rename(lo.id, inp.value.trim() || lo.name); paint(body, h); };
    row.replaceChildren(f);
    inp.focus();
    inp.select();
  }

  // ---- compare --------------------------------------------------------------------
  function openCompare(aId = P.active()?.id, bId = null) {
    const los = P.loadouts();
    if (los.length < 2) { hooks.notify?.('Compare needs two trips. Copy this one to make a second.'); return; }
    // the loadout this one was copied from, else the one it was copied into,
    // else the fullest other one: never an empty stranger by default
    const a = los.find((l) => l.id === aId);
    const count = (l) => Object.values(l.place || {}).filter((c) => c && c !== 'home').length;
    const others = los.filter((l) => l.id !== aId);
    bId = bId || (a?.from && others.find((l) => l.id === a.from)?.id)
      || others.find((l) => l.from === aId)?.id
      || others.sort((x, y) => count(y) - count(x))[0]?.id;
    app.openSheet?.({ kind: 'catalog', title: 'Compare', onBack: () => open(), render: (body) => paintCompare(body, aId, bId) });
  }

  function paintCompare(body, aId, bId) {
    body.replaceChildren();
    const los = P.loadouts();
    const A = los.find((l) => l.id === aId), B = los.find((l) => l.id === bId);
    const wrap = el('div', 'pkg-cmp');
    const picker = (cur, onPick) => {
      const s = el('select', 'input');
      for (const l of los) s.append(new Option(l.name || 'Untitled', l.id, false, l.id === cur));
      s.onchange = () => onPick(s.value);
      return s;
    };
    const top = el('div', 'pkg-cmp-top');
    top.append(picker(aId, (v) => paintCompare(body, v, bId)), el('span', 'pkg-vs', 'vs'), picker(bId, (v) => paintCompare(body, aId, v)));
    wrap.append(top);

    const ta = P.evaluate(A.id), tb = P.evaluate(B.id);
    const u = P.lib.unit;
    const table = el('div', 'pkg-cmp-t');
    const rowOf = (label, a, b, big) => {
      const r = el('div', 'pkg-cmp-r' + (big ? ' is-big' : ''));
      const d = b - a;
      r.append(el('span', 'pkg-cmp-k', label), el('span', 'num', fmtWeight(a, u, { big })), el('span', 'num', fmtWeight(b, u, { big })),
        el('span', 'num pkg-delta' + (d > 0.5 ? ' up' : d < -0.5 ? ' down' : ''), Math.abs(d) < 0.5 ? '—' : `${d > 0 ? '+' : '−'}${fmtWeight(Math.abs(d), u)}`));
      return r;
    };
    const hd = el('div', 'pkg-cmp-r is-h');
    hd.append(el('span', ''), el('span', '', A.name), el('span', '', B.name), el('span', '', 'Difference'));
    table.append(hd,
      rowOf('All-up', ta.allup, tb.allup, true),
      rowOf('Gear', ta.gear, tb.gear), rowOf('Bags', ta.bags, tb.bags), rowOf('Bike', ta.bike, tb.bike),
      rowOf('Worn', ta.worn, tb.worn), rowOf('Food & water', ta.food, tb.food), rowOf('Left at home', ta.home, tb.home));
    wrap.append(table);

    const moved = diffLoadouts(A, B, P.lib.locker);
    wrap.append(el('div', 'label', moved.length ? `What moved · ${moved.length}` : 'Nothing moved'));
    const list = el('div', 'pkg-moved');
    const R = P.state.resolved;
    for (const m of moved) {
      const r = R.get(m.uid);
      if (!r) continue;
      const row = el('div', 'pkg-mv');
      row.append(thumbImg(r));
      const t = el('div', 'pkg-item-t');
      t.append(el('span', 'pkg-item-n', r.name), el('span', 'pkg-item-s', `${m.from === 'home' ? 'Not on the list' : placeWords(m.from)} → ${m.to === 'home' ? 'Not on the list' : placeWords(m.to)}`));
      row.append(t, el('span', 'pkg-item-w num', fmtWeight(r.g, u)));
      list.append(row);
    }
    wrap.append(list);
    body.append(wrap);
  }

  // ---- import -----------------------------------------------------------------------
  function openImport() {
    app.openSheet?.({ kind: 'catalog', title: 'Paste a spreadsheet', render: (body, h) => paintImport(body, h) });
  }
  function paintImport(body, h) {
    body.replaceChildren();
    const wrap = el('div', 'pkg-import');
    wrap.append(el('p', 'pkg-why', 'Copy the rows from Google Sheets or Excel and paste them here: item, category, weight, then a column per bag with an X — or a single “where it goes” column. Totals rows for gear, bike and bags are read too.'));
    const name = el('input', 'input');
    name.placeholder = 'Name this trip';
    name.setAttribute('aria-label', 'Trip name');
    const ta = el('textarea', 'input pkg-ta');
    ta.rows = 10;
    ta.setAttribute('aria-label', 'Spreadsheet rows');
    ta.placeholder = 'Sleeping Bag\tCamp\t24.0\tSeat post bag\nTent\tCamp\t20.8\tFork right\n…';
    const prev = el('div', 'pkg-prev');
    const go = el('button', 'btn primary', 'Import');
    go.type = 'button';
    go.disabled = true;
    let last = null;
    ta.oninput = async () => {
      await P.gearReady;
      const { importSheet } = await import('../sheet.js');
      last = importSheet(ta.value, { gear: P.gear });
      prev.replaceChildren();
      const r = last.report;
      if (!r.rows) { prev.append(el('p', 'pkg-why', ta.value.trim() ? 'No rows with a weight found yet.' : '')); go.disabled = true; return; }
      go.disabled = false;
      const n = (x) => `${x}`;
      prev.append(el('p', 'pkg-prev-l', `${n(r.rows)} items · ${r.matched.length} matched to the catalogue · ${r.custom.length} your own`));
      const t = last.totals;
      if (Object.keys(t).length) {
        const parts = [];
        if (t.gear != null) parts.push(`gear ${t.gear} oz`);
        if (t.bike != null) parts.push(`bike ${t.bike} oz`);
        if (t.bags != null) parts.push(`bags ${t.bags} oz`);
        if (t.allup != null) parts.push(`all-up ${t.allup} oz`);
        prev.append(el('p', 'pkg-prev-l', `Your sheet says ${parts.join(', ')}.`));
        const home = last.locker.items.filter((i) => last.loadout.place[i.uid] === 'home');
        if (home.length) {
          const hoz = home.reduce((a, i) => a + i.g, 0) / 28.3495;
          prev.append(el('p', 'pkg-why', `${home.map((i) => i.name).join(', ')} (${Math.round(hoz * 10) / 10} oz) is in your gear total but marked not packed; Packrig leaves it at home, so all-up here is ${Math.round(((t.allup ?? 0) - hoz) * 10) / 10} oz.`));
        }
      }
      for (const note of r.notes.slice(0, 4)) prev.append(el('p', 'pkg-why', note));
    };
    go.onclick = async () => {
      const res = await P.importText(ta.value, { name: name.value.trim() || 'Imported trip' });
      h?.close();
      hooks.afterImport?.(res);
      hooks.notify?.(`${res.report.rows} items imported into ${res.loadout.name}`);
    };
    wrap.append(name, ta, prev, go);
    body.append(wrap);
    ta.focus();
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      try {
        const t = document.createElement('textarea');
        t.value = text; t.style.cssText = 'position:fixed;opacity:0';
        document.body.append(t); t.select();
        const ok = document.execCommand('copy'); t.remove(); return ok;
      } catch { return false; }
    }
  }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/tab-separated-values' }));
    a.download = name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  return { open, openCompare, openImport };
}
