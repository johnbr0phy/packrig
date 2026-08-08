/**
 * Saved rigs — several per person, on this device and, once signed in, on the
 * account.
 *
 * TWO BACKENDS, ONE INTERFACE. Signed out, rigs go to localStorage and the app
 * is fully usable. Signed in, they go to Supabase and follow you between
 * devices. The caller never branches on which; that is the whole point of
 * this file, and it is why signing in does not have to be a wall in front of
 * the product.
 *
 * WHAT HAPPENS TO LOCAL RIGS WHEN YOU SIGN IN. They are uploaded, once, and
 * kept locally as well. Deleting them on sign-in would mean an account on a
 * shared computer quietly eating the rigs of whoever used it before, and
 * uploading them repeatedly would multiply them on every visit — so each local
 * rig carries a `pushed` marker and is only ever sent once.
 */

import { captureRig } from './rig.js';
import { backend } from './config.js';

const LOCAL_KEY = 'packrig_rigs';
const uid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const readLocal = () => {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
};
const writeLocal = (rows) => {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); return true; }
  catch { return false; }   // private mode, or quota
};

export function createRigStore(app, auth) {
  const cfg = backend();

  async function rest(path, { method = 'GET', body, headers = {} } = {}) {
    const token = await auth.token();
    if (!token) throw new Error('Not signed in');
    const res = await fetch(`${cfg.url}/rest/v1${path}`, {
      method,
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: method === 'POST' ? 'return=representation' : 'return=representation',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.message || data?.hint || `Request failed (${res.status})`);
    return data;
  }

  const remote = () => auth.enabled && auth.signedIn;

  const api = {
    get remote() { return remote(); },

    /** Newest first. Shape: { id, name, rig, updated_at, local } */
    async list() {
      if (!remote()) {
        return readLocal()
          .slice()
          .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
          .map((r) => ({ ...r, local: true }));
      }
      const rows = await rest('/rigs?select=id,name,rig,updated_at&order=updated_at.desc');
      return (rows || []).map((r) => ({ ...r, local: false }));
    },

    /** Save the bike as it stands. */
    async save(name) {
      const rig = captureRig(app, { name });
      const now = new Date().toISOString();
      if (!remote()) {
        const rows = readLocal();
        const row = { id: uid(), name, rig, updated_at: now };
        rows.push(row);
        if (!writeLocal(rows)) throw new Error('This browser will not let the app store anything — private mode?');
        return { ...row, local: true };
      }
      const [row] = await rest('/rigs', { method: 'POST', body: { name, rig } });
      return { ...row, local: false };
    },

    /** Overwrite an existing rig with the current bike. */
    async update(id, { name } = {}) {
      const rig = captureRig(app, { name });
      const now = new Date().toISOString();
      if (!remote()) {
        const rows = readLocal();
        const i = rows.findIndex((r) => r.id === id);
        if (i < 0) throw new Error('That rig is no longer here');
        rows[i] = { ...rows[i], name: name ?? rows[i].name, rig, updated_at: now };
        writeLocal(rows);
        return { ...rows[i], local: true };
      }
      const [row] = await rest(`/rigs?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { name, rig, updated_at: now },
      });
      return { ...row, local: false };
    },

    async rename(id, name) {
      if (!remote()) {
        const rows = readLocal();
        const i = rows.findIndex((r) => r.id === id);
        if (i < 0) return null;
        rows[i] = { ...rows[i], name, updated_at: new Date().toISOString() };
        writeLocal(rows);
        return { ...rows[i], local: true };
      }
      const [row] = await rest(`/rigs?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', body: { name, updated_at: new Date().toISOString() },
      });
      return row;
    },

    async remove(id) {
      if (!remote()) {
        writeLocal(readLocal().filter((r) => r.id !== id));
        return;
      }
      await rest(`/rigs?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    /**
     * Send this device's rigs up to the account, once each. Called after a
     * successful sign-in. Failures are swallowed on purpose — a sync problem
     * must not stop somebody signing in, and the local copy is still there.
     */
    async migrateLocal() {
      if (!remote()) return { pushed: 0 };
      const rows = readLocal();
      const todo = rows.filter((r) => !r.pushed);
      if (!todo.length) return { pushed: 0 };
      let pushed = 0;
      for (const r of todo) {
        try {
          await rest('/rigs', { method: 'POST', body: { name: r.name || 'Untitled', rig: r.rig } });
          r.pushed = true;
          pushed++;
        } catch { /* leave it unpushed; it will try again next sign-in */ }
      }
      writeLocal(rows);
      return { pushed };
    },

    /** Only meaningful signed out — signed in, the account is the count. */
    localCount: () => readLocal().length,
  };
  return api;
}
