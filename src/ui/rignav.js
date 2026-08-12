/**
 * The rig you have open, as the head of the left column.
 *
 * THIS USED TO BE TWO LEVELS. A list of every saved rig sat at the top of the
 * builder's column, and stepping into one revealed the bags, the bike and the
 * total below it. That put your whole library on the same page as `Add a bag`
 * and `Surprise me` — two different jobs sharing one surface, so the column
 * meant something different depending on a level nothing on screen named.
 *
 * The library moved OUT, to the menu's `rigs` view, where it has the bike
 * beside it and the room to say what is on each one (see ui/v2/browse.js).
 * What is left here is the one thing the builder needs to say: which rig you
 * are editing, and what it is called. `Back` goes to the library.
 *
 *   initRigNav(app, { onRename, onList, onLevel }) -> { el, enter, showList,
 *                                                       refresh, current }
 */

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

export function initRigNav(app, { onRename, onList, onLevel } = {}) {
  const root = el('div', 'rignav');

  const bar = el('div', 'rn-bar');
  const back = el('button', 'rn-back');
  back.type = 'button';
  back.setAttribute('aria-label', 'Back to your rigs');
  back.title = 'Your rigs';
  back.append(chevronLeft());
  const title = el('button', 'rn-title');
  title.type = 'button';
  const countEl = el('span', 'rn-count', '');
  bar.append(back, title, countEl);
  root.append(bar);

  // The panel has one level now. `data-level` survives because the stylesheet
  // and the save button both read it, and because a second level is exactly
  // what should NOT come back here.
  const level = 'rig';
  let current = null;      // { id, name, local } — the rig being edited, if saved

  back.onclick = () => showList();

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
    onLevel?.(level);
    title.textContent = current?.name || 'Untitled rig';
    title.disabled = false;
    title.title = 'Rename this rig';
    // Saved rigs live one screen up; unsaved ones have nowhere to go back to.
    back.hidden = !(app.rigs?.knownCount > 0);
    countEl.textContent = '';
  }

  /** Show the detail level for `rig` (null = an unsaved new one). */
  function enter(rig) {
    current = rig ? { ...rig } : current;
    paintBar();
  }

  /** Your rigs are a menu view now; this is the door to it. */
  function showList() {
    onList?.();
  }

  return {
    el: root,
    enter,
    showList,
    refresh: () => paintBar(),
    get level() { return level; },
    get current() { return current; },
    set current(v) { current = v; paintBar(); },
  };
}
