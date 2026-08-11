/**
 * The root menu — one level above the builder.
 *
 * Until now the app opened straight onto a bare bike with a panel of controls,
 * which answers "what can I change?" before anyone has asked "what is this?".
 * There are two things a person arrives wanting: to build a bike, or to look at
 * other people's. So there are two buttons.
 *
 * The scene stays live behind it — the bike is the product, and a splash screen
 * that hides it to introduce it would be introducing the wrong thing. There is
 * no veil (REDESIGN.md §3.1); the card is a surface over a running scene, and
 * the auto-rotate we switch on underneath is the argument for coming in.
 *
 *   initHome(app, { onCreate, onGallery })  ->  { open, close, get isOpen }
 */

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export function initHome(app, { onCreate, onGallery } = {}) {
  const host = document.getElementById('ui-root');
  if (!host) return null;

  const root = el('div', 'home');
  root.hidden = true;

  const card = el('div', 'home-card');
  card.append(el('h1', 'home-mark', 'PACKRIG'));
  card.append(el('p', 'home-sub', 'Build a bikepacking rig from real bags, on a bike with real geometry.'));

  const actions = el('div', 'home-actions');

  const create = el('button', 'home-btn is-primary', 'Create new rig');
  create.type = 'button';
  create.onclick = () => { close(); onCreate?.(); };

  const gallery = el('button', 'home-btn', 'View rig gallery');
  gallery.type = 'button';
  gallery.onclick = () => { close(); onGallery?.(); };

  actions.append(create, gallery);
  card.append(actions);

  // A count is the only honest advertisement for the gallery: "12 rigs" earns a
  // click, "see what others are riding" is a sentence saying the button again.
  const note = el('p', 'home-note', '');
  card.append(note);
  root.append(card);
  host.append(root);

  let open_ = false;
  // Auto-rotate is a property of the menu, not of the app, so whatever the user
  // had set is put back on the way out rather than silently overwritten.
  let restoreRotate = null;

  async function countRigs() {
    note.textContent = '';
    if (!app.rigs?.galleryEnabled) return;
    try {
      const rows = await app.rigs.gallery({ limit: 60 });
      if (rows.length) note.textContent = `${rows.length} rig${rows.length === 1 ? '' : 's'} published`;
    } catch { /* the gallery speaks for itself when you open it */ }
  }

  function open() {
    if (open_) return;
    open_ = true;
    root.hidden = false;
    void root.offsetWidth;
    root.classList.add('on');
    document.getElementById('ui-root')?.classList.add('home-open');
    if (app.controls) {
      restoreRotate = app.controls.autoRotate;
      app.controls.autoRotate = true;
    }
    countRigs();
  }

  function close() {
    if (!open_) return;
    open_ = false;
    root.classList.remove('on');
    document.getElementById('ui-root')?.classList.remove('home-open');
    if (app.controls && restoreRotate !== null) {
      app.controls.autoRotate = restoreRotate;
      restoreRotate = null;
    }
    setTimeout(() => { if (!open_) root.hidden = true; }, 260);
  }

  return { open, close, get isOpen() { return open_; } };
}
