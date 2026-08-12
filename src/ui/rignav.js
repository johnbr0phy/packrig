/**
 * The rig you have open, as the head of the left column.
 *
 * Name on the left, save on the right. PACKRIG in the top bar is how you
 * leave — there is no second exit hiding behind a chevron.
 *
 *   initRigNav(app, { onRename, onLevel }) -> { el, actions, enter, refresh, current }
 */

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function initRigNav(app, { onRename, onLevel } = {}) {
  const root = el('div', 'rignav');

  const bar = el('div', 'rn-bar');
  const title = el('button', 'rn-title');
  title.type = 'button';
  const actions = el('div', 'rn-actions');
  bar.append(title, actions);
  root.append(bar);

  const level = 'rig';
  let current = null;

  const nameInput = document.createElement('input');
  nameInput.className = 'rn-rename';
  nameInput.placeholder = 'Name this rig';
  nameInput.setAttribute('aria-label', 'Rig name');
  nameInput.hidden = true;
  bar.insertBefore(nameInput, actions);

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
  }

  function enter(rig) {
    current = rig ? { ...rig } : current;
    paintBar();
  }

  return {
    el: root,
    actions,
    enter,
    refresh: () => paintBar(),
    get level() { return level; },
    get current() { return current; },
    set current(v) { current = v; paintBar(); },
  };
}
