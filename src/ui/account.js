/**
 * Signing in, and the account once you are in.
 *
 * WHY THIS IS A DIALOGUE, when nothing else in this app is one. Every other
 * surface here is a column beside the bike, because every other surface is
 * ABOUT the bike — you are meant to keep looking at it. A sign-in is not about
 * the bike. It is a short, modal errand with two fields and a Google button,
 * and the thing people know how to do with one is fill it in and get out. So
 * it is what the owner asked for in as many words: "a normal kind of login
 * window with email password and Google login".
 *
 * WHAT MOVED HERE. `rigsui.js` used to hold this form inside the same sheet
 * that held saved rigs, the gallery and the publish flow — so signing in and
 * finding last week's bike were the same surface, and pressing your own email
 * address in the top bar was how you reached your rigs. Rigs now live in the
 * menu (`ui/v2/menu.js` → the `rigs` view). This file is only the account:
 * sign in, sign up, reset, sign out.
 *
 * SECURITY. Every user-supplied string goes in through `textContent`. The
 * password is handed straight to `auth.js` and never stored, logged or echoed.
 *
 *   initAccount(app, { auth, store, host, onChange }) -> { open, close }
 */

const el = (t, c, txt) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (txt != null) n.textContent = txt;     // never innerHTML — see the note above
  return n;
};

export function initAccount(app, { auth, store, host, onChange } = {}) {
  let scrim = null;
  let card = null;
  let mode = 'signin';          // signin | signup | reset | account
  let busy = false;
  let notice = null;            // { kind:'ok'|'bad', text }
  let lastFocus = null;

  function close() {
    if (!scrim) return;
    scrim.classList.remove('on');
    const dead = scrim;
    scrim = null;
    card = null;
    notice = null;
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => dead.remove(), 200);
    lastFocus?.focus?.({ preventScroll: true });
    lastFocus = null;
  }

  function onKey(e) {
    if (e.key !== 'Escape' || !scrim) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }

  async function guard(fn) {
    if (busy) return;
    busy = true; notice = null; render();
    try { await fn(); }
    catch (err) { notice = { kind: 'bad', text: err?.message || 'Something went wrong' }; }
    finally { busy = false; render(); onChange?.(); }
  }

  function labelled(text, input) {
    const w = el('label', 'ac-field');
    w.append(el('span', 'ac-field-label', text), input);
    return w;
  }

  // ---- the signed-in state -------------------------------------------------
  function renderAccount() {
    card.append(el('h2', 'ac-title', 'Your account'));
    card.append(el('p', 'ac-who', auth.email || 'Signed in'));
    // The one sentence that earns its space: it says what the account is FOR,
    // which is the only thing about it anybody needs to know.
    card.append(el('p', 'ac-note', 'Your rigs are on this account and follow you between devices.'));
    if (notice) card.append(el('div', `ac-notice is-${notice.kind}`, notice.text));

    const mine = el('button', 'ac-btn is-primary', 'My rigs');
    mine.type = 'button';
    mine.onclick = () => { close(); app.menu?.open('rigs'); };
    card.append(mine);

    const out = el('button', 'ac-btn', 'Sign out');
    out.type = 'button';
    out.onclick = () => guard(async () => {
      await auth.signOut();
      mode = 'signin';
      notice = { kind: 'ok', text: 'Signed out.' };
    });
    card.append(out);
  }

  // ---- signing in ----------------------------------------------------------
  function renderAuth() {
    const signup = mode === 'signup';
    const reset = mode === 'reset';

    card.append(el('h2', 'ac-title',
      reset ? 'Reset your password' : signup ? 'Create an account' : 'Log in'));
    card.append(el('p', 'ac-note', reset
      ? 'We will email you a link to set a new one.'
      : 'So your rigs follow you between devices.'));

    if (notice) card.append(el('div', `ac-notice is-${notice.kind}`, notice.text));

    // Google first on the page, because it is the path most people take and
    // the one with nothing to type. The email form keeps the keyboard order
    // below it.
    if (!reset && auth.signInWithGoogle) {
      const g = el('button', 'ac-btn is-google');
      g.type = 'button';
      // Google's mark, inline: the strict-CSP artifact build blocks every
      // external image.
      g.innerHTML = '<svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">'
        + '<path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"/>'
        + '<path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"/>'
        + '<path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z"/>'
        + '<path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3L15 2.3A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/>'
        + '</svg>';
      g.append(document.createTextNode('Continue with Google'));
      g.onclick = () => guard(async () => {
        await auth.signInWithGoogle();
        // On a browser that refused the popup this never runs — the page has
        // already gone to Google and `hydrate()` finishes the job on the way
        // back. Nothing here may assume a return.
        await afterSignIn();
      });
      card.append(g, el('div', 'ac-or', 'or'));
    }

    const form = el('form', 'ac-form');
    const email = el('input', 'ac-input');
    email.type = 'email'; email.required = true; email.autocomplete = 'email';
    email.placeholder = 'you@example.com';
    form.append(labelled('Email', email));

    let pass = null;
    if (!reset) {
      pass = el('input', 'ac-input');
      pass.type = 'password'; pass.required = true;
      pass.autocomplete = signup ? 'new-password' : 'current-password';
      pass.minLength = 8;
      pass.placeholder = signup ? 'At least 8 characters' : 'Your password';
      form.append(labelled('Password', pass));
    }

    const submit = el('button', 'ac-btn is-primary',
      reset ? 'Send reset link' : signup ? 'Create account' : 'Log in');
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
            notice = { kind: 'ok', text: 'Account created — confirm the email we just sent, then log in.' };
            return;
          }
        } else {
          await auth.signIn(addr, pass.value);
        }
        await afterSignIn();
      });
    };
    card.append(form);

    const alt = el('div', 'ac-alt');
    if (!reset) {
      const swap = el('button', 'ac-link', signup ? 'I already have an account' : 'Create an account');
      swap.type = 'button';
      swap.onclick = () => { mode = signup ? 'signin' : 'signup'; notice = null; render(); };
      alt.append(swap);
    }
    if (!signup) {
      const forgot = el('button', 'ac-link', reset ? 'Back to log in' : 'Forgot your password?');
      forgot.type = 'button';
      forgot.onclick = () => { mode = reset ? 'signin' : 'reset'; notice = null; render(); };
      alt.append(forgot);
    }
    card.append(alt);

    setTimeout(() => email.focus(), 0);
  }

  /** Local rigs ride up to the account on the way in. */
  async function afterSignIn() {
    const { pushed } = (await store?.migrateLocal?.()) || { pushed: 0 };
    mode = 'account';
    notice = pushed
      ? { kind: 'ok', text: `Logged in — ${pushed} rig${pushed === 1 ? '' : 's'} from this device moved to your account.` }
      : null;
  }

  function render() {
    if (!card) return;
    card.replaceChildren();
    card.classList.toggle('is-busy', busy);

    const x = el('button', 'ac-close');
    x.type = 'button';
    x.title = 'Close';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">'
      + '<path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.6" '
      + 'stroke-linecap="round"/></svg>';
    x.onclick = () => close();
    card.append(x);

    if (mode === 'account' && auth?.signedIn) renderAccount();
    else renderAuth();
  }

  /**
   * `open()` with no argument does the right thing from either state: the
   * account when there is one, the log-in form when there is not.
   */
  function open(next) {
    if (!auth?.enabled) return;
    mode = next || (auth.signedIn ? 'account' : 'signin');
    if (mode === 'account' && !auth.signedIn) mode = 'signin';
    if (scrim) { render(); return; }
    lastFocus = document.activeElement;
    scrim = el('div', 'ac-scrim');
    card = el('div', 'ac-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Account');
    scrim.append(card);
    // Pressing the surround is the other way out of a dialogue, and it must
    // not fire on a drag that STARTED inside the card and ended outside it.
    scrim.onmousedown = (e) => { if (e.target === scrim) close(); };
    (host || document.getElementById('ui-root')).append(scrim);
    document.addEventListener('keydown', onKey, true);
    void scrim.offsetWidth;
    scrim.classList.add('on');
    render();
  }

  return { open, close, get isOpen() { return !!scrim; } };
}
