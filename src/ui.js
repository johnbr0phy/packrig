import { SLOTS, productSlotFor, colorwayFor } from './bags.js';
import { initAccount } from './ui/account.js';
import { applyRig, captureRig, rigURL } from './rig.js';
import { productsForSlot } from './catalog.js';
import { PAINTS, FRAME_SIZES } from './bike.js';
import { judgeFit, willFit } from './bags/fit.js';
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
import { randomRigName } from './ui/v2/rignames.js';

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
const SHORT = mql('(max-height: 520px)');
const TOUCH = mql('(pointer: coarse)');

export function initUI(app) {
  const root = document.getElementById('ui-root');
  root.innerHTML = '';

  /*
   * The app's own readability ramp, painted before anything else and never
   * removed. The menu used to own the gradient — so leaving the menu deleted
   * the composition and replaced it with a filled column and a filled bar.
   * It belongs to the shell; see the `.app-veil` block in ui/v2/builder.css.
   */
  root.append(el('div', 'app-veil'));

  /*
   * The account, and only the account.
   *
   * `rigsui.js` used to live here: one sheet holding the sign-in form, the
   * saved rigs, the gallery and the publish flow, opened by pressing your own
   * email address in the top bar. Saved rigs are not an account feature — they
   * are the work — so they moved to the menu's `rigs` view, the gallery was
   * already there, and what is left is what an account actually is.
   */
  // Account is created NOW, not after a microtask: the homepage Log in button
  // used to fire `app.account?.open()` while account was still null, which
  // swallowed the click. The dialogue must exist before the menu does.
  const account = initAccount(app, {
    auth: app.auth, store: app.rigs, host: root, onChange: () => sync(),
  });
  app.account = account;
  app.openRigs = (m) => (m === 'list' ? app.menu?.open('rigs') : account.open('signin'));
  app.__rigURL = () => kitURL();

  // remember the opening camera framing so "reset view" has somewhere to go
  const homeView = {
    pos: app.camera?.position?.clone?.() || null,
    target: app.controls?.target?.clone?.() || null,
  };

  // The two levels above the builder. Created after a microtask for the same
  // reason `rigsUI` is: they read `app.rigs`, which main.js attaches around us.
  queueMicrotask(() => {
    /*
     * The menu — start screen, saved rigs and loadouts — is one module now rather
     * than the two unrelated surfaces (`ui/home.js`, `ui/gallery.js`) it
     * replaces. See src/ui/v2/menu.js for why they had to become one thing.
     */
    app.menu = initMenu(app, {
      onBuild: ({ adopted, build, surprise, setup } = {}) => {
        fromSurprise = !!surprise;
        surpriseSnap = null;
        const applySetup = (s) => {
          if (!s) return;
          if (s.size) app.setSize?.(s.size);
          if (s.paint) app.setPaint?.(s.paint);
          if (s.bidon != null) {
            app.bike?.setBottleColor?.('st', s.bidon);
            app.bike?.setBottleColor?.('dt', s.bidon);
          }
        };
        if (surprise) {
          app.randomize();
          savedSnapshot = null;
          rigNav.current = { id: null, name: randomRigName(), local: true };
          rigNav.enter(rigNav.current);
          surpriseSnap = snapshot();
        } else if (build && !adopted) {
          app.clearAll?.();
          savedSnapshot = null;
          applySetup(setup);
          rigNav.current = { id: null, name: setup?.name || randomRigName(), local: true };
          rigNav.enter(rigNav.current);
        } else if (adopted) {
          const own = adopted.own ? adopted.row : null;
          savedSnapshot = own ? snapshot() : null;
          applySetup(setup);
          rigNav.current = {
            id: own?.id ?? null,
            name: setup?.name || adopted.name || randomRigName(),
            local: own ? !!own.local : true,
          };
          rigNav.enter(rigNav.current);
        }
        sync();
      },
    });
    /*
     * `app.home` survives as an adapter. Four headless tools drive the root
     * menu by that name (tools/scratch/_menutest.mjs, _ttsweep.mjs, _contrast.mjs,
     * bag-portraits.mjs); renaming the module should not silently turn every
     * screenshot harness into a no-op. `app.gallery` went with the gallery.
     */
    app.home = {
      open: () => app.menu?.open('start'),
      close: () => app.menu?.close(),
      get isOpen() { return app.menu?.isOpen && app.menu?.view === 'start'; },
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

  // ---- build actions: add, try another, clear -----------------------------
  // Surprise me lives on the homepage now. In here it is only "Try another",
  // and only on an unsaved surprise kit — never on a bike you already saved.
  const tryBtn = el('button', 'btn quiet');
  const tryLabel = elt('span', null, 'Try another');
  tryBtn.append(icon('bolt', { size: 16, cls: 'bolt' }), tryLabel);
  tryBtn.title = 'Another random kit';
  tryBtn.hidden = true;
  let tryTimer = null;
  const resetTry = () => {
    clearTimeout(tryTimer);
    tryBtn.classList.remove('confirm');
    paintTry();
  };
  tryBtn.onclick = () => {
    if (!fromSurprise || rigNav.current?.id) return;
    const dirty = surpriseSnap && surpriseSnap !== snapshot();
    if (dirty && !tryBtn.classList.contains('confirm')) {
      tryBtn.classList.add('confirm');
      tryLabel.textContent = 'Replace everything?';
      tryTimer = setTimeout(resetTry, 3000);
      return;
    }
    app.randomize();
    const keep = rigNav.current || { id: null, local: true };
    rigNav.current = { ...keep, name: randomRigName() };
    surpriseSnap = snapshot();
    resetTry();
    sync();
  };
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

  const sizeGroup = el('div', 'paint-group size-group');
  sizeGroup.append(elt('span', 'group-label', 'Size'));
  const sizes = el('div', 'size-picks');
  for (const spec of Object.values(FRAME_SIZES)) {
    const b = el('button', 'size-pick');
    b.type = 'button';
    b.dataset.size = spec.id;
    b.textContent = spec.id;
    b.title = `${spec.label} · ${spec.rider}`;
    b.setAttribute('aria-label', `Frame size ${spec.label}, ${spec.rider}`);
    b.onclick = () => app.setSize?.(spec.id);
    sizes.append(b);
  }
  sizeGroup.append(sizes);

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
    sw.dataset.hex = String(parseInt(hex.slice(1), 16));
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
   * Bike settings live in a closed drawer. Name and colours were asked up
   * front; the column you work in is the bags. Open this when you want to
   * change the frame or the bottles.
   */
  const bikeSec = el('section', 'nav-sec bike-sec');
  const bikeToggle = el('button', 'bike-toggle');
  bikeToggle.type = 'button';
  const bikeToggleK = elt('span', 'bike-toggle-k', 'Bike');
  const bikeSum = elt('span', 'bike-sum', '');
  bikeToggle.append(bikeToggleK, bikeSum);
  bikeToggle.setAttribute('aria-expanded', 'false');
  const appearance = el('div', 'appearance');
  appearance.hidden = true;
  appearance.append(sizeGroup, paintGroup, bidonGroup);
  bikeToggle.onclick = () => {
    const open = appearance.hidden;
    appearance.hidden = !open;
    bikeSec.classList.toggle('is-open', open);
    bikeToggle.setAttribute('aria-expanded', String(open));
  };
  bikeSec.append(bikeToggle, appearance);

  function paintBikeSum() {
    const sz = FRAME_SIZES[app.bike?.size || app.state?.size]?.label || 'Medium';
    const paint = PAINT_LABEL[app.state?.paint] || app.state?.paint || 'Frame';
    const n = app.bike?.bottleColor?.('st');
    const bottle = BIDON_COLORS.find(([h]) => parseInt(h.slice(1), 16) === n)?.[1] || 'Bidons';
    bikeSum.textContent = `${sz} · ${paint} · ${bottle}`;
  }


  /*
   * The "Bags" section, and the column assembled.
   *
   * Reading order is the order you build in: see what is on it, add to it.
   * `Try another` only appears after Surprise me, and it is not Add a bag's peer.
   */
  const bagsSec = el('section', 'nav-sec bags-sec');
  const bagsHead = el('div', 'nav-sec-head');
  bagsHead.append(elt('h2', 'nav-sec-title', 'Bags on the rig'), countEl, btnClear);
  bagsSec.append(bagsHead, listEl);
  const bagActions = el('div', 'nav-actions');
  bagActions.append(addBtn, tryBtn);
  bagsSec.append(bagActions);

  /*
   * Two levels in one column. `rigNav` owns the top one — the list of saved
   * rigs — and the three sections below it are the second: the rig you have
   * open. `data-level` on the panel decides which is showing, so switching is a
   * class change rather than a rebuild, and the bike underneath never blinks.
   */
  const rigNav = initRigNav(app, {
    onRename: (id, name) => {
      if (id) app.rigs?.rename?.(id, name).catch(() => {});
      paintSave();
    },
    onLevel: (lvl) => { panel.setAttribute('data-level', lvl); paintSave(); },
  });
  panel.setAttribute('data-level', 'rig');

  // Bags first, bike second. The rig is what you came to build; frame colour is
  // a detail, and it was sitting above the content with equal billing — on a
  // phone it was the entire first screen of the panel.
  panel.append(head, rigNav.el, bikeSec, bagsSec, foot);
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
  tunnelBtn.onclick = () => { app.openWindTunnel?.(); };
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
   * Save rig — next to the name, not floating in a corner.
   *
   * It appears the moment there is something worth saving and disappears when
   * there is not. Saving does not ask for an account first: the store has a
   * full local branch and `migrateLocal()` pushes local rigs up on the first
   * sign-in, so a signed-out save is a real save.
   */
  let savedSnapshot = null;
  let fromSurprise = false;
  let surpriseSnap = null;
  const snapshot = () => {
    try { return JSON.stringify(captureRig(app, { name: '' })); } catch { return null; }
  };
  const saveBtn = el('button', 'save-btn');
  const saveLabel = elt('span', 'save-label', 'Save this rig');
  saveBtn.append(saveLabel);
  rigNav.actions.append(saveBtn);
  function saveCurrent() {
    const cur = rigNav.current;
    const write = cur?.id
      ? app.rigs?.update(cur.id, { name: cur.name })
      : app.rigs?.save(cur?.name || randomRigName());
    return Promise.resolve(write).then((row) => {
      savedSnapshot = snapshot();
      fromSurprise = false;
      surpriseSnap = null;
      rigNav.current = { id: row?.id ?? cur?.id ?? null, name: row?.name || cur?.name || randomRigName(), local: !!row?.local };
      paintSave();
      return row;
    });
  }
  // A save is an account thing. Signed out, Save opens the create-account
  // window; the bike is not written until they are in. A Google redirect
  // wipes the page, so the kit rides in sessionStorage until we come back.
  const PENDING_SAVE = 'packrig.pendingSave';
  const stashPendingSave = (after = 'stay') => {
    try {
      const name = rigNav.current?.name || randomRigName();
      sessionStorage.setItem(PENDING_SAVE, JSON.stringify({
        name, after, rig: captureRig(app, { name }),
      }));
    } catch { /* private mode */ }
  };
  const clearPendingSave = () => {
    try { sessionStorage.removeItem(PENDING_SAVE); } catch { /* */ }
  };
  const consumePendingSave = () => {
    if (!app.auth?.signedIn) { clearPendingSave(); return Promise.resolve(); }
    let raw = null;
    try { raw = sessionStorage.getItem(PENDING_SAVE); } catch { /* */ }
    if (!raw) return Promise.resolve();
    clearPendingSave();
    let pending;
    try { pending = JSON.parse(raw); } catch { return Promise.resolve(); }
    if (!pending?.rig) return Promise.resolve();
    return Promise.resolve(app.rigs?.saveRig(pending.name || randomRigName(), pending.rig))
      .then((row) => {
        notify(`Saved “${row?.name || pending.name}”. It’s in My rigs.`);
      })
      .catch((e) => notify(e?.message || 'Could not save that rig'));
  };
  const requireAccount = (reason) => {
    if (app.auth?.signedIn) return Promise.resolve(true);
    if (!app.auth?.enabled) {
      notify('You need an account to save, and accounts are not available right now.');
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      account.open('signup', {
        reason: reason || 'You need an account to save a rig.',
        onReady: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };
  if (app.auth?.enabled) {
    Promise.resolve(app.auth.hydrate?.()).then(() => consumePendingSave());
  }
  saveBtn.onclick = () => {
    if (saveBtn.classList.contains('is-done')) return;
    stashPendingSave('stay');
    requireAccount()
      .then((ok) => {
        if (!ok) { clearPendingSave(); return null; }
        return saveCurrent();
      })
      .then((row) => {
        if (!row) return;
        clearPendingSave();
        notify(`Saved “${rigNav.current.name}”`,
          null, { label: 'Rename', run: () => document.querySelector('.rn-title')?.click() });
      })
      .catch((e) => notify(e?.message || 'Could not save that rig'));
  };
  function paintTry() {
    const bags = Object.keys(app.bags?.equipped || {}).length;
    const show = fromSurprise && !rigNav.current?.id && bags > 0;
    tryBtn.hidden = !show;
    if (!show) {
      tryBtn.classList.remove('confirm');
      return;
    }
    if (tryBtn.classList.contains('confirm')) return;
    const dirty = !!(surpriseSnap && surpriseSnap !== snapshot());
    tryLabel.textContent = dirty ? 'Replace all bags' : 'Try another';
    tryBtn.title = dirty
      ? 'This replaces every bag on the bike'
      : 'Another random kit';
  }
  function paintSave() {
    const bags = Object.keys(app.bags?.equipped || {}).length;
    const dirty = !savedSnapshot || savedSnapshot !== snapshot();
    saveBtn.hidden = bags === 0;
    saveBtn.classList.toggle('is-done', !dirty);
    saveLabel.textContent = dirty
      ? ((PHONE.matches || SHORT.matches) ? 'Save' : (rigNav?.current?.id ? 'Save changes' : 'Save this rig'))
      : 'Saved';
    saveBtn.title = dirty
      ? (app.auth?.signedIn ? 'Keep this build' : 'Create an account to save this rig')
      : 'Saved';
    paintTry();
  }

  const acctBtn = el('button', 'acct-btn');
  const acctLabel = elt('span', 'acct-label', 'Log in');
  acctBtn.append(el('span', 'acct-dot'), acctLabel);
  // Signing in changes where rigs are STORED, not where they are found — they
  // are the top of the left column now. So this opens the account, nothing else.
  /*
   * It opens the ACCOUNT. It used to open a panel of saved rigs, so the way to
   * last week's bike was to press your own email address — filing the work
   * under the filing cabinet. The rigs are in the menu, where the front page
   * links to them by name.
   */
  acctBtn.onclick = () => account?.open();
  function paintAccount() {
    const on = !!app.auth?.signedIn;
    acctBtn.classList.toggle('is-in', on);
    acctLabel.textContent = on ? (app.auth.email || 'Account') : 'Log in';
    acctBtn.title = on ? 'Your account' : 'Log in so your rigs follow you between devices';
    acctBtn.hidden = false;
  }
  paintAccount();
  app.auth?.onChange?.(paintAccount);
  topRight.append(acctBtn);

  /*
   * There is no `Menu` button. It sat 12px from the wordmark and did exactly
   * what the wordmark does — two controls, one destination, adjacent. The
   * wordmark is the one everybody presses first, so it is the one that stays.
   */

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
  const goHome = (opts = {}) => app.menu?.open('start', opts);
  const leaveTunnel = () => { try { app.aero?.exit?.(); } catch { /* not open */ } };
  const unsavedKit = () => {
    const bags = Object.keys(app.bags?.equipped || {}).length;
    if (!bags) return false;
    if (!rigNav.current?.id) return true;
    return !savedSnapshot || savedSnapshot !== snapshot();
  };
  const discardKit = () => {
    app.clearAll?.();
    fromSurprise = false;
    surpriseSnap = null;
    savedSnapshot = null;
    rigNav.current = { id: null, name: '', local: true };
    rigNav.enter(rigNav.current);
    sync();
  };
  function askLeaveSave(name, { onSave, onLeave }) {
    const scrim = el('div', 'ac-scrim');
    const card = el('div', 'ac-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Save this rig?');
    card.append(elt('h2', 'ac-title', `Save “${name}”?`));
    card.append(elt('p', 'ac-note',
      app.auth?.signedIn
        ? 'Home is always the empty bike. Save keeps a copy in My rigs.'
        : 'Save needs an account. Home is always the empty bike.'));
    const row = el('div', 'ac-leave-row');
    const lose = el('button', 'ac-btn');
    lose.type = 'button';
    lose.textContent = 'Don’t save';
    const keep = el('button', 'ac-btn is-primary');
    keep.type = 'button';
    keep.textContent = 'Save';
    row.append(lose, keep);
    card.append(row);
    scrim.append(card);
    const dismiss = (fn) => {
      scrim.classList.remove('on');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => scrim.remove(), 200);
      fn?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    };
    lose.onclick = () => dismiss(onLeave);
    keep.onclick = () => dismiss(onSave);
    scrim.onmousedown = (e) => { if (e.target === scrim) dismiss(); };
    document.addEventListener('keydown', onKey, true);
    root.append(scrim);
    void scrim.offsetWidth;
    scrim.classList.add('on');
    keep.focus();
  }
  const leaveHome = () => {
    // The start screen is always the empty bike. Save first if there is
    // something to keep — then strip the bags either way.
    if (app.menu?.isOpen || !unsavedKit()) {
      leaveTunnel();
      discardKit();
      goHome();
      return;
    }
    const name = rigNav.current?.name || 'this rig';
    askLeaveSave(name, {
      onSave: () => {
        stashPendingSave('home');
        requireAccount()
          .then((ok) => {
            if (!ok) { clearPendingSave(); return null; }
            return saveCurrent();
          })
          .then((row) => {
            if (!row) return;
            clearPendingSave();
            leaveTunnel();
            discardKit();
            goHome();
            notify(`Saved “${row?.name || name}”`);
          })
          .catch((e) => notify(e?.message || 'Could not save that rig'));
      },
      onLeave: () => { leaveTunnel(); discardKit(); goHome(); },
    });
  };
  mark.onclick = leaveHome;
  mark.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    leaveHome();
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
        const options = productsForSlot(app.catalog, productSlotFor(key))
          .filter((o) => willFit(key, o.product, app.bike));
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
    const judged = judgeFit(uiSlot, product, app.bike);
    const small = !unfit && judged.status === 'small';
    const c = el('div', 'card'
      + (cur?.product === product ? ' on' : '')
      + (unfit ? ' is-unfit' : '')
      + (small ? ' is-small' : ''));
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
    else if (small) c.append(elt('div', 'card-unfit', judged.reason));
    c.onclick = () => fitAndStay(uiSlot, { brand, product }, c);
    return c;
  }

  /**
   * Fit a bag AND STAY WHERE YOU ARE.
   *
   * Choosing a bag used to close the sheet, so adding four bags meant walking
   * the whole tree four times: Add a bag → the mount list → the 103 half-frame
   * bags → back out to nothing. The owner's note: "load the bag onto the bike
   * but leave the menu as it is so I can go back to the previous page and
   * select my next bag."
   *
   * The list stays open, the bike behind it changes, and the row you pressed
   * takes the fitted mark. It repaints the marks by hand rather than redrawing
   * the grid: a redraw resets the scroller to the top, and losing your place in
   * a list of 103 is a worse tax than the one this is removing.
   */
  function fitAndStay(uiSlot, entry, cardEl) {
    // What was on that mount a moment ago, so Undo puts THAT back rather than
    // leaving the slot empty — swapping a bag and swapping it back are the same
    // gesture here, and the second one has to be exact.
    const prev = app.bags.equipped[uiSlot];
    const before = prev
      ? { brand: prev.brand, product: prev.product, cw: prev.colorwayIndex || 0 }
      : null;
    app.bags.equip(uiSlot, entry.brand, entry.product);
    sync();
    const grid = cardEl?.closest('.cards');
    if (grid) {
      for (const other of grid.querySelectorAll('.card')) other.classList.toggle('on', other === cardEl);
      // Size chips belong to a card, not to the grid: only the pressed card's
      // can be current, and only the one that was pressed.
      for (const chip of grid.querySelectorAll('.size-chip')) chip.classList.remove('on');
    }
    const cur = app.bags.equipped[uiSlot];
    notify(`Fitted ${cur ? modelTitle(cur.product, cur.brand) : entry.product.name}`, () => {
      if (before) app.bags.equip(uiSlot, before.brand, before.product, before.cw);
      else app.bags.remove(uiSlot);
      sync();
      cardEl?.classList.remove('on');
    });
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
    const j = judgeFit(uiSlot, entry.product, app.bike);
    if (j.status === 'big') return j.reason;
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
    const equip = (entry, cardEl) => fitAndStay(uiSlot, entry, cardEl);
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
            chip.onclick = (e) => {
              e.stopPropagation();
              equip(v, c);
              chip.classList.add('on');     // which SIZE is on the bike, not just which bag
            };
            sizes.append(chip);
          }
          if (buy) sizes.append(buy);
          c.append(sizes);
        } else {
          c.onclick = () => equip(model.variants[0], c);
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

  /**
   * Empty bike: the column is the menu. Same shape as the homepage — a short
   * list of places, one tap to the bags that go there. "Add a bag" at the
   * bottom of an empty panel is a button that explains the screen is empty.
   */
  const STARTER = [
    { slot: 'seatpack',      hint: 'Behind the saddle' },
    { slot: 'barroll',       hint: 'On the handlebars' },
    { slot: 'framebag_full', hint: 'In the main triangle' },
    { slot: 'toptube',       hint: 'On the top tube' },
    { slot: 'forkL',         hint: 'On the fork' },
    { slot: 'pannierL',      hint: 'On a rear rack' },
  ];

  function renderStarter() {
    const wrap = el('div', 'starter');
    wrap.append(elt('p', 'starter-lead', 'Where first?'));
    const list = el('div', 'starter-list');
    for (const row of STARTER) {
      const def = SLOTS[row.slot];
      if (!def) continue;
      const n = productsForSlot(app.catalog, productSlotFor(row.slot))
        .filter((o) => willFit(row.slot, o.product, app.bike)).length;
      if (!n) continue;
      const b = el('button', 'starter-row');
      b.type = 'button';
      const body = el('span', 'starter-body');
      body.append(elt('span', 'starter-name', def.label));
      body.append(elt('span', 'starter-hint', `${row.hint} · ${n}`));
      b.append(body);
      b.append(icon('right', { size: 18, cls: 'starter-go' }));
      b.onclick = () => catalogue.open(row.slot);
      list.append(b);
    }
    wrap.append(list);
    const more = el('button', 'starter-more');
    more.type = 'button';
    more.append(elt('span', null, 'Every mount point'));
    more.onclick = () => openMountPicker();
    wrap.append(more);
    return wrap;
  }

  function renderList() {
    listEl.innerHTML = '';
    const unfit = Object.keys(app.bags.unfitted || {});
    const keys = Object.keys(SLOTS).filter((k) => app.bags.equipped[k]);
    if (!keys.length && !unfit.length) {
      listEl.append(renderStarter());
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
    bagsHead.hidden = n === 0;
    bagActions.hidden = n === 0;
    addBtn.hidden = n === 0;
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
    sizes.querySelectorAll('.size-pick').forEach((c) => c.classList.toggle('on', c.dataset.size === (app.bike?.size || app.state.size)));
    const bottleHex = app.bike?.bottleColor?.('st');
    if (bottleHex != null) {
      for (const b of bidons.children) b.classList.toggle('on', Number(b.dataset.hex) === bottleHex);
    }
    paintBikeSum();
    rotBtn.classList.toggle('on', !!app.controls?.autoRotate);
    tunnelBtn.classList.toggle('on', !!document.body.classList.contains('aero-open'));
    // Every change to the bike runs through here, which is exactly when the
    // save CTA needs to reconsider whether there is anything unsaved.
    paintSave();
  }

  // The menu's rigs view reports a delete, a publish or a copied link through
  // the one toast this app has.
  app.toast = notify;

  sync();
  // setSheetCollapsed is the hook for "only one sheet open at a time": the
  // wind tunnel calls it rather than reaching into this panel itself.
  return { sync, setSelected, setHovered, paintSelection, setSheetCollapsed, closeOverlay };
}
