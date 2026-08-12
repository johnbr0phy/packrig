/**
 * The menu system, v2 — the shell and the router.
 *
 * WHAT THIS REPLACES. v1 had two unrelated surfaces: `ui/home.js`, a centred
 * white card with two buttons over a dimmed bike, and `ui/gallery.js`, a
 * top bar plus two arrows plus a floating name plate. They shared no layout,
 * no type ramp and no motion, and both of them put a rectangle in the middle
 * of the one thing the product is for — the bike.
 *
 * THE RULE THAT SHAPES ALL OF THIS: the scene is never covered and never
 * dimmed. Every menu here is a COLUMN down the left with a horizontal
 * readability gradient behind it. The bike sits in the right two thirds, lit,
 * turning, and at every level of the menu it is showing you something real —
 * on the start screen it is a bike, in Loadouts it is the loadout you are
 * reading about, in the Gallery it is the rig whose manifest is on the left.
 * You are never looking at a picture of a menu.
 *
 * THREE LEVELS, ONE SHELL:
 *   start      the root — what this is, and the ways in
 *   rigs       the bikes you have saved, once there are any
 *   loadouts   eight curated rigs, on the bike, with their manifests
 *
 * `loadouts` and `rigs` are the same view (`browse.js`) with different
 * sources, because they are the same act: look at a rig somebody built, read
 * what is on it, take it if you want it. There was a `gallery` — everyone
 * else's rigs — and it is out for now; see the head of browse.js.
 *
 *   initMenu(app, { onBuild }) -> { open, close, go, get view, get isOpen }
 */

import { icon } from './icons.js';
import { renderStart } from './start.js';
import { renderSetup } from './setup.js';
import { initBrowse } from './browse.js';
import { captureRig, applyRig } from '../../rig.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** Views, in the order the tab strip shows them. */
const VIEWS = [
  { id: 'start',    label: 'Start' },
  // Only once there is something in it — see `paintChrome`. A tab reading "My
  // rigs" that opens an empty page is a promise the app has not kept yet.
  { id: 'rigs',     label: 'My rigs', needsRigs: true },
  { id: 'loadouts', label: 'Loadouts' },
];

/** Do we have saved rigs? Synchronous by design — see rigstore's `knownCount`. */
const rigCount = (app) => {
  if (app.auth?.enabled && !app.auth.signedIn) return 0;
  return app.rigs?.knownCount || 0;
};

export function initMenu(app, { onBuild } = {}) {
  const host = document.getElementById('ui-root');
  if (!host) return null;

  const root = el('div', 'pr');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Packrig menu');

  // The gradient is the whole readability strategy, and it is worth being
  // precise about why it is not a scrim. A scrim dims the SCENE to make the UI
  // legible, which in a configurator means dimming the product to show you the
  // controls. This is a horizontal ramp: opaque enough to carry white text at
  // the left edge, gone entirely by 62% across. The bike lives past 62%.
  root.append(el('div', 'pr-veil'));

  // ---- chrome ------------------------------------------------------------
  const head = el('header', 'pr-head');

  const mark = el('button', 'pr-mark');
  mark.type = 'button';
  mark.append(el('span', 'pr-mark-txt', 'PACKRIG'));
  mark.title = 'Back to the start';
  mark.setAttribute('aria-label', 'Back to the start');
  mark.onclick = () => go('start');
  head.append(mark);

  const tabs = el('nav', 'pr-tabs');
  tabs.setAttribute('aria-label', 'Menu sections');
  const tabBtns = new Map();
  for (const v of VIEWS) {
    const b = el('button', 'pr-tab', v.label);
    b.type = 'button';
    b.onclick = () => go(v.id);
    tabs.append(b);
    tabBtns.set(v.id, b);
  }
  head.append(tabs);

  // Leaving the menu is a real destination — the bike as you left it — so it
  // is a labelled control, not a bare ×. It only appears once there is
  // something to go back TO, which `paintChrome` decides.
  const closeBtn = el('button', 'pr-close');
  closeBtn.type = 'button';
  closeBtn.append(el('span', null, 'Close'), icon('close', { size: 18 }));
  closeBtn.title = 'Back to the bike (Esc)';
  closeBtn.onclick = () => close();

  /*
   * Log in, top right, on the front page — where every site anyone has used
   * puts it. It was reachable only from inside the builder, behind a button
   * that said "Sign in" and opened a panel of saved rigs, so the front door
   * was two screens in and led somewhere else.
   */
  const logBtn = el('button', 'pr-login');
  logBtn.type = 'button';
  const logLbl = el('span', 'pr-login-l', 'Log in');
  logBtn.append(logLbl);
  logBtn.onclick = () => app.account?.open();
  function paintLogin() {
    const on = !!app.auth?.signedIn;
    logBtn.hidden = false;
    logBtn.classList.toggle('is-in', on);
    logLbl.textContent = on ? (app.auth.email || 'Account') : 'Log in';
    logBtn.title = on ? 'Your account' : 'Log in so your rigs follow you between devices';
  }
  paintLogin();
  app.auth?.onChange?.(() => {
    paintLogin();
    if (!open_) return;
    // Signing out must not leave you in My rigs staring at someone-on-this-
    // browser's leftover kits. Home has no saved bikes when you are a guest.
    if (view === 'rigs' && !app.auth?.signedIn) go('start');
    else {
      paintChrome();
      if (view === 'start') render();
    }
  });

  head.append(logBtn, closeBtn);

  root.append(head);

  const stage = el('div', 'pr-stage');
  // Changing view swaps the whole stage, which for a screen reader is a page
  // that changed with no announcement and no focus anywhere near the change.
  // `tabindex="-1"` gives us somewhere to put focus that is not a button, so
  // arriving does not paint a focus ring on a control nobody pressed.
  stage.tabIndex = -1;
  stage.setAttribute('aria-live', 'polite');
  root.append(stage);

  host.append(root);

  // ---- state -------------------------------------------------------------
  let view = null;
  let open_ = false;
  let restoreRotate = null;
  // What was on the bike when the menu opened. Browsing loadouts and rigs puts
  // other people's bags on YOUR bike; walking back out has to put yours back,
  // or the menu is a trap that quietly overwrites your work.
  let stash = null;
  let stashDirty = false;
  // Homepage is always the empty bike. keepScene used to leave a saved kit
  // on the hero; that is gone — My rigs holds the copy.
  // False until the first render has happened, so the boot render does not
  // steal focus from the document.
  let moved = false;

  // A loadout waiting to be named. Null means this setup is a bare new bike.
  let pendingAdopt = null;

  const startBuild = () => {
    pendingAdopt = null;
    try { app.clearAll?.(); } catch { /* empty bike is the point */ }
    go('setup');
  };
  const startSurprise = () => { app.__enteredBuilder = true; close({ surprise: true }); };

  const browse = initBrowse(app, {
    // A load that resolves after the menu closes must not mount its rig.
    isLive: () => open_,
    // An empty list offers the one thing worth doing from it.
    onEmptyBuild: startBuild,
    onNew: startBuild,
    // Deleting or publishing changes the list under you; redraw the view.
    onRefresh: () => { if (open_) render(); },
    notify: (msg) => app.toast?.(msg),
    // The bike you walked in with, for `Update from your build` — browsing
    // mounts each rig, so the live bike is not it.
    getWorking: () => stash,
    onAdopt: (item) => {
      // Your own saved rigs are already named and painted. A loadout is
      // becoming yours, so it takes the same setup step as a new build.
      if (item?.own) {
        pendingAdopt = null;
        stashDirty = false;
        stash = null;
        close({ adopted: item });
        return;
      }
      pendingAdopt = item;
      go('setup');
    },
    onDirty: () => { stashDirty = true; },
  });

  function paintChrome() {
    const rigs = rigCount(app);
    for (const [id, b] of tabBtns) {
      const on = id === view;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
      // The rigs tab appears with your first saved rig and never before it.
      const def = VIEWS.find((v) => v.id === id);
      b.hidden = !!def?.needsRigs && !rigs;
    }
    paintLogin();
    // Start and setup are home. Close means "back to the builder" and only
    // belongs on Loadouts / My rigs — even after Surprise me, even with bags
    // still on the bike. A Close on the front page is a door to nowhere.
    closeBtn.hidden = view === 'start' || view === 'setup';
    root.dataset.view = view;
  }

  /**
   * Play the load-in. Rows carry `--i` and the stylesheet turns that into a
   * delay, so the stagger is declarative and a view that adds a row does not
   * have to remember to schedule it.
   */
  function animateIn() {
    stage.classList.remove('in');
    // Two frames, not one: the class has to be absent for a painted frame or
    // the browser coalesces removal and re-addition into no transition at all.
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.add('in')));
  }

  function go(next) {
    if (next !== 'setup' && !VIEWS.some((v) => v.id === next)) next = 'start';
    if (open_ && view === next) return;
    view = next;
    if (!open_) return openInternal();
    render();
  }

  function render() {
    stage.replaceChildren();
    if (view === 'start') {
      pendingAdopt = null;
      // The front door is always the bagless bike. Stash is for Close back
      // into the builder from Loadouts / My rigs, not for this screen.
      try { app.clearAll?.(); } catch { /* empty is the point */ }
      app.ui?.sync?.();
      stage.append(renderStart(app, {
        rigs: rigCount(app),
        onBuild: startBuild,
        onSurprise: startSurprise,
        onRigs: () => go('rigs'),
        onLoadouts: () => go('loadouts'),
      }));
    } else if (view === 'setup') {
      stage.append(renderSetup(app, {
        name: pendingAdopt?.name || '',
        onDone: (setup) => {
          const adopted = pendingAdopt;
          pendingAdopt = null;
          stashDirty = false;
          stash = null;
          close({ build: !adopted, adopted, setup });
        },
      }));
    } else {
      stage.append(browse.render(view));
    }
    paintChrome();
    animateIn();
    // Only when the menu was already open: on first paint the page has just
    // loaded and moving focus would fight the browser's own restoration.
    if (open_ && moved) stage.focus({ preventScroll: true });
    moved = true;
  }

  function restoreStash() {
    if (!stash || !stashDirty) return;
    applyRig(app, stash);
    app.ui?.sync?.();
    stashDirty = false;
  }

  /*
   * The builder underneath is taken out of the page while the menu is over it.
   *
   * `opacity: 0` and `pointer-events: none` hide a panel from the eye and the
   * mouse and leave every button in it in the tab order — so Tab walked
   * straight off the menu into invisible controls, and a screen reader read out
   * a builder that was not on screen. `inert` is the one thing that removes
   * both, and it is put on the individual surfaces rather than on `#ui-root`
   * because the menu is a child of that root and would take itself out too.
   */
  // `.toast` is deliberately NOT in here: the rigs view reports a delete or a
  // publish through it, and an inert toast is an undo button nobody can press.
  const BEHIND = '.panel, .topbar, .viewtools, .hint, .sheet, .save-dock';
  function setBehindInert(on) {
    for (const n of host.querySelectorAll(BEHIND)) n.inert = on;
  }

  function openInternal() {
    open_ = true;
    root.hidden = false;
    host.classList.add('menu-open');
    setBehindInert(true);
    if (app.controls) {
      restoreRotate = app.controls.autoRotate;
      app.controls.autoRotate = true;
    }
    try { stash = captureRig(app, { name: '' }); } catch { stash = null; }
    stashDirty = false;
    void root.offsetWidth;
    root.classList.add('on');
    document.addEventListener('keydown', onKey, true);
    render();
  }

  function open(next = 'start') {
    if (open_) { go(next); return; }
    view = VIEWS.some((v) => v.id === next) ? next : (next === 'setup' ? 'setup' : 'start');
    openInternal();
  }

  function close({ adopted = null, build = false, surprise = false, setup = null } = {}) {
    if (!open_) return;
    // Backing out of the menu without taking anything puts your own bike back.
    // Surprise me / a finished setup are taking something — the stash dies.
    if (!adopted && !surprise && !setup) restoreStash();
    open_ = false;
    browse.cancel();
    stash = null;
    stashDirty = false;
    root.classList.remove('on');
    host.classList.remove('menu-open');
    setBehindInert(false);
    document.removeEventListener('keydown', onKey, true);
    if (app.controls && restoreRotate !== null) {
      app.controls.autoRotate = restoreRotate;
      restoreRotate = null;
    }
    app.__enteredBuilder = true;
    setTimeout(() => { if (!open_) { root.hidden = true; stage.replaceChildren(); } }, 320);
    onBuild?.({ adopted, build, surprise, setup });
  }

  function onKey(e) {
    if (!open_) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      // Escape steps UP a level before it leaves. Leaving from two levels down
      // with one key is how people lose their place.
      if (view !== 'start') go('start');
      else if (!closeBtn.hidden) close();
      return;
    }
    browse.onKey?.(e, view);
  }

  return {
    open, close, go,
    get view() { return view; },
    get isOpen() { return open_; },
  };
}
