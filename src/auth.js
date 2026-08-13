/**
 * Accounts, against Firebase Auth: email + password, and Sign in with Google.
 *
 * WHAT FIREBASE DOES, which is the reason for using it rather than rolling
 * anything: password hashing, the verification email, the reset flow, rate
 * limiting, the Google OAuth dance, and keeping a session alive across tabs and
 * reloads. None of that is reimplemented here and none of it should be. This
 * file never sees a password after it hands it to the SDK, and never stores
 * one.
 *
 * SESSION STORAGE. Firebase persists the session itself, in IndexedDB, and
 * refreshes the ID token in the background. That is a real improvement on the
 * hand-rolled localStorage session this replaced: tokens are no longer sitting
 * in a store that any script on the page can read as plain JSON.
 *
 * POPUP vs REDIRECT for Google. Popup is the better desktop experience — you
 * keep your bike on screen — but iOS Safari and in-app browsers block or lose
 * popups, and this app gets used on a phone. So: try the popup, and fall back
 * to a full-page redirect on exactly the errors that mean "no popup for you".
 * `hydrate()` completes the redirect half on the way back in.
 *
 * The exported surface is unchanged from the Supabase client this replaces, so
 * `rigstore.js` and the account dialogue did not have to move: enabled, user, signedIn,
 * onChange, signUp, signIn, signInWithGoogle, signOut, resetPassword, token,
 * hydrate.
 */

import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
} from 'firebase/auth';

import { backend } from './config.js';

/**
 * Firebase error codes are stable identifiers, not sentences — `auth/
 * wrong-password` is not something to put in front of a person. The default
 * `error.message` is worse than it looks: it appends the raw code in brackets.
 */
const HUMAN = {
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/user-disabled': 'That account has been disabled.',
  'auth/user-not-found': 'No account with that email.',
  'auth/wrong-password': 'Wrong password.',
  'auth/invalid-credential': 'That email and password do not match.',
  'auth/email-already-in-use': 'There is already an account with that email.',
  'auth/weak-password': 'Password needs to be at least six characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Check your network and try again.',
  'auth/popup-closed-by-user': 'Sign-in window closed before finishing.',
  'auth/unauthorized-domain':
    'This site is not on the project’s authorised domains. Add it in Firebase console → Authentication → Settings.',
  'auth/operation-not-allowed':
    'That sign-in method is switched off in the Firebase console → Authentication → Sign-in method.',
};
const humanise = (e) => new Error(HUMAN[e?.code] || e?.message || 'Something went wrong.');

/** The errors that mean "this browser will not give you a popup". */
const POPUP_BLOCKED = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/cancelled-popup-request',
  'auth/web-storage-unsupported',
]);

export function createAuth() {
  const cfg = backend();
  const listeners = new Set();
  let user = null;
  let ready = null;

  let auth = null;
  if (cfg) {
    try {
      auth = getAuth(initializeApp(cfg));
      // One subscription for the lifetime of the page. Firebase fires it on
      // boot with the restored user (or null), which is what makes `hydrate()`
      // a wait rather than a fetch.
      ready = new Promise((resolve) => {
        let first = true;
        onAuthStateChanged(auth, (u) => {
          user = u ? { id: u.uid, email: u.email, name: u.displayName || '', photo: u.photoURL || '' } : null;
          for (const fn of listeners) fn(user);
          if (first) { first = false; resolve(user); }
        });
      });
    } catch (e) {
      // A malformed config should switch accounts OFF, not break the app. The
      // bike and local rigs work without any of this.
      console.warn('[packrig] accounts disabled:', e.message);
      auth = null;
    }
  }

  const api = {
    /** False when no config is present — the UI hides the account panel. */
    get enabled() { return !!auth; },
    get user() { return user; },
    get signedIn() { return !!user; },
    /** ui/account.js shows this. Kept as its own getter because
     *  that file reads `auth.email` directly, and an undefined here degrades
     *  silently to the string "Signed in" rather than erroring. */
    get email() { return user?.email || ''; },
    get photo() { return user?.photo || ''; },
    get name() { return user?.name || ''; },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    async signUp(email, password) {
      try {
        await createUserWithEmailAndPassword(auth, email, password);
        // Firebase signs you straight in, so unlike the previous backend there
        // is no "check your email before you can continue" state to report.
        return { needsConfirmation: false };
      } catch (e) { throw humanise(e); }
    },

    async signIn(email, password) {
      try { await signInWithEmailAndPassword(auth, email, password); }
      catch (e) { throw humanise(e); }
    },

    /**
     * Google. Resolves when signed in via popup; on a browser that refuses
     * popups it starts a full-page redirect and never resolves, because the
     * page is being navigated away — callers must not show a spinner that
     * assumes a return.
     */
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        if (POPUP_BLOCKED.has(e?.code)) {
          await signInWithRedirect(auth, provider);
          return;
        }
        throw humanise(e);
      }
    },

    async signOut() {
      try { await fbSignOut(auth); } catch (e) { throw humanise(e); }
    },

    async resetPassword(email) {
      try { await sendPasswordResetEmail(auth, email); }
      catch (e) { throw humanise(e); }
    },

    /**
     * A current ID token, or null when signed out. Firestore's SDK attaches
     * credentials itself, so nothing in this app needs this any more — it is
     * kept because the store's interface predates the SDK and a future direct
     * REST call would want it.
     */
    async token() {
      if (!auth?.currentUser) return null;
      try { return await auth.currentUser.getIdToken(); } catch { return null; }
    },

    /**
     * Settle the signed-in state on boot: finish a Google redirect if we came
     * back from one, then wait for the first auth event.
     */
    async hydrate() {
      if (!auth) return null;
      try { await getRedirectResult(auth); } catch (e) { console.warn('[packrig] google redirect:', e.code || e.message); }
      await ready;
      return user;
    },
  };
  return api;
}
