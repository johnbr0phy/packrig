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
  let pk = null;               // the body this panel draws into, or null when shut
  let handle = null;           // the sheet shell holding it
  let mode = 'list';           // list | signin | signup | reset
  let busy = false;
  let notice = null;           // { kind:'ok'|'bad', text }

  /*
   * REDESIGN.md phase 1. This used to build its own `.picker-veil` — a second,
   * unrelated overlay system sitting beside the one in `ui.js`, each unaware of
   * the other, so two surfaces could be open at once over the same bike. Both
   * now hand their body to the single shell in `ui/sheet.js`, which owns
   * Escape, the close button, the camera reframe and the one-at-a-time rule.
   */
  const close = () => { app.sheets?.closeSheet(); };

  function shell() {
    pk = el('div', 'picker rigs-picker');
    handle = app.openSheet?.({
      kind: 'detail',
      title: '',
      render: (body) => body.append(pk),
      onClose: () => { pk = null; handle = null; },
    });
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
  /**
   * `sub` is deliberately rare now. REDESIGN.md §1.1: a title needs no subtitle
   * unless the subtitle carries data the screen does not already show.
   */
  function head(pk, title, sub) {
    handle?.setTitle(title);
    if (!sub) return;
    const h = el('header', 'pk-head');
    const t = el('div', 'pk-title');
    t.append(el('p', null, sub));
    h.append(t);
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
    // The account bar below already says "Saved on this device". Saying it again
  // as the sheet's subtitle, in tracked caps, forty pixels above, is the same
  // sentence in two voices.
  head(pk, 'My rigs', '');
    pk.append(accountBar());
    if (store.galleryEnabled) {
      const g = el('div', 'rig-account');
      const open = el('button', 'rig-link', 'Gallery');
      open.onclick = () => { mode = 'gallery'; notice = null; render(); };
      g.append(open);
      pk.append(g);
    }
    const n = noticeEl(); if (n) pk.append(n);

    const save = el('div', 'rig-saverow');
    const input = el('input', 'rig-name');
    input.type = 'text';
    input.placeholder = 'Name this rig';
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
      body.append(el('p', 'rig-empty', 'No saved rigs yet'));
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
    head(pk, 'Gallery');
    const n = noticeEl(); if (n) pk.append(n);

    const back = el('div', 'rig-account');
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
      body.append(el('p', 'rig-empty', 'Nothing published yet'));
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
    pk.append(form);

    // Google, above the email form on first sight but appended after it so the
    // email field keeps keyboard focus order. Hidden on the reset screen, where
    // it would be meaningless: a Google account has no password here to reset.
    if (!reset && auth.signInWithGoogle) {
      const or = el('div', 'rig-or', 'or');
      const g = el('button', 'rig-save-btn is-wide is-google');
      g.type = 'button';
      // Google's mark, inline so it survives the strict-CSP artifact build,
      // which blocks every external image.
      g.innerHTML = '<svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">'
        + '<path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"/>'
        + '<path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"/>'
        + '<path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z"/>'
        + '<path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/>'
        + '</svg>';
      g.append(document.createTextNode('Continue with Google'));
      g.onclick = () => guard(async () => {
        await auth.signInWithGoogle();
        // On a browser that refused the popup this never runs — the page has
        // already navigated to Google and `hydrate()` finishes the job on the
        // way back. Nothing here may assume a return.
        const { pushed } = await store.migrateLocal();
        mode = 'list';
        notice = pushed
          ? { kind: 'ok', text: `Signed in — ${pushed} rig${pushed === 1 ? '' : 's'} from this device moved to your account.` }
          : { kind: 'ok', text: 'Signed in.' };
      });
      pk.append(or, g);
    }

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
    if (!pk) return;
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
      shell();
      if (!pk) return;
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
