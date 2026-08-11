/**
 * Your rigs, as the top level of the left column.
 *
 * THE PROBLEM WITH WHERE THEY WERE. Saved rigs lived inside a sheet you reached
 * by pressing your own email address in the top-right corner. That is filing
 * the work under the filing cabinet: an account is how a rig gets to another
 * device, not what a rig IS, and nobody looking for last week's setup thinks
 * "I should press my email". Saving was equally hidden — a button that made a
 * rig with a name you never chose and then gave you no way back to it.
 *
 * SO THE NAV HAS TWO LEVELS, and the rigs are the first one:
 *
 *   Your rigs        every saved rig, newest first, plus New rig
 *      ↓ tap one — it loads onto the bike
 *   ‹ Summer rig     the rig you are in: its bags, its bike, its total
 *      ‹ back to the list
 *
 * That is the same shape as every list-detail interface anyone has used, and it
 * makes the two things that were hard — finding a rig, and knowing which one
 * you are editing — the two things the column says first.
 *
 * The account does not disappear; it stops being the door. Signing in still
 * lives in the top bar, and it changes where rigs are STORED, not where they
 * are found: signed out they are in this browser, signed in they follow you,
 * and `migrateLocal()` carries the local ones up on the way through.
 *
 *   initRigNav(app, { onOpen, onNew, onRename, notify }) -> { el, refresh,
 *                                                            enter, showList,
 *                                                            get current }
 */

import { rigLitres } from '../rig.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const chevronLeft = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M12.5 4L7 10l5.5 6" fill="none" stroke="currentColor" '
    + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
};

/** "today" / "3 days ago" / a date. */
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString();
}

export function initRigNav(app, { onOpen, onNew, onRename, onLevel } = {}) {
  const root = el('div', 'rignav');

  // ---- the bar that says which level you are on ----------------------------
  const bar = el('div', 'rn-bar');
  const back = el('button', 'rn-back');
  back.type = 'button';
  back.setAttribute('aria-label', 'Back to your rigs');
  back.append(chevronLeft());
  const title = el('button', 'rn-title');
  title.type = 'button';
  const countEl = el('span', 'rn-count', '');
  bar.append(back, title, countEl);

  // ---- level 0: the list ---------------------------------------------------
  const listWrap = el('div', 'rn-list');
  const newBtn = el('button', 'rn-new', 'New rig');
  newBtn.type = 'button';

  root.append(bar, listWrap);

  let level = 'list';      // 'list' | 'rig'
  let current = null;      // { id, name, local } — the rig being edited, if saved
  let rows = [];

  back.onclick = () => showList();
  newBtn.onclick = () => {
    current = null;
    onNew?.();
    enter(null);
  };

  /**
   * Rename in place. The name is the only thing about a rig you choose, so it
   * should be editable where you read it rather than inside a dialogue.
   */
  /*
   * Rename in place. The name is the only thing about a rig you choose, so it
   * should be editable where you read it rather than inside a dialogue.
   *
   * The input lives in the bar permanently and the two swap by `hidden`. The
   * first version swapped nodes with `replaceWith`, which meant Enter removed
   * the input and the blur that immediately followed tried to remove it again —
   * a DOM exception on a path that otherwise worked, every single rename.
   */
  const nameInput = document.createElement('input');
  nameInput.className = 'rn-rename';
  nameInput.placeholder = 'Name this rig';
  nameInput.setAttribute('aria-label', 'Rig name');
  nameInput.hidden = true;
  bar.insertBefore(nameInput, countEl);

  let renaming = false;
  const endRename = (commit) => {
    if (!renaming) return;
    renaming = false;
    const name = nameInput.value.trim();
    nameInput.hidden = true;
    title.hidden = false;
    if (!commit || !name || name === current?.name) return;
    if (current) { current.name = name; onRename?.(current.id, name); }
    else { current = { id: null, name, local: true }; }
    paintBar();
  };
  title.onclick = () => {
    if (level !== 'rig') return;
    renaming = true;
    nameInput.value = current?.name || '';
    title.hidden = true;
    nameInput.hidden = false;
    nameInput.focus();
    nameInput.select();
  };
  nameInput.onblur = () => endRename(true);
  nameInput.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); endRename(true); }
    if (e.key === 'Escape') { e.preventDefault(); endRename(false); }
  };

  function paintBar() {
    root.dataset.level = level;
    // The level is a fact about the whole panel, not just this bar — the
    // sections below and the Save button both key off it. Announcing it here
    // means every path that changes level tells them, including the back
    // button, which a wrapper around `showList()` could never catch.
    onLevel?.(level);
    if (level === 'list') {
      title.textContent = 'Your rigs';
      title.disabled = true;
      countEl.textContent = rows.length ? String(rows.length) : '';
    } else {
      title.textContent = current?.name || 'Untitled rig';
      title.disabled = false;
      title.title = 'Rename this rig';
      countEl.textContent = '';
    }
  }

  /**
   * A row per rig: the bags it holds, shown as the bags themselves.
   *
   * A render of the whole rig is what belongs here, and it is what phase 4 of
   * REDESIGN.md will put here once there is somewhere to store one. Until then
   * the product photographs stack up into something you can recognise your own
   * rig by, which is the job, and it costs nothing we do not already have.
   */
  function rowFor(r) {
    const card = el('button', 'rn-row');
    card.type = 'button';

    const stack = el('span', 'rn-stack');
    const shots = (r.rig?.bags || [])
      .map((b) => findShot(b))
      .filter(Boolean)
      .slice(0, 4);
    if (shots.length) {
      for (const src of shots) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.src = src;
        img.onerror = () => img.remove();
        stack.append(img);
      }
    } else {
      stack.classList.add('is-empty');
    }

    const txt = el('span', 'rn-txt');
    txt.append(el('span', 'rn-name', r.name || 'Untitled rig'));
    const bags = r.rig?.bags?.length || 0;
    const l = rigLitres(r.rig, app.catalog);
    txt.append(el('span', 'rn-meta',
      `${bags} bag${bags === 1 ? '' : 's'} · ${l.toFixed(1)} L · ${when(r.updated_at)}`));

    card.append(stack, txt);
    card.onclick = () => open(r);
    return card;
  }

  /** The first photograph of a saved bag, matched back through the catalogue. */
  function findShot(b) {
    for (const br of app.catalog || []) {
      if (String(br.name || '').toLowerCase() !== String(b.brand || '').toLowerCase()
        && String(br.short || '').toLowerCase() !== String(b.brand || '').toLowerCase()) continue;
      for (const p of br.products) {
        if (String(p.name || '').toLowerCase() !== String(b.name || '').toLowerCase()) continue;
        if (b.size && String(p.size || '').toLowerCase() !== String(b.size).toLowerCase()) continue;
        return p.images?.[0] || null;
      }
    }
    return null;
  }

  function open(r) {
    current = { id: r.id, name: r.name, local: !!r.local };
    onOpen?.(r);
    enter(current);
  }

  /** Show the detail level for `rig` (null = an unsaved new one). */
  function enter(rig) {
    level = 'rig';
    current = rig ? { ...rig } : current;
    paintBar();
  }

  async function showList() {
    level = 'list';
    paintBar();
    listWrap.replaceChildren(el('p', 'rn-empty', 'Loading…'));
    try {
      rows = (await app.rigs?.list?.()) || [];
    } catch (e) {
      listWrap.replaceChildren(el('p', 'rn-empty', e?.message || 'Could not load your rigs'));
      return;
    }
    paintBar();
    listWrap.replaceChildren();
    if (!rows.length) {
      // One line, and the way out is the button under it — not a paragraph
      // explaining what a rig is to somebody already looking at one.
      listWrap.append(el('p', 'rn-empty', 'No saved rigs yet.'));
    } else {
      for (const r of rows) listWrap.append(rowFor(r));
    }
    listWrap.append(newBtn);
  }

  return {
    el: root,
    enter,
    showList,
    refresh: () => (level === 'list' ? showList() : paintBar()),
    get level() { return level; },
    get current() { return current; },
    set current(v) { current = v; paintBar(); },
  };
}
