import { SLOTS, productSlotFor, colorwayFor } from './bags.js';
import { initRigsUI } from './rigsui.js';
import { applyRig, captureRig, rigURL } from './rig.js';
import { productsForSlot } from './catalog.js';
import { PAINTS } from './bike.js';
import { setSheetLift } from './mobile.js';
import {
  buyLink, displayName, lineOf, litersOf, modelTitle, sizeEchoesName, sizeIsVolume,
  sizeOf, srcOf, stripLine, swatchStyle,
} from './ui/product.js';
import { initBagSheet } from './ui/bagsheet.js';
import { initMenu } from './ui/v2/menu.js';
import { icon } from './ui/v2/icons.js';
import { initCatalogue } from './ui/catalogue.js';
import { initRigNav } from './ui/rignav.js';

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

/** Same as el() but sets textContent — use for anything catalog-derived. */
const elt = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** Mount points grouped by the zone of the bike they live on. */
// This list is hand-written, so a slot added to SLOTS does not appear here on
// its own and its products become unreachable — present in the catalogue, drawn
// correctly by their builder, and impossible to select. `barpocket` and
// `toptube_rear` were both in that state: the mount existed, the products were
// assigned, and nothing showed up.
const ZONES = [
  { label: 'Cockpit', slots: ['barroll', 'barbag', 'barpocket', 'randobag', 'stemL', 'stemR', 'toptube'] },
  { label: 'Frame', slots: ['framebag_full', 'framebag_half', 'toptube_rear', 'downtube'] },
  { label: 'Saddle', slots: ['seatpack', 'saddlebag'] },
  { label: 'Fork', slots: ['forkL', 'forkR'] },
  { label: 'Rear', slots: ['pannierL', 'pannierR', 'trunk'] },
];

const PAINT_LABEL = {
  Slate: 'Slate Grey',
  Forest: 'Forest Green',
  Oxblood: 'Oxblood',
  Midnight: 'Midnight Blue',
  Sand: 'Desert Sand',
  Violet: 'Deep Violet',
};


/**
 * Viewport shape, asked rather than sniffed. `compact` must stay in step with
 * the media query of the same name in ui.css — it is what decides whether the
 * appearance controls live in the bar or behind the Appearance sheet.
 */
const mql = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
const COMPACT = mql('(max-width: 900px), (pointer: coarse)');
const PHONE = mql('(max-width: 560px)');
const TOUCH = mql('(pointer: coarse)');

export function initUI(app) {
  const root = document.getElementById('ui-root');
  root.innerHTML = '';

  // Saved rigs + accounts. Created here so it can borrow #ui-root and sync().
  let rigsUI = null;
  queueMicrotask(() => {
    rigsUI = initRigsUI(app, {
      auth: app.auth, store: app.rigs, host: root,
      onLoaded: () => sync(),
    });
    app.openRigs = (m) => rigsUI.open(m);
    app.__rigURL = () => kitURL();   // headless tests assert on the real link
  });

  // remember the opening camera framing so "reset view" has somewhere to go
  const homeView = {
    pos: app.camera?.position?.clone?.() || null,
    target: app.controls?.target?.clone?.() || null,
  };

  // The two levels above the builder. Created after a microtask for the same
  // reason `rigsUI` is: they read `app.rigs`, which main.js attaches around us.
  queueMicrotask(() => {
    /*
     * The menu — start screen, loadouts and gallery — is one module now rather
     * than the two unrelated surfaces (`ui/home.js`, `ui/gallery.js`) it
     * replaces. See src/ui/v2/menu.js for why they had to become one thing.
     */
    app.menu = initMenu(app, {
      onBuild: ({ adopted, build }) => {
        // "Build a rig" means a bare frame. Arriving from a loadout or a
        // gallery rig means that rig, already mounted, now yours to edit.
        if (build && !adopted) {
          app.clearAll?.();
          savedSnapshot = null;
          rigNav.current = null;
          rigNav.enter(null);
        } else if (adopted) {
          savedSnapshot = null;
          rigNav.current = { id: null, name: adopted.name || 'Untitled rig', local: true };
          rigNav.enter(rigNav.current);
        }
        sync();
      },
    });
    /*
     * `app.home` and `app.gallery` survive as adapters. Four headless tools
     * drive the root menu by those names (tools/_menutest.mjs, _ttsweep.mjs,
     * _contrast.mjs, bag-portraits.mjs); renaming the module should not
     * silently turn every screenshot harness into a no-op.
     */
    app.home = {
      open: () => app.menu?.open('start'),
      close: () => app.menu?.close(),
      get isOpen() { return app.menu?.isOpen && app.menu?.view === 'start'; },
    };
    app.gallery = {
      open: () => app.menu?.open('gallery'),
      close: () => app.menu?.close(),
      get isOpen() { return app.menu?.isOpen && app.menu?.view === 'gallery'; },
    };
    // The root level is where you arrive, unless a shared link means you have
    // already been handed a specific rig to look at.
    if (!app.__cameWithRig) {
      app.menu.open('start');
    } else {
      app.__enteredBuilder = true;
      /*
       * Somebody has been sent this bike. They arrive in the builder with no
       * idea what they are looking at or that it is theirs to change — the one
       * moment in the product with a genuine audience, and it said nothing.
       * Everything in the line is already on the bike; none of it is a fetch.
       */
      queueMicrotask(() => {
        const bags = Object.keys(app.bags?.equipped || {}).length;
        if (!bags) return;
        const litres = Object.values(app.bags.equipped)
          .reduce((n, e) => n + (Number(e.product?.liters) || 0), 0);
        notify(
          `Someone shared this rig — ${bags} bag${bags === 1 ? '' : 's'}, `
          + `${Math.round(litres * 10) / 10} L. Change anything you like.`,
          null,
          { label: 'Start mine', run: () => app.menu?.open('start') },
        );
      });
    }
  });

  // ---- the top bar --------------------------------------------------------
  /*
   * One bar across the top holds everything that is not the rig: the wordmark,
   * the actions that used to be a floating bottom dock, the camera tools that
   * used to float top-right, and who you are signed in as.
   *
   * Three separate pieces of floating chrome plus a left panel plus a right
   * sheet meant the bike was boxed in on all four sides. A bar that spans the
   * viewport also never has to move when a sheet opens, which deletes the two
   * repositioning rules that were the fiddliest part of the shell.
   */
  const topbar = el('div', 'topbar glass');
  const mark = el('div', 'wordmark');
  mark.append(el('h1', null, 'PACKRIG'));
  topbar.append(mark);
  const topRight = el('div', 'top-right');

  // ---- left panel: what is on the bike -----------------------------------
  const panel = el('div', 'panel glass');
  const head = el('header', 'panel-head');
  const countEl = elt('span', 'panel-count', '0');
  // On a phone the panel is a bottom sheet, and its header doubles as the
  // handle: tap to peek at the bike, tap again to get the list back. The
  // chevron, the running total and the "+" are inert on desktop — CSS only
  // gives them a box below 560px.
  const chevron = elt('button', 'sheet-chevron', '▾');
  chevron.title = 'Collapse the rig';
  chevron.setAttribute('aria-label', 'Collapse the rig');
  const peekTotal = elt('span', 'peek-total', '');
  const sheetAdd = elt('button', 'sheet-add', '+');
  sheetAdd.title = 'Pick a mount point';
  sheetAdd.setAttribute('aria-label', 'Add a bag');
  sheetAdd.onclick = (e) => { e.stopPropagation(); openMountPicker(); };
  // No title here: "Bike" and "Bags on bike" are the section headings below,
  // and a third heading above them saying the same thing is the duplication
  // §1.1 is about. The header survives for the phone, where it is the sheet's
  // drag handle and running total.
  // The chevron duplicates the grab handle and the "+" duplicates the Add a bag
  // button six rows below it. Both go; the header carries the peek total, which
  // is the one thing you cannot see when the sheet is collapsed.
  head.append(chevron, peekTotal);
  const listEl = el('div', 'bag-list');

  let collapsed = false;
  function setSheetCollapsed(next) {
    collapsed = !!next;
    panel.classList.toggle('collapsed', collapsed);
    chevron.setAttribute('aria-expanded', String(!collapsed));
    chevron.title = collapsed ? 'Show the rig' : 'Collapse the rig';
    head.setAttribute('aria-expanded', String(!collapsed));
    head.setAttribute('aria-label', collapsed ? 'Show your rig' : 'Hide your rig and see the bike');
    /*
     * Retune the phone camera to the sheet that is actually there.
     *
     * mobile.js lifts the bike by 0.22 of the viewport so an OPEN sheet does not
     * bury it, and says in as many words that the number should be driven by
     * `setSheetLift()` once the app tracks open/collapsed. It now does — and
     * without this, closing the sheet to look at the bike left the bike pinned
     * to the top third with an empty half-screen of ground beneath it, which is
     * the opposite of what closing it was for.
     */
    if (PHONE.matches) {
      setSheetLift(collapsed ? 0.05 : 0.22);
      app.sheets?.resync?.();
    }
  }
  setSheetCollapsed(false);
  head.onclick = () => { if (PHONE.matches) setSheetCollapsed(!collapsed); };
  head.setAttribute('role', 'button');
  head.setAttribute('tabindex', '0');
  head.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (PHONE.matches) setSheetCollapsed(!collapsed);
  };
  // back to a plain panel if the sheet layout stops applying
  PHONE.addEventListener?.('change', (e) => { if (!e.matches) setSheetCollapsed(false); });

  const foot = el('div', 'panel-foot');
  const summary = el('div', 'kit-summary');
  const totalEl = elt('span', 'kit-total', '0 L');
  summary.append(elt('span', 'kit-label', 'Total capacity'), totalEl);
  const addBtn = el('button', 'add-bag');
  addBtn.append(icon('plus', { size: 16, cls: 'plus' }), elt('span', null, 'Add a bag'));
  addBtn.title = 'Pick a mount point';
  addBtn.onclick = () => openMountPicker();
  const shareBtn = el('button', 'share-kit');
  const shareLabel = elt('span', 'lbl', 'Share rig');
  shareBtn.append(elt('span', 'ic', '⧉'), shareLabel);
  shareBtn.title = 'Copy a link to this rig';
  shareBtn.onclick = () => shareKit(shareBtn, shareLabel);
  // The panel's own "My rigs" button is gone: the top bar carries the account,
  // and two buttons opening the same panel from opposite corners is exactly the
  // duplication §1.1 is about.
  foot.append(summary, shareBtn);
  root.append(panel);
  listEl.addEventListener('scroll', updateFade);

  // ---- build actions: randomise, clear ------------------------------------
  const btnRand = el('button', 'btn quiet');
  btnRand.append(icon('bolt', { size: 16, cls: 'bolt' }), elt('span', null, 'Surprise me'));
  btnRand.onclick = () => app.randomize();
  // clearing the whole bike is destructive, so it asks once before it fires
  const btnClear = elt('button', 'btn ghost', 'Clear rig');
  let clearTimer = null;
  const resetClear = () => {
    clearTimeout(clearTimer);
    btnClear.classList.remove('confirm');
    btnClear.textContent = 'Clear rig';
  };
  btnClear.onclick = () => {
    if (btnClear.classList.contains('confirm')) {
      resetClear();
      // Removing ONE bag has always offered an undo; removing all of them —
      // the more destructive of the two by an order of magnitude — offered a
      // confirm and then nothing. Same snapshot the save button already takes.
      const before = (() => { try { return captureRig(app, { name: '' }); } catch { return null; } })();
      const n = Object.keys(app.bags.equipped).length;
      app.clearAll();
      if (before && n) {
        notify(`Cleared ${n} bag${n === 1 ? '' : 's'}`, () => {
          applyRig(app, before);
          sync();
        });
      }
      return;
    }
    btnClear.classList.add('confirm');
    btnClear.textContent = 'Sure?';
    clearTimer = setTimeout(resetClear, 3000);
  };

  const paintGroup = el('div', 'paint-group');
  paintGroup.append(elt('span', 'group-label', 'Frame'));
  const paints = el('div', 'paints');
  for (const [name, def] of Object.entries(PAINTS)) {
    const sw = el('button', 'paint');
    sw.style.background = '#' + def.color.toString(16).padStart(6, '0');
    sw.title = PAINT_LABEL[name] || name;
    sw.setAttribute('aria-label', `Frame colour: ${PAINT_LABEL[name] || name}`);
    sw.dataset.paint = name;
    sw.onclick = () => app.setPaint(name);
    paints.append(sw);
  }
  paintGroup.append(paints);

  // Bidon colour — the bottles are part of the build, so they belong here.
  const bidonGroup = el('div', 'bottle-group');
  bidonGroup.append(elt('span', 'lbl', 'Bidons'));
  const bidons = el('div', 'bidons');
  const BIDON_COLORS = [
    ['#6fa892', 'Mint'], ['#c2601f', 'Burnt orange'], ['#e8e6e1', 'Chalk'],
    ['#1d1f22', 'Black'], ['#c9483a', 'Red'], ['#3f6ea8', 'Blue'],
  ];
  /*
   * Both bottles, every time.
   *
   * This used to alternate: the first press painted the seat-tube bottle, the
   * next the down-tube one, and so on off a running counter. That is not a
   * control — you cannot aim it. Pressing "Red" twice painted two different
   * bottles, and there was no way to say which one you meant. Nobody arrives
   * wanting two differently-coloured bidons badly enough to guess a parity, so
   * one press paints the pair and the swatch that is on is the colour they are.
   */
  for (const [hex, label] of BIDON_COLORS) {
    const sw = el('button', 'bidon');
    sw.style.background = hex;
    sw.title = label;
    sw.setAttribute('aria-label', `Bidon colour: ${label}`);
    sw.onclick = () => {
      const c = parseInt(hex.slice(1), 16);
      app.bike.setBottleColor('st', c);
      app.bike.setBottleColor('dt', c);
      for (const b of bidons.children) b.classList.remove('on');
      sw.classList.add('on');
    };
    bidons.append(sw);
  }
  bidonGroup.append(bidons);

  // The environment picker is gone for now. Five scenes were a setting people
  // touched once, sitting permanently in the chrome. `app.setEnv` and every
  // HDRI stay exactly as they were — this removes the control, not the feature,
  // so bringing it back later is a few lines and no data work.

  /*
   * The "Bike" section of the left column: what the frame and the bottles look
   * like. These were swatch groups floating in a bottom bar, one shelf away
   * from the bags they sit next to on the actual bicycle. Everything you are
   * building now reads down one column — bike, then bags.
   */
  const bikeSec = el('section', 'nav-sec');
  bikeSec.append(elt('h2', 'nav-sec-title', 'Bike'));
  const appearance = el('div', 'appearance');
  appearance.append(paintGroup, bidonGroup);
  bikeSec.append(appearance);


  /*
   * The "Bags" section, and the column assembled.
   *
   * Reading order is the order you build in: choose how the bike looks, see
   * what is on it, add to it. `Surprise me` sits with `Add a bag` because they
   * are the same decision taken two ways — one deliberate, one not.
   */
  const bagsSec = el('section', 'nav-sec');
  const bagsHead = el('div', 'nav-sec-head');
  bagsHead.append(elt('h2', 'nav-sec-title', 'Bags on the rig'), countEl, btnClear);
  bagsSec.append(bagsHead, listEl);
  const bagActions = el('div', 'nav-actions');
  bagActions.append(addBtn, btnRand);
  bagsSec.append(bagActions);

  /*
   * Two levels in one column. `rigNav` owns the top one — the list of saved
   * rigs — and the three sections below it are the second: the rig you have
   * open. `data-level` on the panel decides which is showing, so switching is a
   * class change rather than a rebuild, and the bike underneath never blinks.
   */
  const rigNav = initRigNav(app, {
    onOpen: (row) => {
      const { missing } = applyRig(app, row.rig);
      savedSnapshot = snapshot();
      sync();
      if (missing?.length) console.warn('[packrig] saved rig references bags no longer in the catalogue:', missing);
    },
    onNew: () => { app.clearAll?.(); savedSnapshot = null; sync(); },
    onRename: (id, name) => { if (id) app.rigs?.rename?.(id, name).catch(() => {}); },
    onLevel: (lvl) => { panel.setAttribute('data-level', lvl); paintSave(); },
    notify: (t, u, a) => notify(t, u, a),
  });

  // Bags first, bike second. The rig is what you came to build; frame colour is
  // a detail, and it was sitting above the content with equal billing — on a
  // phone it was the entire first screen of the panel.
  panel.append(head, rigNav.el, bagsSec, bikeSec, foot);
  app.rigNav = rigNav;

  // the hint retires for good once the user has driven the camera, or after 5s
  const HINT_KEY = 'packrig.hintSeen';
  const seen = (() => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } })();
  let hint = null;
  const canvas = document.getElementById('scene') || window;
  function killHint() {
    if (!hint) return;
    const node = hint;
    hint = null;
    node.classList.add('gone');
    setTimeout(() => node.remove(), 700);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode — just fade */ }
    canvas.removeEventListener('pointerdown', killHint);
    canvas.removeEventListener('wheel', killHint);
  }
  if (!seen) {
    // "scroll to zoom" means nothing to a thumb, and the panel it points at is
    // a sheet sitting right under the message
    hint = elt('div', 'hint', TOUCH.matches
      ? 'Drag to orbit · pinch to zoom'
      : 'Drag to orbit · scroll to zoom');
    root.append(hint);
    // §14.5: first session only, gone on the first drag. It was sitting over
    // the middle of the product for five seconds of every visit — the one place
    // nothing should ever cover.
    setTimeout(killHint, 3200);
    canvas.addEventListener('pointerdown', killHint, { passive: true });
    canvas.addEventListener('wheel', killHint, { passive: true });
  }

  // ---- top-right camera tools --------------------------------------------
  /*
   * The camera tools. These were an emoji and two symbol-block characters —
   * 💨, ⟳ and ⌂ — which is three different typefaces in one 96px control, one
   * of them rendered by the operating system in colour. They are drawn from
   * the one icon set now; see src/ui/v2/icons.js.
   */
  const tools = el('div', 'viewtools glass');
  const rotBtn = el('button', 'tool-btn');
  rotBtn.append(icon('orbit'));
  rotBtn.title = 'Auto-rotate';
  rotBtn.setAttribute('aria-label', 'Toggle auto-rotate');
  rotBtn.onclick = () => {
    app.controls.autoRotate = !app.controls.autoRotate;
    rotBtn.classList.toggle('on', app.controls.autoRotate);
  };
  const homeBtn = el('button', 'tool-btn');
  homeBtn.append(icon('reframe'));
  homeBtn.title = 'Reset view';
  homeBtn.setAttribute('aria-label', 'Reset camera to the default view');
  homeBtn.onclick = () => {
    if (homeView.pos) app.camera.position.copy(homeView.pos);
    if (homeView.target) app.controls.target.copy(homeView.target);
    app.controls.update();
  };
  const tunnelBtn = el('button', 'tool-btn');
  tunnelBtn.append(icon('wind'));
  tunnelBtn.title = 'Wind tunnel';
  tunnelBtn.setAttribute('aria-label', 'Open the wind tunnel');
  tunnelBtn.onclick = () => {
    tunnelBtn.classList.toggle('on');
    app.openWindTunnel?.();
  };
  tools.append(rotBtn, el('span', 'tool-divider'), homeBtn, el('span', 'tool-divider'), tunnelBtn);
  topRight.append(tools);

  /*
   * Who you are, in the bar rather than behind a menu.
   *
   * Signed out it is the way in; signed in it is your email and the way to your
   * rigs. Either way it is one button, because "Sign in" and "My rigs" are the
   * same destination — `rigsUI` decides which screen to open from the auth
   * state it already tracks.
   */
  /*
   * Save rig — REDESIGN.md §6, goal 2.
   *
   * It appears the moment there is something worth saving and disappears when
   * there is not, so the answer to "can I keep this?" is always on screen
   * rather than behind a menu. Saving does not ask for an account first: the
   * store has a full local branch and `migrateLocal()` pushes local rigs up on
   * the first sign-in, so a signed-out save is a real save.
   */
  let savedSnapshot = null;          // the rig as it was when last saved
  const snapshot = () => {
    try { return JSON.stringify(captureRig(app, { name: '' })); } catch { return null; }
  };
  const saveBtn = el('button', 'save-btn');
  const saveLabel = elt('span', 'save-label', 'Save rig');
  saveBtn.append(saveLabel);
  saveBtn.onclick = () => {
    if (saveBtn.classList.contains('is-done')) { rigNav.showList(); return; }
    const cur = rigNav.current;
    // Saving an OPEN rig updates it. It used to make a new "My rig 4" every
    // time, so the list filled with copies of one bike and the rig you thought
    // you were editing never changed.
    const write = cur?.id
      ? app.rigs?.update(cur.id, { name: cur.name })
      : app.rigs?.save(cur?.name || `Rig ${(app.rigs?.localCount?.() || 0) + 1}`);
    Promise.resolve(write)
      .then((row) => {
        savedSnapshot = snapshot();
        rigNav.current = { id: row?.id ?? cur?.id ?? null, name: row?.name || cur?.name || 'Untitled rig', local: !!row?.local };
        paintSave();
        notify(cur?.id ? `Saved “${rigNav.current.name}”` : `Saved “${rigNav.current.name}”`,
          null, { label: 'Rename', run: () => document.querySelector('.rn-title')?.click() });
      })
      .catch((e) => notify(e?.message || 'Could not save that rig'));
  };
  /**
   * Three states, and the third is the one that matters: once saved, the button
   * goes quiet rather than vanishing, and comes back the instant the bike
   * differs from what was stored.
   */
  function paintSave() {
    const bags = Object.keys(app.bags?.equipped || {}).length;
    const dirty = !savedSnapshot || savedSnapshot !== snapshot();
    saveBtn.hidden = bags === 0;
    saveBtn.classList.toggle('is-done', !dirty);
    saveLabel.textContent = dirty ? 'Save rig' : 'Saved ✓';
    saveBtn.title = dirty ? 'Save this build' : 'Saved — tap for your other rigs';
    // At the list level there is no rig to save; the button would be saving
    // whatever happened to be on the bike behind the list.
    if (app.rigNav?.level === 'list') saveBtn.hidden = true;
  }
  topRight.append(saveBtn);

  const acctBtn = el('button', 'acct-btn');
  const acctLabel = elt('span', 'acct-label', 'My rigs');
  acctBtn.append(el('span', 'acct-dot'), acctLabel);
  // Signing in changes where rigs are STORED, not where they are found — they
  // are the top of the left column now. So this opens the account, nothing else.
  acctBtn.onclick = () => app.openRigs?.(app.auth?.signedIn ? 'list' : 'signin');
  function paintAccount() {
    const on = !!app.auth?.signedIn;
    acctBtn.classList.toggle('is-in', on);
    // The email is the identity; "My rigs" is what you came for. Signed out,
    // neither is true yet, so the button says the thing you can actually do.
    acctLabel.textContent = on ? (app.auth.email || 'Account') : 'Sign in';
    acctBtn.title = on ? 'Your account' : 'Sign in so your rigs follow you between devices';
    acctBtn.hidden = !app.auth?.enabled;
  }
  paintAccount();
  app.auth?.onChange?.(paintAccount);
  topRight.append(acctBtn);

  /*
   * One level up. The builder is not the root of the app any more — `home.js`
   * is — so there has to be a way back to it that is not the browser's back
   * button. It sits next to the wordmark because that is where "up" lives in
   * every other application anyone has used.
   */
  const menuBtn = el('button', 'home-up');
  menuBtn.type = 'button';
  menuBtn.title = 'Back to the start';
  menuBtn.setAttribute('aria-label', 'Back to the start');
  menuBtn.textContent = 'Menu';
  menuBtn.onclick = () => app.menu?.open('start');
  mark.after(menuBtn);

  /*
   * The wordmark goes home too.
   *
   * It is the first thing anyone clicks when they want out of a screen, on
   * every site anyone has ever used, and here it did nothing at all — an inert
   * <h1> in the corner. Making it a button rather than an <h1> wrapped in one
   * keeps the heading semantics where they were and adds no markup.
   */
  mark.setAttribute('role', 'link');
  mark.setAttribute('tabindex', '0');
  mark.title = 'Back to the start';
  mark.setAttribute('aria-label', 'Packrig — back to the start');
  mark.classList.add('is-link');
  const goHome = () => app.menu?.open('start');
  mark.onclick = goHome;
  mark.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    goHome();
  };

  topbar.append(topRight);
  root.append(topbar);

  /**
   * One line, bottom-centre, with an action. Built for undo (REDESIGN.md §5.1):
   * removing a bag is a single tap with no confirm, so the way back has to be
   * on screen rather than in a menu. Auto-dismisses; a second call replaces the
   * first rather than stacking.
   */
  let toastTimer = null;
  const toastEl = el('div', 'toast');
  toastEl.hidden = true;
  root.append(toastEl);
  function notify(text, undo, action) {
    clearTimeout(toastTimer);
    toastEl.replaceChildren(elt('span', 'toast-txt', text));
    // `undo` is the common case and keeps its shorthand; `action` is for the
    // toasts that offer something other than putting a thing back.
    const act = undo ? { label: 'Undo', run: undo } : action;
    if (act) {
      const b = elt('button', 'toast-act', act.label);
      b.onclick = () => { hideToast(); act.run(); };
      toastEl.append(b);
    }
    toastEl.hidden = false;
    void toastEl.offsetWidth;
    toastEl.classList.add('on');
    toastTimer = setTimeout(hideToast, 6000);
  }
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.classList.remove('on');
    setTimeout(() => { if (!toastEl.classList.contains('on')) toastEl.hidden = true; }, 220);
  }

  const bagSheet = initBagSheet(app, {
    openCatalogue: (uiSlot) => catalogue.open(uiSlot),
    sync: () => sync(),
    notify,
  });

  // ---- overlay plumbing ---------------------------------------------------
  /*
   * REDESIGN.md phase 1. These two functions used to build a centred `.picker`
   * behind a full-screen `.picker-veil` — a dimming blur over the 3D scene,
   * which REDESIGN.md §14.1 calls the biggest contradiction in the product.
   * They now hand their body to the one sheet shell in `ui/sheet.js` and keep
   * their old signatures, so all six call sites below are untouched.
   *
   * Escape, the close button and one-sheet-at-a-time all come from the shell.
   */
  let handle = null;

  /** Which of the shell's widths a given picker wants. §3.1 of REDESIGN.md. */
  const KIND_FOR = {
    'appearance-sheet': 'detail',
    'mount-picker': 'detail',
    'brand-picker': 'detail',
    'brand-index': 'catalog',
    'brand-catalog': 'catalog',
    'model-picker': 'catalog',
  };

  function closeOverlay() {
    app.sheets?.closeSheet();
  }

  function openOverlay(extraCls) {
    const pk = el('div', 'picker' + (extraCls ? ' ' + extraCls : ''));
    handle = app.openSheet?.({
      kind: KIND_FOR[extraCls] || 'catalog',
      title: '',
      render: (body) => body.append(pk),
      onClose: () => { handle = null; },
    });
    return pk;
  }

  /** crumbs: ancestor steps as [{label, onClick}]; title is the current step. */
  function pickerHead({ title, sub, crumbs, onBack, extra }) {
    const h = el('header', 'pk-head');
    if (onBack) {
      const b = elt('button', 'pk-back', '←');
      b.title = 'Back';
      b.onclick = onBack;
      h.append(b);
    }
    const t = el('div', 'pk-title');
    if (crumbs?.length) {
      const trail = el('nav', 'pk-crumbs');
      crumbs.forEach((c, i) => {
        if (i) trail.append(elt('span', 'crumb-sep', '›'));
        const b = elt('button', 'crumb', c.label);
        b.onclick = c.onClick;
        trail.append(b);
      });
      // The current step is the sheet's own title (set below), so repeating it
      // here gave every catalogue screen its name twice — §1.1.

      t.append(trail);
    }
    // The title and the close button belong to the sheet shell now, not to
    // each picker — one header, drawn once. Crumbs, the back arrow and any
    // `extra` control stay here because they are per-step, not per-sheet.
    handle?.setTitle(title);
    if (sub) t.append(elt('p', null, sub));
    h.append(t);
    if (extra) h.append(extra);
    return h;
  }

  function removeAction(uiSlot) {
    const cur = app.bags.equipped[uiSlot];
    if (!cur) return null;
    const btn = elt('button', 'pk-remove', 'Remove bag');
    btn.title = `Remove ${cur.product.name}`;
    btn.onclick = () => { app.bags.remove(uiSlot); closeOverlay(); sync(); };
    return btn;
  }

  /**
   * Frame, bidon and scene colours, lifted out of the bar on a narrow screen.
   * The controls themselves are moved, not rebuilt, so every listener and the
   * `.on` state sync() paints survive the trip in both directions.
   */
  // `openAppearance()` and the breakpoint listener that put the swatches back
  // in the bar are both gone. The controls live in the left column at every
  // width, so there is nothing to lift out and nothing to put back.

  /**
   * People arrive with one of two things in mind: a place on the bike they want
   * to fill, or a brand they already like. Offer both as peers rather than
   * forcing everyone through the mount grid first.
   */
  let browseMode = 'type';
  function modeSwitch(active) {
    const seg = el('div', 'seg');
    for (const [key, label] of [['type', 'By bag type'], ['brand', 'By brand']]) {
      const b = elt('button', 'seg-btn' + (key === active ? ' on' : ''), label);
      b.onclick = () => {
        if (key === active) return;
        browseMode = key;
        key === 'type' ? openMountPicker() : openBrandIndex();
      };
      seg.append(b);
    }
    return seg;
  }

  /** Brand-first entry: every brand, with what they make. */
  function openBrandIndex() {
    browseMode = 'brand';
    const pk = openOverlay('brand-index');
    pk.append(pickerHead({
      title: 'Browse by brand',
      sub: `${app.catalog.length} makers · ${app.catalog.reduce((n, b) => n + b.products.length, 0)} bags`,
      extra: modeSwitch('brand'),
    }));
    const list = el('div', 'brand-list');
    for (const brand of [...app.catalog].sort((a, b) => a.name.localeCompare(b.name))) {
      const row = el('button', 'brand-row');
      row.append(elt('span', 'br-name', brand.short));
      const pal = el('span', 'br-palette');
      for (const col of paletteFor(brand, brand.products.map((product) => ({ product })))) {
        const sw = el('span', 'br-sw');
        sw.style.background = col;
        pal.append(sw);
      }
      row.append(pal);
      row.append(elt('span', 'br-count', `${brand.products.length} bag${brand.products.length === 1 ? '' : 's'}`));
      row.append(elt('span', 'br-go', '›'));
      row.onclick = () => openBrandCatalog(brand);
      list.append(row);
    }
    pk.append(list);
  }

  /** Everything one brand makes, grouped by where it mounts. */
  function openBrandCatalog(brand) {
    const pk = openOverlay('model-picker');
    pk.append(pickerHead({
      title: brand.short,
      sub: `${brand.products.length} bags across ${new Set(brand.products.map((p) => p.slot)).size} mounts`,
      crumbs: [{ label: 'Brands', onClick: openBrandIndex }],
      onBack: openBrandIndex,
    }));
    // a product knows its own slot, so choosing one implies the mount
    const bySlot = new Map();
    for (const product of brand.products) {
      const uiSlot = uiSlotForProduct(product);
      if (!uiSlot) continue;
      if (!bySlot.has(uiSlot)) bySlot.set(uiSlot, []);
      bySlot.get(uiSlot).push({ brand, product });
    }
    const body = el('div', 'lines');
    for (const [uiSlot, items] of [...bySlot].sort((a, b) => (SLOTS[a[0]]?.label || '').localeCompare(SLOTS[b[0]]?.label || ''))) {
      const sec = el('section', 'pline');
      sec.append(elt('h3', 'pline-title', SLOTS[uiSlot]?.label || uiSlot));
      sec.append(modelCards(items, uiSlot, brand));
      body.append(sec);
    }
    pk.append(body);
  }

  /** Map a catalogue product to the UI slot it should occupy. */
  function uiSlotForProduct(product) {
    if (product.slot === 'pannier') return 'pannierR';
    if (product.slot === 'stembag') return 'stemR';
    if (product.slot === 'forkbag') return 'forkR';
    if (SLOTS[product.slot]) return product.slot;
    return Object.keys(SLOTS).find((k) => (SLOTS[k].products || k) === product.slot) || null;
  }

  /** Step 1 — which mount point? Grouped by zone, empties allowed here only. */
  function openMountPicker() {
    browseMode = 'type';
    const pk = openOverlay('mount-picker');
    pk.append(pickerHead({
      title: 'Choose a mount',
      sub: '',
      extra: modeSwitch('type'),
    }));
    const body = el('div', 'zones');
    for (const zone of ZONES) {
      const sec = el('section', 'zone');
      sec.append(elt('h3', 'zone-title', zone.label));
      const grid = el('div', 'zone-grid');
      for (const key of zone.slots) {
        const def = SLOTS[key];
        if (!def) continue;
        const cur = app.bags.equipped[key];
        const options = productsForSlot(app.catalog, productSlotFor(key));
        const b = el('button', 'mount-btn' + (cur ? ' occupied' : ''));
        b.append(elt('span', 'mb-name', def.label));
        const sub = cur
          ? `${cur.brand.short} · ${modelTitle(cur.product, cur.brand)}`
          : options.length
            ? `${options.length} option${options.length === 1 ? '' : 's'}`
            : 'No products';
        b.append(elt('span', 'mb-sub', sub));
        if (!options.length) b.disabled = true;
        else b.onclick = () => catalogue.open(key, { onBack: openMountPicker });
        grid.append(b);
      }
      sec.append(grid);
      body.append(sec);
    }
    pk.append(body);
  }

  /** Brands making bags for a slot, each with its matching products. */
  function brandsForSlot(uiSlot) {
    const byBrand = new Map();
    for (const entry of productsForSlot(app.catalog, productSlotFor(uiSlot))) {
      if (!byBrand.has(entry.brand)) byBrand.set(entry.brand, []);
      byBrand.get(entry.brand).push(entry);
    }
    return [...byBrand]
      .map(([brand, items]) => ({ brand, items }))
      .sort((a, b) => a.brand.name.localeCompare(b.brand.name));
  }

  /** [line, [{title, variants}]] — variants are size options of one model. */
  function groupByLine(items) {
    const lines = new Map();
    for (const entry of items) {
      const line = lineOf(entry.product);
      if (!lines.has(line)) lines.set(line, new Map());
      const models = lines.get(line);
      // products sharing a line and a model name are sizes of the same bag
      const key = stripLine(displayName(entry.product, entry.brand), line).toLowerCase();
      if (!models.has(key)) {
        models.set(key, { title: stripLine(displayName(entry.product, entry.brand), line), variants: [] });
      }
      models.get(key).variants.push(entry);
    }
    for (const models of lines.values()) {
      for (const m of models.values()) {
        m.variants.sort((a, b) => (Number(a.product.liters) || 0) - (Number(b.product.liters) || 0));
      }
    }
    return [...lines]
      .map(([line, models]) => [line, [...models.values()].sort((a, b) => a.title.localeCompare(b.title))])
      .sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[0].localeCompare(b[0]));
  }

  function paletteFor(brand, items) {
    const cols = brand.palette?.length
      ? brand.palette
      : items.flatMap((i) => i.product.colors || []);
    return [...new Set(cols)].slice(0, 4);
  }

  /**
   * One card for one product, for the faceted catalogue (§9). The brand-tree
   * cards group a model's sizes together, which only makes sense inside a brand
   * page; here every row is a product, because the facets — not the tree — are
   * what narrowed the list.
   */
  function catCard(entry, uiSlot, unfit) {
    const cur = app.bags.equipped[uiSlot];
    const { brand, product } = entry;
    const c = el('div', 'card' + (cur?.product === product ? ' on' : '') + (unfit ? ' is-unfit' : ''));
    const shot = product.images?.[0];
    if (shot) {
      const wrap = el('div', 'card-thumb');
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = shot;
      img.onerror = () => wrap.remove();
      wrap.append(img);
      c.append(wrap);
    }
    c.append(elt('div', 'brand', brand.short || brand.name));
    c.append(elt('div', 'name', modelTitle(product, brand)));
    const meta = el('div', 'meta');
    meta.append(elt('span', 'liters', litersOf(product)));
    const cols = (product.features?.colorways || []).length || (product.colors || []).length;
    if (cols > 1) {
      const chips = el('div', 'chips');
      for (const col of (product.colors || []).slice(0, 4)) {
        const chip = el('span', 'chip');
        chip.style.background = col;
        chips.append(chip);
      }
      meta.append(chips);
    }
    c.append(meta);
    if (unfit) c.append(elt('div', 'card-unfit', unfit));
    c.onclick = () => {
      app.bags.equip(uiSlot, brand, product);
      closeOverlay();
      sync();
    };
    return c;
  }

  /**
   * Why this product will not go on this bike, or null. Only the honest cases:
   * a pocket with nothing to clip to, and a bag longer than the slot's room.
   * Anything less certain than that belongs on the card as data, not as a
   * filter that quietly removes a bag somebody was looking for.
   */
  function fitReason(uiSlot, entry) {
    const def = SLOTS[uiSlot];
    if (def?.mountsTo && !def.mountsTo.some((s) => app.bags.equipped[s])) {
      return `Needs a ${def.mountsTo.map((s) => (SLOTS[s]?.label || s).toLowerCase()).join(' or ')} first`;
    }
    return null;
  }

  const catalogue = initCatalogue(app, {
    openSheet: (opts) => app.openSheet?.(opts),
    cardFor: catCard,
    fitReason,
  });

  /** Step 2 — which brand? */
  function openBrandPicker(uiSlot) {
    const def = SLOTS[uiSlot];
    const cur = app.bags.equipped[uiSlot];
    const brands = brandsForSlot(uiSlot);

    const pk = openOverlay('brand-picker');
    pk.append(pickerHead({
      title: def.label,
      sub: `${brands.length} brand${brands.length === 1 ? '' : 's'} make this`,
      crumbs: [{ label: 'Mounts', onClick: openMountPicker }],
      onBack: openMountPicker,
      extra: removeAction(uiSlot),
    }));

    const list = el('div', 'brand-list');
    for (const { brand, items } of brands) {
      const fitted = cur && cur.brand === brand;
      const row = el('button', 'brand-row' + (fitted ? ' on' : ''));
      row.append(elt('span', 'br-name', brand.short));
      const pal = el('span', 'br-palette');
      for (const col of paletteFor(brand, items)) {
        const sw = el('span', 'br-sw');
        sw.style.background = col;
        pal.append(sw);
      }
      row.append(pal);
      row.append(elt('span', 'br-count', `${items.length} bag${items.length === 1 ? '' : 's'}`));
      if (fitted) row.append(elt('span', 'br-fitted', 'Fitted'));
      row.append(elt('span', 'br-go', '›'));
      row.onclick = () => openBrandDetail(uiSlot, brand);
      list.append(row);
    }
    pk.append(list);
  }

  /** Step 3 — which model and size within one brand? */
  function openBrandDetail(uiSlot, brand) {
    const def = SLOTS[uiSlot];
    const cur = app.bags.equipped[uiSlot];
    const items = brandsForSlot(uiSlot).find((b) => b.brand === brand)?.items || [];
    const groups = groupByLine(items);
    const named = groups.some(([line]) => line);

    const pk = openOverlay('model-picker');
    pk.append(pickerHead({
      title: brand.short,
      sub: `${items.length} bag${items.length === 1 ? '' : 's'} for the ${def.label.toLowerCase()}`,
      crumbs: [
        { label: 'Mounts', onClick: openMountPicker },
        { label: def.label, onClick: () => openBrandPicker(uiSlot) },
      ],
      onBack: () => openBrandPicker(uiSlot),
      extra: removeAction(uiSlot),
    }));

    const body = el('div', 'lines');
    for (const [line, models] of groups) {
      const sec = el('section', 'pline');
      // an unnamed group only needs a header when named lines sit beside it
      if (line) sec.append(elt('h3', 'pline-title', line));
      else if (named) sec.append(elt('h3', 'pline-title', 'Other'));
      sec.append(modelCards(items.filter((i) => lineOf(i.product) === line), uiSlot, brand, models));
      body.append(sec);
    }
    pk.append(body);
  }

  /**
   * The product grid, shared by the mount-first and brand-first flows.
   * `models` may be pre-grouped; otherwise it is derived from `items`.
   */
  function modelCards(items, uiSlot, brand, models = null) {
    const cur = app.bags.equipped[uiSlot];
    const equip = (entry) => {
      app.bags.equip(uiSlot, entry.brand, entry.product);
      closeOverlay();
      sync();
    };
    const cards = el('div', 'cards');
    for (const [, group] of (models ? [[null, models]] : groupByLine(items))) {
      for (const model of group) {
        const multi = model.variants.length > 1;
        const fitted = cur && model.variants.some((v) => v.product === cur.product);
        const c = el('div', 'card' + (fitted ? ' on' : '') + (multi ? ' has-sizes' : ''));
        // A photo of the real bag identifies it far faster than the name does,
        // when 589 products share one silhouette language. Hot-linked from the
        // maker's own CDN — nothing is copied into this repo.
        const shot = model.variants.map((v) => v.product.images?.[0]).find(Boolean);
        if (shot) {
          const wrap = el('div', 'card-thumb');
          const img = document.createElement('img');
          img.loading = 'lazy';
          img.alt = `${brand.short} ${model.title}`;
          img.referrerPolicy = 'no-referrer';
          img.src = shot;
          img.onerror = () => wrap.remove();   // a dead CDN link shouldn't leave a hole
          wrap.append(img);
          c.append(wrap);
        }
        c.append(elt('div', 'name', model.title));

        const meta = el('div', 'meta');
        if (!multi) meta.append(elt('span', 'liters', litersOf(model.variants[0].product)));
        const cols = [...new Set(model.variants.flatMap((v) => v.product.colors || []))];
        const chips = el('div', 'chips');
        for (const col of cols.slice(0, 5)) {
          const chip = el('span', 'chip');
          chip.style.background = col;
          chips.append(chip);
        }
        meta.append(chips);
        if (model.variants.some((v) => v.product.est)) meta.append(elt('span', 'est', 'est. dims'));
        if (fitted) meta.append(elt('span', 'fitted', 'Fitted'));

        // sizes of one model share a product page, so the card carries one link
        const linked = model.variants.find((v) => cur && v.product === cur.product && srcOf(v.product))
          || model.variants.find((v) => srcOf(v.product));
        const buy = linked ? buyLink(linked.product, brand, 'Buy ↗', 'buy-link') : null;
        if (!multi && buy) meta.append(buy);
        c.append(meta);

        if (multi) {
          const sizes = el('div', 'sizes');
          for (const v of model.variants) {
            const chip = elt('button', 'size-chip' + (cur && cur.product === v.product ? ' on' : ''), sizeOf(v.product));
            chip.title = `${model.title} · ${sizeOf(v.product)}`;
            chip.onclick = (e) => { e.stopPropagation(); equip(v); };
            sizes.append(chip);
          }
          if (buy) sizes.append(buy);
          c.append(sizes);
        } else {
          c.onclick = () => equip(model.variants[0]);
        }
        cards.append(c);
      }
    }
    return cards;
  }

  // ---- kit summary --------------------------------------------------------
  /**
   * The shareable link. Was `slot:brandIndex:productIndex` — array POSITIONS in
   * brands.json, which silently repoint at different bags the first time a
   * product is inserted or the catalogue is re-sorted. `rigURL` names the maker
   * and model instead, so a link keeps meaning the same bike. See src/rig.js.
   */
  function kitURL() {
    return rigURL(app);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // clipboard API needs a secure context — fall back to a hidden textarea
      try {
        const ta = el('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  let shareTimer = null;
  async function shareKit(btn, label) {
    const ok = await copyText(kitURL());
    label.textContent = ok ? 'Copied!' : 'Copy failed';
    btn.classList.toggle('done', ok);
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => {
      label.textContent = 'Share kit';
      btn.classList.remove('done');
    }, 1800);
  }

  // ---- render -------------------------------------------------------------
  function updateFade() {
    const more = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight > 4;
    listEl.classList.toggle('fade-bottom', more);
  }

  /**
   * A bag the resolver could not place. Drawing it would show it intersecting
   * the frame; dropping it silently is how a chosen product just never appears.
   * Say so, and offer the two things that actually help: swap or remove.
   */
  function renderUnfitted(key, rec) {
    const card = el('div', 'bag-card unfit');
    card.dataset.slot = key;
    const sw = el('span', 'bag-sw');
    sw.style.background = swatchStyle(rec.product, rec.brand);
    const txt = el('div', 'bag-txt');
    const line = el('div', 'bag-meta');
    line.append(
      elt('span', 'b', rec.brand.short), elt('span', 'sep', '·'),
      elt('span', 'm', SLOTS[key].label),
    );
    const nameRow = el('div', 'bag-name-row');
    nameRow.append(elt('div', 'bag-model', modelTitle(rec.product, rec.brand)));
    txt.append(line, nameRow, elt('div', 'unfit-msg', 'Doesn’t fit this frame — try another size'));
    // An unfitted bag has no `equipped` record, so it has no bag sheet to open —
    // the row goes straight to the catalogue for its slot, which is the "try
    // another size" the message is asking for. Removing it is the other useful
    // action, so it gets a real 44px button rather than a 22px hover-reveal.
    const rm = elt('button', 'unfit-rm', 'Remove');
    rm.onclick = (e) => {
      e.stopPropagation();
      const { brand, product } = rec;
      app.bags.remove(key);
      sync();
      notify(`Removed ${modelTitle(product, brand)}`, () => {
        app.bags.equip(key, brand, product, rec.colorwayIndex || 0);
        sync();
      });
    };
    card.append(sw, txt, rm);
    card.onclick = () => catalogue.open(key);
    return card;
  }

  function renderList() {
    listEl.innerHTML = '';
    const unfit = Object.keys(app.bags.unfitted || {});
    const keys = Object.keys(SLOTS).filter((k) => app.bags.equipped[k]);
    if (!keys.length && !unfit.length) {
      // The first screen after "Build a rig". It used to be four words; the
      // column is a fixed height now and those four words sat alone in it.
      const empty = el('div', 'empty-state');
      empty.append(elt('p', 'es-lead', 'Nothing on the bike yet.'));
      empty.append(elt('p', 'es-sub',
        `${Object.keys(SLOTS).length} mounting points, `
        + `${app.catalog.reduce((n, b) => n + b.products.length, 0)} bags to put on them. `
        + 'A seat pack is the usual place to start.'));
      listEl.append(empty);
      return 0;
    }
    for (const key of keys) {
      const cur = app.bags.equipped[key];
      const card = el('div', 'bag-card');
      card.dataset.slot = key;
      card.title = 'Change this bag';

      // a photo of the actual bag beats a colour swatch for recognition
      const sw = el('span', 'bag-sw');
      const shot = cur.product?.images?.[0];
      if (shot) {
        sw.classList.add('photo');
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.src = shot;
        img.onerror = () => { sw.classList.remove('photo'); img.remove(); sw.style.background = swatchStyle(cur.product, cur.brand); };
        sw.append(img);
      } else {
        sw.style.background = swatchStyle(cur.product, cur.brand);
      }

      const txt = el('div', 'bag-txt');
      const line = el('div', 'bag-meta');
      line.append(
        elt('span', 'b', cur.brand.short),
        elt('span', 'sep', '·'),
        elt('span', 'm', SLOTS[key].label),
      );
      // volume shares the product name's baseline
      const nameRow = el('div', 'bag-name-row');
      const modelEl = elt('div', 'bag-model', modelTitle(cur.product, cur.brand));
      // the size only earns its place when it isn't just the volume again
      const size = sizeOf(cur.product);
      if (size && !sizeIsVolume(cur.product) && !sizeEchoesName(cur.product, cur.brand)) {
        modelEl.append(elt('span', 'bag-size', ` · ${size}`));
      }
      nameRow.append(modelEl, elt('div', 'bag-liters', litersOf(cur.product)));
      txt.append(line, nameRow);

      // §14.9: `.bag-act` was three 22x22 buttons at `opacity: 0` until hover —
      // half the hit-target floor, invisible on touch, and undiscoverable
      // anywhere. Deleted; the sheet carries replace, remove and buy at 48h.
      card.append(sw, txt);
      // the link runs both ways: hovering a card lifts the bag in the scene
      card.onmouseenter = () => app.focus?.setHovered?.(key);
      card.onmouseleave = () => app.focus?.setHovered?.(null);
      // §4: the whole row is one hit target, and it opens the bag sheet.
      // Replace, remove and buy live in there now, not as 22px hover buttons.
      card.onclick = () => { setSelected(key); app.focus?.setSelected?.(key); };

      // The in-card colourway strip is gone: the bag sheet owns colour now
      // (§5.2), with the swatch name spelled out beside it. Two pickers for one
      // property, one of them unlabelled, is how you get the row of anonymous
      // white dots this used to render.
      listEl.append(card);
    }
    for (const key of unfit) listEl.append(renderUnfitted(key, app.bags.unfitted[key]));
    return keys.length;
  }

  // ---- selection, shared with the 3D scene --------------------------------
  // The canvas owns the interaction; the panel mirrors it. State is kept here
  // (not on the DOM) because renderList() rebuilds the cards on every change.
  let selectedSlot = null;
  let hoveredSlot = null;

  function paintSelection() {
    for (const card of listEl.querySelectorAll('.bag-card')) {
      const s = card.dataset.slot;
      card.classList.toggle('sel', s === selectedSlot);
      card.classList.toggle('hov', s === hoveredSlot && s !== selectedSlot);
    }
  }

  function setSelected(slot) {
    selectedSlot = slot || null;
    paintSelection();
    // REDESIGN.md §5: this used to ring the bag, zoom to it and stop there.
    // A selection that leads nowhere is the dead end phase 2 exists to close.
    if (slot && app.bags.equipped[slot]) bagSheet.open(slot);
    // bring it into view when the list is long enough to scroll
    if (selectedSlot) {
      // picking a bag off the bike while the sheet is peeking should show it
      if (collapsed) setSheetCollapsed(false);
      listEl.querySelector(`.bag-card[data-slot="${CSS.escape(selectedSlot)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function setHovered(slot) {
    hoveredSlot = slot || null;
    paintSelection();
  }

  function sync() {
    const n = renderList();
    paintSelection();
    countEl.textContent = String(n);
    // Nothing to clear on an empty bike, and a destructive control offered
    // against nothing is just one more thing in the column.
    btnClear.hidden = n === 0;
    if (n === 0) resetClear();
    const liters = Object.values(app.bags.equipped)
      .reduce((sum, e) => sum + (Number(e.product?.liters) || 0), 0);
    totalEl.textContent = `${liters.toFixed(1)} L`;
    peekTotal.textContent = n > 0 ? totalEl.textContent : '';
    foot.classList.toggle('has-kit', n > 0);
    updateFade();
    paints.querySelectorAll('.paint').forEach((c) => c.classList.toggle('on', c.dataset.paint === app.state.paint));
    rotBtn.classList.toggle('on', !!app.controls?.autoRotate);
    // Every change to the bike runs through here, which is exactly when the
    // save CTA needs to reconsider whether there is anything unsaved.
    paintSave();
  }

  sync();
  // setSheetCollapsed is the hook for "only one sheet open at a time": the
  // wind tunnel calls it rather than reaching into this panel itself.
  return { sync, setSelected, setHovered, paintSelection, setSheetCollapsed, closeOverlay };
}
