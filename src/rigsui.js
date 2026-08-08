/**
 * "My rigs" — save the bike, keep several, load one back, sign in to sync.
 *
 * Deliberately built on the same `.picker` overlay every other secondary
 * surface in the app uses, so it reads as part of the product rather than as a
 * bolted-on account area.
 *
 * SECURITY NOTE, since this file handles the only user-supplied strings in the
 * app: every one of them — rig names, email addresses, error text from the
 * server — goes in through `textContent`. Nothing here builds HTML from a
 * string. `auth.js` stores its tokens in localStorage on the assumption that
 * this stays true.
 */

import { applyRig, rigLitres, rigURL, encodeRig } from './rig.js';

const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;      // never innerHTML — see the note above
  return n;
};

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString();
};

export function initRigsUI(app, { auth, store, host, onLoaded }) {
  let overlay = null;
  let mode = 'list';           // list | signin | signup | reset
  let busy = false;
  let notice = null;           // { kind:'ok'|'bad', text }

  const close = () => {
    overlay?.remove();
    overlay = null;
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  function shell() {
    close();
    const veil = el('div', 'picker-veil');
    const pk = el('div', 'picker glass rigs-picker');
    veil.append(pk);
    veil.onclick = (e) => { if (e.target === veil) close(); };
    document.addEventListener('keydown', onKey);
    host.append(veil);
    overlay = veil;
    return pk;
  }

  const say = (kind, text) => { notice = { kind, text }; render(); };

  async function guard(fn) {
    if (busy) return;
    busy = true; notice = null; render();
    try { await fn(); }
    catch (err) { notice = { kind: 'bad', text: err?.message || 'Something went wrong' }; }
    finally { busy = false; render(); }
  }

  // ---- pieces --------------------------------------------------------------
  function head(pk, title, sub) {
    const h = el('header', 'pk-head');
    const t = el('div', 'pk-title');
    t.append(el('h2', null, title));
    if (sub) t.append(el('p', null, sub));
    h.append(t);
    const x = el('button', 'pk-close', '✕');
    x.title = 'Close';
    x.onclick = close;
    h.append(x);
    pk.append(h);
  }

  function noticeEl() {
    if (!notice) return null;
    return el('div', `rig-notice is-${notice.kind}`, notice.text);
  }

  function accountBar() {
    const bar = el('div', 'rig-account');
    if (!auth.enabled) {
      bar.append(el('span', 'rig-acct-txt', 'Saved on this device'));
      return bar;
    }
    if (auth.signedIn) {
      bar.append(el('span', 'rig-acct-txt', auth.email || 'Signed in'));
      const out = el('button', 'rig-link', 'Sign out');
      out.onclick = () => guard(async () => { await auth.signOut(); mode = 'list'; });
      bar.append(out);
    } else {
      bar.append(el('span', 'rig-acct-txt', 'Saved on this device only'));
      const inBtn = el('button', 'rig-link', 'Sign in to sync');
      inBtn.onclick = () => { mode = 'signin'; notice = null; render(); };
      bar.append(inBtn);
    }
    return bar;
  }

  // ---- list ----------------------------------------------------------------
  async function renderList(pk) {
    head(pk, 'My rigs', auth.signedIn ? 'On your account' : 'Saved in this browser');
    pk.append(accountBar());
    if (store.galleryEnabled) {
      const g = el('div', 'rig-account');
      g.append(el('span', 'rig-acct-txt', 'See what other people are riding'));
      const open = el('button', 'rig-link', 'Browse the gallery');
      open.onclick = () => { mode = 'gallery'; notice = null; render(); };
      g.append(open);
      pk.append(g);
    }
    const n = noticeEl(); if (n) pk.append(n);

    const save = el('div', 'rig-saverow');
    const input = el('input', 'rig-name');
    input.type = 'text';
    input.placeholder = 'Name this build — “Highland overnighter”';
    input.maxLength = 60;
    const btn = el('button', 'rig-save-btn', 'Save current bike');
    const doSave = () => guard(async () => {
      const name = input.value.trim() || 'Untitled rig';
      const bags = Object.keys(app.bags.equipped).length;
      if (!bags) throw new Error('There is nothing on the bike yet');
      await store.save(name);
      input.value = '';
      say('ok', `Saved “${name}”`);
    });
    btn.onclick = doSave;
    input.onkeydown = (e) => { if (e.key === 'Enter') doSave(); };
    save.append(input, btn);
    pk.append(save);

    const body = el('div', 'rig-list');
    pk.append(body);

    let rows = [];
    try { rows = await store.list(); }
    catch (err) { body.append(el('p', 'rig-empty', err?.message || 'Could not load your rigs')); return; }

    if (!rows.length) {
      body.append(el('p', 'rig-empty', 'No saved rigs yet. Build a bike, name it, and hit save.'));
      return;
    }

    for (const row of rows) {
      const card = el('div', 'rig-card');
      const main = el('div', 'rig-main');
      main.append(el('div', 'rig-title', row.name || 'Untitled rig'));
      const bags = row.rig?.bags?.length || 0;
      const l = rigLitres(row.rig, app.catalog);
      main.append(el('div', 'rig-meta',
        `${bags} bag${bags === 1 ? '' : 's'} · ${l.toFixed(1)} L · ${when(row.updated_at)}`));
      card.append(main);

      const acts = el('div', 'rig-acts');

      const load = el('button', 'rig-act is-primary', 'Load');
      load.onclick = () => guard(async () => {
        const { fitted, missing } = applyRig(app, row.rig);
        app.ui?.sync();
        onLoaded?.();
        close();
        // A rig that comes back with fewer bags than it was saved with must say
        // so. Silently dropping one is how somebody concludes we lost it.
        if (missing.length) {
          app.toast?.(`Loaded ${fitted} of ${fitted + missing.length} — ${missing.length} no longer in the catalogue`);
        }
      });

      const overwrite = el('button', 'rig-act', 'Update');
      overwrite.title = 'Replace this rig with the bike as it is now';
      overwrite.onclick = () => guard(async () => {
        await store.update(row.id, { name: row.name });
        say('ok', `Updated “${row.name || 'Untitled rig'}”`);
      });

      const share = el('button', 'rig-act', 'Share');
      share.onclick = () => guard(async () => {
        // A frozen snapshot: the link carries the rig, so your later edits
        // never change what someone else already opened.
        const url = `${location.origin}${location.pathname}?r=${encodeRig(row.rig)}`;
        const ok = await copy(url);
        say(ok ? 'ok' : 'bad', ok ? 'Link copied' : 'Could not copy — select the URL bar instead');
      });

      // Publishing needs shared storage and an account: a gallery is by
      // definition something other people can read.
      let pubBtn = null;
      if (store.galleryEnabled && auth.signedIn && !row.local) {
        const pub = el('button', 'rig-act' + (row.published ? ' is-live' : ''),
          row.published ? 'Published' : 'Publish');
        pub.title = row.published
          ? `In the gallery as “${row.author || 'Anonymous'}” — click to take it down`
          : 'Add this bike to the public gallery';
        pub.onclick = () => {
          if (row.published) {
            guard(async () => {
              await store.setPublished(row.id, false);
              say('ok', `“${row.name || 'Untitled rig'}” is no longer in the gallery`);
            });
            return;
          }
          askAuthor(row);
        };
        pubBtn = pub;
      }

      const del = el('button', 'rig-act is-bad', 'Delete');
      del.onclick = () => guard(async () => {
        if (del.dataset.armed !== '1') {
          del.dataset.armed = '1';
          del.textContent = 'Really?';
          setTimeout(() => { if (del.isConnected) { del.dataset.armed = '0'; del.textContent = 'Delete'; } }, 3000);
          return;
        }
        await store.remove(row.id);
        say('ok', 'Deleted');
      });

      acts.append(load, overwrite, share, ...(pubBtn ? [pubBtn] : []), del);
      card.append(acts);
      body.append(card);
    }
  }

  /**
   * Publishing asks for a display name once and remembers it. It is NOT the
   * account email — an email is the one thing an account holder never chose to
   * make public, and it never appears in the gallery or leaves this device.
   */
  function askAuthor(row) {
    const pk = overlay?.firstElementChild;
    if (!pk) return;
    pk.replaceChildren();
    head(pk, 'Publish to the gallery', `“${row.name || 'Untitled rig'}” will be visible to anyone.`);
    const form = el('form', 'rig-form');
    const who = el('input', 'rig-input');
    who.type = 'text'; who.maxLength = 40; who.placeholder = 'Anonymous';
    who.value = lastAuthor();
    form.append(labelled('Shown as', who));
    form.append(el('p', 'rig-fineprint',
      'Your email is never shown. The bike, its name and this display name are public; '
      + 'you can take it down again at any time.'));
    const go = el('button', 'rig-save-btn is-wide', 'Publish');
    go.type = 'submit';
    form.append(go);
    form.onsubmit = (e) => {
      e.preventDefault();
      const author = who.value.trim().slice(0, 40) || 'Anonymous';
      rememberAuthor(author);
      mode = 'list';
      guard(async () => {
        await store.setPublished(row.id, true, author);
        say('ok', `“${row.name || 'Untitled rig'}” is in the gallery`);
      });
    };
    pk.append(form);
    const alt = el('div', 'rig-alt');
    const back = el('button', 'rig-link', 'Cancel');
    back.onclick = () => { mode = 'list'; render(); };
    alt.append(back);
    pk.append(alt);
    setTimeout(() => who.focus(), 0);
  }

  const AUTHOR_KEY = 'packrig_author';
  const lastAuthor = () => { try { return localStorage.getItem(AUTHOR_KEY) || ''; } catch { return ''; } };
  const rememberAuthor = (v) => { try { localStorage.setItem(AUTHOR_KEY, v); } catch { /* private mode */ } };

  // ---- gallery -------------------------------------------------------------
  async function renderGallery(pk) {
    head(pk, 'Bike gallery', 'Rigs people have published. Load any one and make it yours.');
    const n = noticeEl(); if (n) pk.append(n);

    const back = el('div', 'rig-account');
    back.append(el('span', 'rig-acct-txt', 'Anyone can browse this'));
    const mine = el('button', 'rig-link', 'My rigs');
    mine.onclick = () => { mode = 'list'; notice = null; render(); };
    back.append(mine);
    pk.append(back);

    const body = el('div', 'rig-list');
    pk.append(body);

    let rows = [];
    try { rows = await store.gallery(); }
    catch (err) { body.append(el('p', 'rig-empty', err?.message || 'Could not load the gallery')); return; }

    if (!rows.length) {
      body.append(el('p', 'rig-empty', 'Nothing published yet. Save a bike, then hit Publish — yours would be the first.'));
      return;
    }

    for (const row of rows) {
      const card = el('div', 'rig-card');
      const main = el('div', 'rig-main');
      main.append(el('div', 'rig-title', row.name || 'Untitled rig'));
      const bags = row.rig?.bags?.length || 0;
      const l = rigLitres(row.rig, app.catalog);
      main.append(el('div', 'rig-meta',
        `by ${row.author || 'Anonymous'} · ${bags} bag${bags === 1 ? '' : 's'} · ${l.toFixed(1)} L · ${when(row.published_at)}`));
      card.append(main);

      const acts = el('div', 'rig-acts');
      const load = el('button', 'rig-act is-primary', 'Try this bike');
      load.onclick = () => guard(async () => {
        const { fitted, missing } = applyRig(app, row.rig);
        app.ui?.sync();
        onLoaded?.();
        close();
        if (missing.length) {
          console.warn('[packrig] gallery rig references bags no longer in the catalogue:', missing);
        }
      });
      const share = el('button', 'rig-act', 'Copy link');
      share.onclick = () => guard(async () => {
        const ok = await copy(`${location.origin}${location.pathname}?r=${encodeRig(row.rig)}`);
        say(ok ? 'ok' : 'bad', ok ? 'Link copied' : 'Could not copy');
      });
      acts.append(load, share);
      card.append(acts);
      body.append(card);
    }
  }

  // ---- auth ----------------------------------------------------------------
  function renderAuth(pk) {
    const signup = mode === 'signup';
    const reset = mode === 'reset';
    head(pk,
      reset ? 'Reset your password' : signup ? 'Create an account' : 'Sign in',
      reset ? 'We will email you a link to set a new one.'
        : 'Your rigs follow you between devices.');

    const n = noticeEl(); if (n) pk.append(n);

    const form = el('form', 'rig-form');
    const email = el('input', 'rig-input');
    email.type = 'email'; email.required = true; email.autocomplete = 'email';
    email.placeholder = 'you@example.com';
    form.append(labelled('Email', email));

    let pass = null;
    if (!reset) {
      pass = el('input', 'rig-input');
      pass.type = 'password'; pass.required = true;
      pass.autocomplete = signup ? 'new-password' : 'current-password';
      pass.minLength = 8;
      pass.placeholder = signup ? 'At least 8 characters' : 'Your password';
      form.append(labelled('Password', pass));
    }

    const submit = el('button', 'rig-save-btn is-wide',
      reset ? 'Send reset link' : signup ? 'Create account' : 'Sign in');
    submit.type = 'submit';
    form.append(submit);

    form.onsubmit = (e) => {
      e.preventDefault();
      guard(async () => {
        const addr = email.value.trim();
        if (reset) {
          await auth.resetPassword(addr);
          mode = 'signin';
          notice = { kind: 'ok', text: 'Check your email for the reset link.' };
          return;
        }
        if (signup) {
          const { needsConfirmation } = await auth.signUp(addr, pass.value);
          if (needsConfirmation) {
            mode = 'signin';
            notice = { kind: 'ok', text: 'Account created — confirm the email we just sent, then sign in.' };
            return;
          }
        } else {
          await auth.signIn(addr, pass.value);
        }
        const { pushed } = await store.migrateLocal();
        mode = 'list';
        notice = pushed
          ? { kind: 'ok', text: `Signed in — ${pushed} rig${pushed === 1 ? '' : 's'} from this device moved to your account.` }
          : { kind: 'ok', text: 'Signed in.' };
      });
    };
    pk.append(form);

    const alt = el('div', 'rig-alt');
    if (!reset) {
      const swap = el('button', 'rig-link', signup ? 'I already have an account' : 'Create an account');
      swap.onclick = () => { mode = signup ? 'signin' : 'signup'; notice = null; render(); };
      alt.append(swap);
    }
    if (!signup) {
      const forgot = el('button', 'rig-link', reset ? 'Back to sign in' : 'Forgot your password?');
      forgot.onclick = () => { mode = reset ? 'signin' : 'reset'; notice = null; render(); };
      alt.append(forgot);
    }
    const back = el('button', 'rig-link', 'Back to my rigs');
    back.onclick = () => { mode = 'list'; notice = null; render(); };
    alt.append(back);
    pk.append(alt);

    setTimeout(() => email.focus(), 0);
  }

  function labelled(text, input) {
    const w = el('label', 'rig-field');
    w.append(el('span', 'rig-field-label', text), input);
    return w;
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      try {
        const ta = el('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.append(ta); ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch { return false; }
    }
  }

  function render() {
    if (!overlay) return;
    const pk = overlay.firstElementChild;
    pk.replaceChildren();
    pk.classList.toggle('is-busy', busy);
    if (mode === 'list') renderList(pk);
    else if (mode === 'gallery') renderGallery(pk);
    else renderAuth(pk);
  }

  return {
    open(startMode = 'list') {
      mode = (startMode === 'gallery' && store.galleryEnabled) ? 'gallery'
        : auth.enabled ? startMode : 'list';
      notice = null;
      const pk = shell();
      pk.classList.toggle('is-busy', busy);
      if (mode === 'list') renderList(pk);
      else if (mode === 'gallery') renderGallery(pk);
      else renderAuth(pk);
    },
    close,
    /** Copy a link to the bike as it stands, without saving anything. */
    async shareCurrent() { return copy(rigURL(app)); },
  };
}
