/**
 * Email + password accounts, against Supabase's auth API.
 *
 * WHY NOT THE SDK. `@supabase/supabase-js` is ~120 KB on a bundle this project
 * measures in KB at every build, and the surface actually needed here is five
 * calls: sign up, sign in, sign out, who am I, refresh. This is a thin client
 * over the same HTTP endpoints.
 *
 * WHAT SUPABASE STILL DOES, which is the entire reason for choosing it:
 * password hashing, the verification email, the reset flow, and rate limiting.
 * None of that is reimplemented here and none of it should be. This file never
 * sees a password after it posts it, and never stores one.
 *
 * TOKENS. The access token is short-lived and the refresh token is what keeps
 * you signed in. Both live in localStorage, which is the normal trade for a
 * static site with no server to set an httpOnly cookie: it means a successful
 * XSS could steal a session. Mitigation is that this app injects no untrusted
 * HTML — every user-supplied string goes through `textContent`, never
 * `innerHTML`. If that ever stops being true, this decision needs revisiting.
 */

import { backend } from './config.js';

const KEY = 'packrig_session';

const readSession = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
};
const writeSession = (s) => {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the session simply does not persist */ }
};

export function createAuth() {
  const cfg = backend();
  let session = cfg ? readSession() : null;
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) fn(api.user); };

  async function call(path, { method = 'POST', body, token, headers = {} } = {}) {
    const res = await fetch(`${cfg.url}/auth/v1${path}`, {
      method,
      headers: {
        apikey: cfg.key,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      // Supabase puts the human-readable reason in different fields depending
      // on which part of the stack rejected it.
      const msg = data?.error_description || data?.msg || data?.message || data?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  const store = (s) => {
    session = s && s.access_token ? {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
      user: s.user || null,
    } : null;
    writeSession(session);
    emit();
    return session;
  };

  /** Refresh a little early, so a save never fails on a token that just died. */
  async function fresh() {
    if (!session) return null;
    if (session.expires_at * 1000 - Date.now() > 60_000) return session.access_token;
    try {
      const s = await call('/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } });
      return store(s)?.access_token || null;
    } catch {
      store(null);     // refresh token rejected: the session is genuinely over
      return null;
    }
  }

  const api = {
    get enabled() { return !!cfg; },
    get user() { return session?.user || null; },
    get email() { return session?.user?.email || null; },
    get signedIn() { return !!session?.user; },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /**
     * @returns {{needsConfirmation:boolean}} — with email confirmation switched
     *   on (the default) sign-up returns a user but NO session, and the caller
     *   has to say "check your email" rather than pretending you are in.
     */
    async signUp(email, password) {
      const data = await call('/signup', { body: { email, password } });
      if (data?.access_token) { store(data); return { needsConfirmation: false }; }
      return { needsConfirmation: true };
    },

    async signIn(email, password) {
      const data = await call('/token?grant_type=password', { body: { email, password } });
      store(data);
      return api.user;
    },

    async signOut() {
      const token = await fresh();
      if (token) { try { await call('/logout', { token }); } catch { /* local sign-out matters more */ } }
      store(null);
    },

    async resetPassword(email) {
      await call('/recover', { body: { email } });
    },

    /** A valid access token, refreshed if needed, or null when signed out. */
    token: fresh,

    /** Re-read the user on boot, so a stale profile does not linger. */
    async hydrate() {
      const token = await fresh();
      if (!token) return null;
      try {
        const user = await call('/user', { method: 'GET', token });
        session = { ...session, user };
        writeSession(session);
        emit();
        return user;
      } catch {
        store(null);
        return null;
      }
    },
  };
  return api;
}
